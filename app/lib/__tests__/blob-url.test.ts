import { describe, expect, it } from "vitest";

import {
  coverCacheKey,
  isLegacyVercelBlobUrl,
  parseStoredBlobReference,
  r2StorageUrl,
} from "~/lib/blob-url";

describe("storage references", () => {
  it("builds and parses R2 storage URLs", () => {
    const value = r2StorageUrl("cover", "covers/user/book/cover.jpg");
    expect(value).toBe("r2://covers/covers/user/book/cover.jpg");
    expect(parseStoredBlobReference(value, "cover")).toEqual({
      kind: "r2",
      bucket: "covers",
      key: "covers/user/book/cover.jpg",
    });
  });

  it("treats plain keys as R2 references when a type is provided", () => {
    expect(parseStoredBlobReference("books/user/book/book.epub", "file")).toEqual({
      kind: "r2",
      bucket: "files",
      key: "books/user/book/book.epub",
    });
  });

  it("detects legacy Vercel Blob URLs", () => {
    const value = "https://store.blob.vercel-storage.com/covers/book.jpg";
    expect(isLegacyVercelBlobUrl(value)).toBe(true);
    expect(parseStoredBlobReference(value, "cover")).toEqual({ kind: "legacy-vercel", url: value });
  });

  it("returns null for unsupported or malformed references", () => {
    expect(parseStoredBlobReference("https://example.com/foo.jpg", "cover")).toBeNull();
    expect(parseStoredBlobReference("")).toBeNull();
  });
});

describe("coverCacheKey", () => {
  it("keys R2 covers on the object key plus updatedAt", () => {
    const key = coverCacheKey({
      remoteCoverUrl: "r2://covers/covers/user/book/cover.jpg",
      updatedAt: 1234,
    });

    expect(key).toBe("covers/covers/user/book/cover.jpg:1234");
  });

  it("keys legacy URLs on the URL plus updatedAt", () => {
    expect(
      coverCacheKey({
        remoteCoverUrl: "https://store.blob.vercel-storage.com/covers/book.jpg",
        updatedAt: 1234.9,
      }),
    ).toBe("https://store.blob.vercel-storage.com/covers/book.jpg:1234");
  });

  it("returns null when there is no cover URL", () => {
    expect(coverCacheKey({ updatedAt: 1234 })).toBeNull();
  });

  it("returns the same key for the same input", () => {
    const book = {
      coverBlobUrl:
        "https://store.blob.vercel-storage.com/covers/abcdefabcdefabcdefabcdefabcdefab.jpg",
      updatedAt: 5678,
    };

    expect(coverCacheKey(book)).toBe(coverCacheKey(book));
  });
});
