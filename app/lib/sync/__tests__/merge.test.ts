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
