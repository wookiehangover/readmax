import { describe, it, expect, vi, beforeEach } from "vitest";

const queryMock = vi.fn();

vi.mock("../../pool", () => ({
  getPool: () => ({ query: queryMock }),
}));

import { getNotebookMarkdownForUser, getNotebookForUser } from "../notebook";

beforeEach(() => {
  queryMock.mockReset();
});

describe("getNotebookForUser", () => {
  it("returns the row when present", async () => {
    const updatedAt = new Date("2025-01-01T00:00:00Z");
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          userId: "u1",
          bookId: "b1",
          content: { type: "doc", content: [] },
          updatedAt,
        },
      ],
    });

    const row = await getNotebookForUser("u1", "b1");
    expect(row).toEqual({
      userId: "u1",
      bookId: "b1",
      content: { type: "doc", content: [] },
      updatedAt,
    });
  });

  it("returns null when no row is found", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    expect(await getNotebookForUser("u1", "b1")).toBeNull();
  });
});

describe("getNotebookMarkdownForUser", () => {
  it("returns empty string when no notebook exists", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    expect(await getNotebookMarkdownForUser("u1", "b1")).toBe("");
  });

  it("returns empty string when content is null", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          userId: "u1",
          bookId: "b1",
          content: null,
          updatedAt: new Date(),
        },
      ],
    });
    expect(await getNotebookMarkdownForUser("u1", "b1")).toBe("");
  });

  it("converts a stored TipTap doc into markdown", async () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Chapter Notes" }],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "The " },
            { type: "text", text: "quick", marks: [{ type: "bold" }] },
            { type: "text", text: " brown fox." },
          ],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }],
            },
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "two" }] }],
            },
          ],
        },
      ],
    };

    queryMock.mockResolvedValueOnce({
      rows: [
        {
          userId: "u1",
          bookId: "b1",
          content: doc,
          updatedAt: new Date(),
        },
      ],
    });

    const md = await getNotebookMarkdownForUser("u1", "b1");
    expect(md).toBe(
      ["## Chapter Notes", "", "The **quick** brown fox.", "", "- one\n- two"].join("\n"),
    );
  });
});
