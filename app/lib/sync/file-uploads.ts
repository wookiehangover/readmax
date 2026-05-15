import { get, set, entries } from "idb-keyval";
import { recordChange } from "./change-log";
import { getBookStore, getBookDataStore } from "./stores";
import { syncDebugLog } from "./sync-debug";
import {
  clearUploadRetry,
  recordUploadFailure,
  runUploadWithRetry,
  shouldAttemptUpload,
  uploadRetryKey,
  type UploadRetryEntry,
} from "./upload-retry";

/**
 * Shared state + callbacks required by the file-upload helpers. The retry
 * Map is owned by the sync engine (one per engine instance) and threaded
 * through so a given book's backoff survives across `uploadPendingFiles`
 * and `reloadBookFiles` invocations.
 */
export interface FileUploadContext {
  /** Authenticated user ID. Uploads are rejected until this is known. */
  readonly userId: string;
  /** Per-book exponential-backoff state, keyed by `${bookId}:${type}`. */
  readonly uploadRetryState: Map<string, UploadRetryEntry>;
  /** Invoked when the upload handshake returns 401. */
  readonly onAuthExpired?: () => void;
}

type BookFileFormat = "epub" | "pdf";

function makeUploadError(status: number, message: string): Error {
  const err = new Error(message);
  if (status === 401 || status === 403) err.name = "UploadAccessError";
  else if (status === 413) err.name = "UploadFileTooLargeError";
  else if (status === 415) err.name = "UploadContentTypeNotAllowedError";
  else if (status === 408 || status === 429 || status >= 500) err.name = "UploadServerError";
  else err.name = "UploadPermanentError";
  return err;
}

function contentTypeForUpload(
  data: ArrayBuffer | Blob,
  type: "file" | "cover",
  format: BookFileFormat,
): string {
  if (data instanceof Blob && data.type) return data.type;
  if (type === "cover") return "image/jpeg";
  return format === "pdf" ? "application/pdf" : "application/epub+zip";
}

