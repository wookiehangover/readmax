import { describe, expect, it } from "vitest";

import { coverCacheKey, isPublicBlobUrl } from "~/lib/blob-url";

describe("isPublicBlobUrl", () => {
  it("detects public Vercel Blob URLs", () => {
    expect(isPublicBlobUrl("https://store.public.blob.vercel-storage.com/covers/book.jpg")).toBe(
      true,
    );
    expect(isPublicBlobUrl("https://store.blob.vercel-storage.com/covers/book.jpg")).toBe(false);
  });

  it("returns false for a non-blob URL", () => {
    expect(isPublicBlobUrl("https://example.com/foo.jpg")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(isPublicBlobUrl("")).toBe(false);
  });

  it("returns false for a malformed URL without throwing", () => {
    expect(() => isPublicBlobUrl("not a url")).not.toThrow();
    expect(isPublicBlobUrl("not a url")).toBe(false);
  });
});

describe("coverCacheKey", () => {
  it("uses the last 32 hex characters from the cover blob URL", () => {
    const key = coverCacheKey({
      remoteCoverUrl:
        "https://store.blob.vercel-storage.com/covers/book-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg",
      updatedAt: 1234,
    });

    expect(key).toBe("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
  });

  it("falls back to updatedAt when the cover URL has no blob hash", () => {
    expect(
      coverCacheKey({
        remoteCoverUrl: "https://store.blob.vercel-storage.com/covers/book.jpg",
        updatedAt: 1234.9,
      }),
    ).toBe("1234");
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
