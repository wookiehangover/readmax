import type { BookChapter } from "~/lib/epub/epub-text-extract";
import { requireAuth } from "~/lib/database/auth-middleware";
import { getBookByIdForUser } from "~/lib/database/book/book";
import { mergeBookChapters, upsertBookChapters } from "~/lib/database/book/book-chapters";
import { getPool } from "~/lib/database/pool";

interface UploadChaptersBody {
  uploadId: string;
  chunkIndex: number;
  totalChunks: number;
  totalChapters: number;
  chapters: BookChapter[];
  format?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function hasValidChapterIndex(value: unknown): value is BookChapter {
  return isRecord(value) && isNonNegativeInteger(value.index);
}

function parseUploadBody(body: unknown): { body: UploadChaptersBody } | { error: string } {
  if (!isRecord(body)) {
    return { error: "body must be an object" };
  }

  if (typeof body.uploadId !== "string" || body.uploadId.length === 0) {
    return { error: "uploadId must be a non-empty string" };
  }
  if (!isNonNegativeInteger(body.chunkIndex)) {
    return { error: "chunkIndex must be a non-negative integer" };
  }
  if (!isPositiveInteger(body.totalChunks)) {
    return { error: "totalChunks must be a positive integer" };
  }
  if (body.chunkIndex >= body.totalChunks) {
    return { error: "chunkIndex must be less than totalChunks" };
  }
  if (!isNonNegativeInteger(body.totalChapters)) {
    return { error: "totalChapters must be a non-negative integer" };
  }
  if (!Array.isArray(body.chapters)) {
    return { error: "chapters must be an array" };
  }
  if (body.chapters.some((chapter) => !hasValidChapterIndex(chapter))) {
    return { error: "each chapter must include a non-negative integer index" };
  }
  if (body.chapters.length > body.totalChapters) {
    return { error: "chapters length cannot exceed totalChapters" };
  }
  if (body.format !== undefined && typeof body.format !== "string") {
    return { error: "format must be a string when provided" };
  }

  const chapters = body.chapters as BookChapter[];

  return {
    body: {
      uploadId: body.uploadId,
      chunkIndex: body.chunkIndex,
      totalChunks: body.totalChunks,
      totalChapters: body.totalChapters,
      chapters,
      format: typeof body.format === "string" ? body.format : undefined,
    },
  };
}

function chapterCount(chapters: unknown): number {
  return Array.isArray(chapters) ? chapters.length : 0;
}

/**
 * POST /api/books/:bookId/chapters
 *
 * Upserts extracted chapter text for a (userId, bookId) pair.
 * Called by the client once per book on first open, so the server can
 * reuse the cached chapters on subsequent chat requests.
 *
 * Body: { uploadId, chunkIndex, totalChunks, totalChapters, chapters, format? }
 */
export async function action({
  request,
  params,
}: {
  request: Request;
  params: { bookId: string };
}) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "Sync not configured" }, { status: 503 });
  }

  const { userId } = await requireAuth(request);

  const bookId = params.bookId;
  if (!bookId) {
    return Response.json({ error: "bookId is required" }, { status: 400 });
  }

  // Verify the book belongs to the user
  const book = await getBookByIdForUser(bookId, userId);
  if (!book) {
    return Response.json({ error: "Book not found" }, { status: 404 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseUploadBody(rawBody);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }
  const { body } = parsed;

  const row =
    body.chunkIndex === 0
      ? await upsertBookChapters(userId, bookId, body.chapters)
      : await mergeChapterUploadChunk(userId, bookId, body.chapters);

  return Response.json({
    ok: true,
    bookId,
    uploadId: body.uploadId,
    chunkIndex: body.chunkIndex,
    totalChunks: body.totalChunks,
    totalChapters: body.totalChapters,
    chapterCount: chapterCount(row?.chapters),
    extractedAt: row?.extractedAt ?? null,
  });
}

async function mergeChapterUploadChunk(
  userId: string,
  bookId: string,
  chapters: BookChapter[],
) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const row = await mergeBookChapters(client, userId, bookId, chapters);
    await client.query("COMMIT");
    return row;
  } catch (err) {
    await client.query("ROLLBACK").catch(console.error);
    throw err;
  } finally {
    client.release();
  }
}
