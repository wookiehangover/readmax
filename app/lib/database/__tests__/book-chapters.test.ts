import { describe, expect, it } from "vitest";
import { mergeChaptersByIndex } from "../book/book-chapters";
import { parseUploadBody } from "../../../routes/api.books.$bookId.chapters";

describe("mergeChaptersByIndex", () => {
  it("merges incoming chapters by canonical index", () => {
    const existing = [
      { index: 0, title: "Intro", text: "old" },
      { index: 2, title: "Chapter 2", text: "two" },
    ];
    const incoming = [
      { index: 1, title: "Chapter 1", text: "one" },
      { index: 2, title: "Chapter 2", text: "updated" },
    ];

    expect(mergeChaptersByIndex(existing, incoming)).toEqual([
      { index: 0, title: "Intro", text: "old" },
      { index: 1, title: "Chapter 1", text: "one" },
      { index: 2, title: "Chapter 2", text: "updated" },
    ]);
  });

  it("ignores existing values without valid chapter indexes", () => {
    const existing = [{ title: "Missing" }, null, { index: -1, title: "Bad" }];
    const incoming = [{ index: 0, title: "Valid" }];

    expect(mergeChaptersByIndex(existing, incoming)).toEqual([{ index: 0, title: "Valid" }]);
  });
});

describe("parseUploadBody", () => {
  it("accepts the legacy chapter upload shape", () => {
    const chapters = [{ index: 0, title: "Intro", text: "Hello", spineStart: 0, spineEnd: 0 }];

    expect(parseUploadBody({ chapters, format: "epub" })).toEqual({
      kind: "legacy",
      body: { chapters, format: "epub" },
    });
  });

  it("rejects partial upload envelopes", () => {
    expect(parseUploadBody({ uploadId: "upload-1", chapters: [] })).toEqual({
      error:
        "upload envelope must include uploadId, chunkIndex, totalChunks, and totalChapters together",
    });
  });
});
