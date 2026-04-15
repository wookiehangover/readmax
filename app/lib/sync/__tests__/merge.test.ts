import { describe, it, expect } from "vitest";
import { lwwMerge, setUnionMerge, appendOnlyMerge } from "../merge";

// ---------------------------------------------------------------------------
// lwwMerge
// ---------------------------------------------------------------------------

describe("lwwMerge", () => {
  it("returns remote when remote is newer", () => {
    const local = { updatedAt: 100, value: "local" };
    const remote = { updatedAt: 200, value: "remote" };
    expect(lwwMerge(local, remote)).toBe(remote);
  });

  it("returns local when local is newer", () => {
    const local = { updatedAt: 200, value: "local" };
    const remote = { updatedAt: 100, value: "remote" };
    expect(lwwMerge(local, remote)).toBe(local);
  });

  it("returns remote on equal timestamps (server authority)", () => {
    const local = { updatedAt: 100, value: "local" };
    const remote = { updatedAt: 100, value: "remote" };
    expect(lwwMerge(local, remote)).toBe(remote);
  });
});

// ---------------------------------------------------------------------------
// setUnionMerge
// ---------------------------------------------------------------------------

type TestItem = { id: string; deletedAt?: number | null; updatedAt?: number };
const getId = (item: TestItem) => item.id;

