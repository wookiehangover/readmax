import { createStore, entries, get, set } from "idb-keyval";
import type { UseStore } from "idb-keyval";
import { computeFileHash } from "~/lib/book-hash";
import type { BookMeta } from "~/lib/stores/book-store";
import { recordChange } from "./change-log";

const BACKFILL_FLAG_KEY = "readmax:file-hash-backfill:v1";

let _bookStore: UseStore | null = null;
let _bookDataStore: UseStore | null = null;

function getBookStore(): UseStore {
  if (!_bookStore) _bookStore = createStore("ebook-reader-db", "books");
  return _bookStore;
}

function getBookDataStore(): UseStore {
  if (!_bookDataStore) _bookDataStore = createStore("ebook-reader-book-data", "book-data");
  return _bookDataStore;
}

/**
 * One-time migration that hashes every locally stored book file and writes the
 * resulting `fileHash` back to its meta record. Each successful update also
 * enqueues a `book` change so the server receives the hash on the next push,
 * which lets server-side dedup converge pre-existing duplicate rows.
 *
 * Gated on a localStorage flag so it runs at most once per device. Tolerant of
 * per-book errors: a failure on one book is logged and the loop continues.
 */
export async function runFileHashBackfillIfNeeded(): Promise<void> {
  if (typeof localStorage === "undefined") return;
  if (localStorage.getItem(BACKFILL_FLAG_KEY)) return;

  const bookStore = getBookStore();
  const bookDataStore = getBookDataStore();

  let allEntries: Array<[IDBValidKey, unknown]>;
  try {
    allEntries = await entries(bookStore);
  } catch (err) {
    console.error("[backfill-file-hash] Failed to read book store:", err);
    return;
  }

  let updated = 0;
  for (const [id, raw] of allEntries) {
    const meta = raw as BookMeta | undefined;
    if (!meta || typeof meta !== "object") continue;
    if (!meta.hasLocalFile) continue;
    if (meta.fileHash) continue;

    try {
      const data = await get<ArrayBuffer>(id, bookDataStore);
      if (!data) continue;

      const fileHash = await computeFileHash(data);
      const stamped: BookMeta = { ...meta, fileHash, updatedAt: Date.now() };
      await set(id, stamped, bookStore);
      await recordChange({
        entity: "book",
        entityId: meta.id,
        operation: "put",
        data: stamped,
        timestamp: stamped.updatedAt!,
      });
      updated++;
    } catch (err) {
      console.error(`[backfill-file-hash] Failed to backfill book ${String(id)}:`, err);
    }
  }

  try {
    localStorage.setItem(BACKFILL_FLAG_KEY, "1");
  } catch (err) {
    console.error("[backfill-file-hash] Failed to set completion flag:", err);
  }

  if (updated > 0) {
    console.log(`[backfill-file-hash] Backfilled fileHash for ${updated} book(s)`);
  }
}
