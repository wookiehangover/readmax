import { beforeEach, describe, expect, it } from "vitest";
import { clear, createStore, get, set } from "idb-keyval";
import { clearSyncedChanges, getUnsyncedChanges, markSynced } from "~/lib/sync/change-log";
import { runFileHashBackfillIfNeeded } from "~/lib/sync/backfill-file-hash";
import type { BookMeta } from "~/lib/stores/book-store";

const FLAG_KEY = "readmax:file-hash-backfill:v1";

const bookStore = createStore("ebook-reader-db", "books");
const bookDataStore = createStore("ebook-reader-book-data", "book-data");

beforeEach(async () => {
  localStorage.clear();
  await clear(bookStore);
  await clear(bookDataStore);
  const unsynced = await getUnsyncedChanges();
  if (unsynced.length > 0) {
    await markSynced(unsynced.map((c) => c.id));
    await clearSyncedChanges();
  }
  await clearSyncedChanges();
});

describe("runFileHashBackfillIfNeeded", () => {
  it("backfills only the book missing fileHash, records a change, and sets the flag", async () => {
    const bookWithHash: BookMeta = {
      id: "book-with-hash",
      title: "Already Hashed",
      author: "A",
      coverImage: null,
      format: "epub",
      hasLocalFile: true,
      fileHash: "deadbeef",
      updatedAt: 1000,
    };
    const bookMissingHash: BookMeta = {
      id: "book-missing-hash",
      title: "Needs Hash",
      author: "B",
      coverImage: null,
      format: "epub",
      hasLocalFile: true,
      updatedAt: 2000,
    };

    await set(bookWithHash.id, bookWithHash, bookStore);
    await set(bookMissingHash.id, bookMissingHash, bookStore);

    const dataA = new Uint8Array([1, 2, 3, 4, 5]).buffer as ArrayBuffer;
    const dataB = new TextEncoder().encode("hello world").buffer as ArrayBuffer;
    await set(bookWithHash.id, dataA, bookDataStore);
    await set(bookMissingHash.id, dataB, bookDataStore);

    await runFileHashBackfillIfNeeded();

    const updatedMissing = await get<BookMeta>(bookMissingHash.id, bookStore);
    expect(updatedMissing?.fileHash).toBe(
      "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
    );

    const untouched = await get<BookMeta>(bookWithHash.id, bookStore);
    expect(untouched?.fileHash).toBe("deadbeef");
    expect(untouched?.updatedAt).toBe(1000);

    const changes = await getUnsyncedChanges();
    const bookChanges = changes.filter((c) => c.entity === "book");
    expect(bookChanges).toHaveLength(1);
    expect(bookChanges[0].entityId).toBe(bookMissingHash.id);
    expect((bookChanges[0].data as BookMeta).fileHash).toBe(
      "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
    );

    expect(localStorage.getItem(FLAG_KEY)).toBe("1");
  });

  it("is a no-op when the flag is already set", async () => {
    localStorage.setItem(FLAG_KEY, "1");

    const book: BookMeta = {
      id: "book-x",
      title: "X",
      author: "X",
      coverImage: null,
      format: "epub",
      hasLocalFile: true,
      updatedAt: 5000,
    };
    await set(book.id, book, bookStore);
    await set(book.id, new Uint8Array([9, 9, 9]).buffer as ArrayBuffer, bookDataStore);

    await runFileHashBackfillIfNeeded();

    const after = await get<BookMeta>(book.id, bookStore);
    expect(after?.fileHash).toBeUndefined();
    expect(after?.updatedAt).toBe(5000);

    const changes = await getUnsyncedChanges();
    expect(changes.filter((c) => c.entity === "book")).toHaveLength(0);
  });

  it("skips books that have no local file", async () => {
    const remoteOnly: BookMeta = {
      id: "remote-only",
      title: "Remote",
      author: "R",
      coverImage: null,
      format: "epub",
      hasLocalFile: false,
      remoteFileUrl: "https://example.com/x.epub",
      updatedAt: 7000,
    };
    await set(remoteOnly.id, remoteOnly, bookStore);

    await runFileHashBackfillIfNeeded();

    const after = await get<BookMeta>(remoteOnly.id, bookStore);
    expect(after?.fileHash).toBeUndefined();
    expect(localStorage.getItem(FLAG_KEY)).toBe("1");
  });
});