export async function uploadFile(
  ctx: FileUploadContext,
  bookId: string,
  data: ArrayBuffer | Blob,
  type: "file" | "cover",
  format: BookFileFormat = "epub",
): Promise<string | null> {
  const contentType = contentTypeForUpload(data, type, format);
  const blob = data instanceof Blob ? data : new Blob([data], { type: contentType });

  const result = await runUploadWithRetry(
    async () => {
      const res = await fetch(
        `/api/sync/files/upload?bookId=${encodeURIComponent(bookId)}&type=${type}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": contentType },
          body: blob,
        },
      );

      const payload = (await res.json().catch(() => null)) as {
        url?: unknown;
        error?: unknown;
      } | null;
      if (!res.ok) {
        const message =
          typeof payload?.error === "string" ? payload.error : `Upload failed: ${res.status}`;
        throw makeUploadError(res.status, message);
      }
      if (typeof payload?.url !== "string") {
        throw makeUploadError(502, "Upload response did not include a storage URL");
      }
      return { url: payload.url };
    },
    {
      onAuthExpired: () => ctx.onAuthExpired?.(),
      onTransientRetry: (attempt, delayMs, err) => {
        console.warn(
          `[sync] File upload transient error for ${bookId} (${type}), attempt ${attempt}, retrying in ${delayMs}ms:`,
          err,
        );
      },
      onGiveUp: (err, totalAttempts) => {
        console.error(
          `[sync] File upload giving up for ${bookId} (${type}) after ${totalAttempts} transient failures:`,
          err,
        );
      },
      onPermanentFailure: (err) => {
        console.error(`[sync] File upload failed for ${bookId} (${type}):`, err);
      },
    },
  );

  return result?.url ?? null;
}

/**
 * Wrapper around {@link uploadFile} that enforces the per-book exponential
 * backoff. On success the retry state for this book+type is cleared; on
 * failure (null return) the next-attempt timestamp is pushed forward along
 * the `UPLOAD_BACKOFF_SCHEDULE_MS` schedule.
 */
export async function uploadFileWithBackoff(
  ctx: FileUploadContext,
  bookId: string,
  data: ArrayBuffer | Blob,
  type: "file" | "cover",
  format: BookFileFormat = "epub",
): Promise<string | null> {
  const key = uploadRetryKey(bookId, type);
  const decision = shouldAttemptUpload(ctx.uploadRetryState, key, Date.now());
  if (!decision.attempt) {
    syncDebugLog("upload-skipped", {
      bookId,
      type,
      retryInMs: decision.retryInMs,
    });
    return null;
  }
  const size = data instanceof Blob ? data.size : data.byteLength;
  syncDebugLog("upload-attempt", { bookId, type, size });
  const url = await uploadFile(ctx, bookId, data, type, format);
  if (url) {
    clearUploadRetry(ctx.uploadRetryState, key);
    syncDebugLog("upload-success", { bookId, type, size });
  } else {
    recordUploadFailure(ctx.uploadRetryState, key, Date.now());
    syncDebugLog("upload-failed", { bookId, type, size });
  }
  return url;
}

/**
 * Scan all books in IDB and upload any that have local file data or cover
 * images but are missing their remote storage references. Runs asynchronously
 * after metadata push — failures are logged but don't block the sync cycle.
 */
export async function uploadPendingFiles(
  ctx: FileUploadContext,
  options?: { isStopped?: () => boolean },
): Promise<void> {
  if (options?.isStopped?.()) return;
  // Safety: never attempt uploads before userId is known.
  if (!ctx.userId) return;

  const bookStore = getBookStore();
  const dataStore = getBookDataStore();
  const allBooks = await entries<string, Record<string, unknown>>(bookStore);

  syncDebugLog("upload-pending-start", { bookCount: allBooks.length });

  for (const entry of allBooks) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const bookId = entry[0];
    const meta = entry[1];
    if (!meta || typeof meta !== "object" || meta.deletedAt) continue;

    // Upload epub file if missing remoteFileUrl
    if (!meta.remoteFileUrl) {
      const fileData = await get<ArrayBuffer>(bookId, dataStore);
      if (fileData) {
        const format = meta.format === "pdf" ? "pdf" : "epub";
        const url = await uploadFileWithBackoff(ctx, bookId, fileData, "file", format);
        if (url) {
          const stamped = {
            ...meta,
            remoteFileUrl: url,
            hasLocalFile: true,
            updatedAt: Date.now(),
          };
          await set(bookId, stamped, bookStore);
          // Enqueue a book change so the R2 storage reference is carried to the
          // server on the next push. The upload endpoint writes it immediately,
          // but this remains the authoritative sync persistence path.
          recordChange({
            entity: "book",
            entityId: bookId,
            operation: "put",
            data: stamped,
            timestamp: stamped.updatedAt,
          }).catch(console.error);
        }
      }
    }

    // Upload cover image if missing remoteCoverUrl. Once any remote URL
    // is recorded, the cover is not re-uploaded on subsequent sync cycles;
    // private covers are served via the proxy fallback.
    const existingCoverUrl =
      typeof meta.remoteCoverUrl === "string" ? meta.remoteCoverUrl : undefined;
    const needsCoverUpload = meta.coverImage instanceof Blob && !existingCoverUrl;
    if (needsCoverUpload) {
      const url = await uploadFileWithBackoff(ctx, bookId, meta.coverImage as Blob, "cover");
      if (url) {
        // Re-read in case the file upload above already updated meta
        const current = (await get<Record<string, unknown>>(bookId, bookStore)) ?? meta;
        const stamped = {
          ...current,
          remoteCoverUrl: url,
          hasLocalFile: true,
          updatedAt: Date.now(),
        };
        await set(bookId, stamped, bookStore);
        recordChange({
          entity: "book",
          entityId: bookId,
          operation: "put",
          data: stamped,
          timestamp: stamped.updatedAt,
        }).catch(console.error);
      }
    }
  }

  // Notify UI so book list re-renders without stale cloud icons
  if (typeof window !== "undefined") {
    queueMicrotask(() => {
      window.dispatchEvent(new CustomEvent("sync:entity-updated", { detail: { entity: "book" } }));
    });
  }
}

/**
 * Re-download file + cover for a single book from the server, overwriting
 * the locally cached copies. If the book is missing `remoteFileUrl` or
 * `remoteCoverUrl`, upload the local file / cover to R2 storage so the
 * DB row gets populated (same logic as {@link uploadPendingFiles}, but
 * scoped to one book).
 */
export async function reloadBookFiles(ctx: FileUploadContext, bookId: string): Promise<void> {
  if (!ctx.userId) return;

  const bookStore = getBookStore();
  const dataStore = getBookDataStore();

  const rawMeta = await get<Record<string, unknown>>(bookId, bookStore);
  if (!rawMeta || typeof rawMeta !== "object" || rawMeta.deletedAt) return;

  syncDebugLog("reload-start", { bookId });

  let meta: Record<string, unknown> = { ...rawMeta };
  let metaChanged = false;

  // --- File ---
  if (meta.remoteFileUrl) {
    try {
      const res = await fetch(
        `/api/sync/files/download?bookId=${encodeURIComponent(bookId)}&type=file`,
        { credentials: "include" },
      );
      if (res.ok) {
        const buf = await res.arrayBuffer();
        await set(bookId, buf, dataStore);
        if (!meta.hasLocalFile) {
          meta = { ...meta, hasLocalFile: true };
          metaChanged = true;
        }
      } else {
        console.error(`[sync] reload file download failed: ${res.status} ${res.statusText}`);
      }
    } catch (err) {
      console.error("[sync] reload file download failed:", err);
    }
  } else {
    const fileData = await get<ArrayBuffer>(bookId, dataStore);
    if (fileData) {
      const format = meta.format === "pdf" ? "pdf" : "epub";
      const url = await uploadFileWithBackoff(ctx, bookId, fileData, "file", format);
      if (url) {
        meta = {
          ...meta,
          remoteFileUrl: url,
          hasLocalFile: true,
          updatedAt: Date.now(),
        };
        metaChanged = true;
        recordChange({
          entity: "book",
          entityId: bookId,
          operation: "put",
          data: meta,
          timestamp: meta.updatedAt as number,
        }).catch(console.error);
      }
    }
  }

  // --- Cover ---
  // Re-upload covers that are missing a remote URL, provided we have the
  // local blob to source from. Otherwise fall back to downloading the
  // existing remote copy (the proxy handles private URLs for users
  // without a local blob).
  const existingCoverUrl =
    typeof meta.remoteCoverUrl === "string" ? meta.remoteCoverUrl : undefined;
  const needsCoverUpload = meta.coverImage instanceof Blob && !existingCoverUrl;
  if (needsCoverUpload) {
    const url = await uploadFileWithBackoff(ctx, bookId, meta.coverImage as Blob, "cover");
    if (url) {
      meta = {
        ...meta,
        remoteCoverUrl: url,
        hasLocalFile: true,
        updatedAt: Date.now(),
      };
      metaChanged = true;
      recordChange({
        entity: "book",
        entityId: bookId,
        operation: "put",
        data: meta,
        timestamp: meta.updatedAt as number,
      }).catch(console.error);
    }
  } else if (existingCoverUrl) {
    try {
      const res = await fetch(
        `/api/sync/files/download?bookId=${encodeURIComponent(bookId)}&type=cover`,
        { credentials: "include" },
      );
      if (res.ok) {
        const blob = await res.blob();
        meta = { ...meta, coverImage: blob };
        metaChanged = true;
      } else {
        console.error(`[sync] reload cover download failed: ${res.status} ${res.statusText}`);
      }
    } catch (err) {
      console.error("[sync] reload cover download failed:", err);
    }
  }

  if (metaChanged) {
    await set(bookId, meta, bookStore);
  }

  syncDebugLog("reload-end", { bookId, metaChanged });

  if (typeof window !== "undefined") {
    queueMicrotask(() => {
      window.dispatchEvent(new CustomEvent("sync:entity-updated", { detail: { entity: "book" } }));
    });
  }
}