describe("setUnionMerge", () => {
  it("unions disjoint sets", () => {
    const local: TestItem[] = [{ id: "a" }];
    const remote: TestItem[] = [{ id: "b" }];
    const result = setUnionMerge(local, remote, getId);
    expect(result.map((r) => r.id).sort()).toEqual(["a", "b"]);
  });

  it("unions overlapping sets without duplicates", () => {
    const local: TestItem[] = [{ id: "a" }, { id: "b" }];
    const remote: TestItem[] = [{ id: "b" }, { id: "c" }];
    const result = setUnionMerge(local, remote, getId);
    expect(result.map((r) => r.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("prefers non-deleted over deleted (remote deleted, local not)", () => {
    const local: TestItem[] = [{ id: "a" }];
    const remote: TestItem[] = [{ id: "a", deletedAt: 100 }];
    const result = setUnionMerge(local, remote, getId);
    expect(result).toHaveLength(1);
    expect(result[0].deletedAt).toBeUndefined();
  });

  it("prefers non-deleted over deleted (local deleted, remote not)", () => {
    const local: TestItem[] = [{ id: "a", deletedAt: 100 }];
    const remote: TestItem[] = [{ id: "a" }];
    const result = setUnionMerge(local, remote, getId);
    expect(result).toHaveLength(1);
    expect(result[0].deletedAt).toBeUndefined();
  });

  it("keeps the more recently deleted when both are deleted", () => {
    const local: TestItem[] = [{ id: "a", deletedAt: 100 }];
    const remote: TestItem[] = [{ id: "a", deletedAt: 200 }];
    const result = setUnionMerge(local, remote, getId);
    expect(result).toHaveLength(1);
    expect(result[0].deletedAt).toBe(200);
  });

  it("uses LWW fallback when both non-deleted and have updatedAt", () => {
    const local: TestItem[] = [{ id: "a", updatedAt: 100 }];
    const remote: TestItem[] = [{ id: "a", updatedAt: 200 }];
    const result = setUnionMerge(local, remote, getId);
    expect(result[0].updatedAt).toBe(200);
  });

  it("keeps local when both non-deleted and local updatedAt is newer", () => {
    const local: TestItem[] = [{ id: "a", updatedAt: 300 }];
    const remote: TestItem[] = [{ id: "a", updatedAt: 200 }];
    const result = setUnionMerge(local, remote, getId);
    expect(result[0].updatedAt).toBe(300);
  });

  it("keeps local when both non-deleted with no updatedAt", () => {
    const local: TestItem[] = [{ id: "a" }];
    const remote: TestItem[] = [{ id: "a" }];
    const result = setUnionMerge(local, remote, getId);
    // Without updatedAt, local stays (no LWW fallback fires)
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// appendOnlyMerge
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// setUnionMerge — highlight-shaped records
// ---------------------------------------------------------------------------

type HighlightItem = {
  id: string;
  bookId: string;
  cfiRange: string;
  text: string;
  color: string;
  updatedAt: number;
  deletedAt?: number | null;
};
const getHighlightId = (h: HighlightItem) => h.id;

function makeHighlight(overrides: Partial<HighlightItem> & { id: string }): HighlightItem {
  return {
    bookId: "book-1",
    cfiRange: "epubcfi(/6/4!/4/2)",
    text: "sample text",
    color: "#ffff00",
    updatedAt: 100,
    ...overrides,
  };
}

describe("setUnionMerge — highlights", () => {
  it("merges two disjoint highlight sets into their union", () => {
    const local = [makeHighlight({ id: "h1", text: "highlight one" })];
    const remote = [makeHighlight({ id: "h2", text: "highlight two" })];
    const result = setUnionMerge(local, remote, getHighlightId);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id).sort()).toEqual(["h1", "h2"]);
  });

  it("same highlight on both sides — LWW by updatedAt (remote newer)", () => {
    const local = [makeHighlight({ id: "h1", updatedAt: 100, color: "#ff0000" })];
    const remote = [makeHighlight({ id: "h1", updatedAt: 200, color: "#00ff00" })];
    const result = setUnionMerge(local, remote, getHighlightId);
    expect(result).toHaveLength(1);
    expect(result[0].color).toBe("#00ff00");
    expect(result[0].updatedAt).toBe(200);
  });

  it("same highlight on both sides — LWW by updatedAt (local newer)", () => {
    const local = [makeHighlight({ id: "h1", updatedAt: 300, color: "#ff0000" })];
    const remote = [makeHighlight({ id: "h1", updatedAt: 200, color: "#00ff00" })];
    const result = setUnionMerge(local, remote, getHighlightId);
    expect(result).toHaveLength(1);
    expect(result[0].color).toBe("#ff0000");
    expect(result[0].updatedAt).toBe(300);
  });

  it("deleted on remote side — non-deleted local wins", () => {
    const local = [makeHighlight({ id: "h1", updatedAt: 100 })];
    const remote = [makeHighlight({ id: "h1", updatedAt: 200, deletedAt: 200 })];
    const result = setUnionMerge(local, remote, getHighlightId);
    expect(result).toHaveLength(1);
    expect(result[0].deletedAt).toBeUndefined();
  });

  it("deleted on local side — non-deleted remote wins", () => {
    const local = [makeHighlight({ id: "h1", updatedAt: 100, deletedAt: 150 })];
    const remote = [makeHighlight({ id: "h1", updatedAt: 200 })];
    const result = setUnionMerge(local, remote, getHighlightId);
    expect(result).toHaveLength(1);
    expect(result[0].deletedAt).toBeUndefined();
  });

  it("deleted on both sides — keeps the more recently deleted", () => {
    const local = [makeHighlight({ id: "h1", deletedAt: 100 })];
    const remote = [makeHighlight({ id: "h1", deletedAt: 300 })];
    const result = setUnionMerge(local, remote, getHighlightId);
    expect(result).toHaveLength(1);
    expect(result[0].deletedAt).toBe(300);
  });

  it("new highlight on remote only — added to result", () => {
    const local: HighlightItem[] = [];
    const remote = [makeHighlight({ id: "h-new", text: "new from server" })];
    const result = setUnionMerge(local, remote, getHighlightId);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("h-new");
    expect(result[0].text).toBe("new from server");
  });

  it("new highlight on local only — stays in result", () => {
    const local = [makeHighlight({ id: "h-local", text: "local only" })];
    const remote: HighlightItem[] = [];
    const result = setUnionMerge(local, remote, getHighlightId);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("h-local");
  });

  it("multiple highlights across books merge correctly", () => {
    const local = [
      makeHighlight({ id: "h1", bookId: "book-1" }),
      makeHighlight({ id: "h2", bookId: "book-2" }),
    ];
    const remote = [
      makeHighlight({ id: "h2", bookId: "book-2", updatedAt: 200, color: "#0000ff" }),
      makeHighlight({ id: "h3", bookId: "book-1" }),
    ];
    const result = setUnionMerge(local, remote, getHighlightId);
    expect(result).toHaveLength(3);
    const h2 = result.find((r) => r.id === "h2")!;
    expect(h2.color).toBe("#0000ff");
  });
});

// ---------------------------------------------------------------------------
// lwwMerge — notebook-shaped records
// ---------------------------------------------------------------------------

type NotebookItem = {
  bookId: string;
  content: Record<string, unknown>;
  updatedAt: number;
};

function makeNotebook(overrides: Partial<NotebookItem> & { bookId: string }): NotebookItem {
  return {
    content: { type: "doc", content: [] },
    updatedAt: 100,
    ...overrides,
  };
}

describe("lwwMerge — notebooks", () => {
  it("remote newer — remote wins", () => {
    const local = makeNotebook({ bookId: "b1", updatedAt: 100, content: { local: true } });
    const remote = makeNotebook({ bookId: "b1", updatedAt: 200, content: { remote: true } });
    const result = lwwMerge(local, remote);
    expect(result).toBe(remote);
    expect(result.content).toEqual({ remote: true });
  });

  it("local newer — local wins", () => {
    const local = makeNotebook({ bookId: "b1", updatedAt: 300, content: { local: true } });
    const remote = makeNotebook({ bookId: "b1", updatedAt: 200, content: { remote: true } });
    const result = lwwMerge(local, remote);
    expect(result).toBe(local);
    expect(result.content).toEqual({ local: true });
  });

  it("equal timestamps — remote wins (server authority)", () => {
    const local = makeNotebook({ bookId: "b1", updatedAt: 100, content: { local: true } });
    const remote = makeNotebook({ bookId: "b1", updatedAt: 100, content: { remote: true } });
    const result = lwwMerge(local, remote);
    expect(result).toBe(remote);
  });
});

// ---------------------------------------------------------------------------
// appendOnlyMerge
// ---------------------------------------------------------------------------

describe("appendOnlyMerge", () => {
  it("unions disjoint sets", () => {
    const local = [{ id: "1", text: "a" }];
    const remote = [{ id: "2", text: "b" }];
    const result = appendOnlyMerge(local, remote, (i) => i.id);
    expect(result.map((r) => r.id).sort()).toEqual(["1", "2"]);
  });

  it("deduplicates by ID", () => {
    const local = [{ id: "1", text: "local" }];
    const remote = [{ id: "1", text: "remote" }];
    const result = appendOnlyMerge(local, remote, (i) => i.id);
    expect(result).toHaveLength(1);
  });

  it("prefers remote copy for same ID (server authority)", () => {
    const local = [{ id: "1", text: "local" }];
    const remote = [{ id: "1", text: "remote" }];
    const result = appendOnlyMerge(local, remote, (i) => i.id);
    expect(result[0].text).toBe("remote");
  });

  it("never removes items", () => {
    const local = [
      { id: "1", text: "a" },
      { id: "2", text: "b" },
    ];
    const remote = [{ id: "1", text: "a-updated" }];
    const result = appendOnlyMerge(local, remote, (i) => i.id);
    expect(result).toHaveLength(2);
    expect(result.find((r) => r.id === "2")).toBeDefined();
  });
});
