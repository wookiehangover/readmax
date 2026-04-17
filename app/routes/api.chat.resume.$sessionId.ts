import { waitUntil } from "@vercel/functions";
import { UI_MESSAGE_STREAM_HEADERS } from "ai";
import { createResumableStreamContext } from "resumable-stream";
import { requireAuth } from "~/lib/database/auth-middleware";
import { getSessionByIdForUser } from "~/lib/database/chat/chat-session";

/**
 * GET /api/chat/resume/:sessionId
 *
 * Resumes an in-flight chat stream by session id. Used by the client after a
 * disconnect or reload to pick the server-side SSE back up where it left off.
 *
 * - 401 if unauthenticated.
 * - 404 if the session does not exist or belongs to another user.
 * - 204 if the session has no `active_stream_id` (nothing to resume).
 * - Otherwise returns the resumed UI message stream with the standard headers.
 */
export async function loader({
  request,
  params,
}: {
  request: Request;
  params: { sessionId: string };
}) {
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "Sync not configured" }, { status: 503 });
  }

  const { userId } = await requireAuth(request);

  const session = await getSessionByIdForUser(params.sessionId, userId);
  if (!session) {
    return new Response("Not found", { status: 404 });
  }

  if (session.activeStreamId == null) {
    return new Response(null, { status: 204 });
  }

  const streamContext = createResumableStreamContext({ waitUntil });

  return new Response(await streamContext.resumeExistingStream(session.activeStreamId), {
    headers: UI_MESSAGE_STREAM_HEADERS,
  });
}
