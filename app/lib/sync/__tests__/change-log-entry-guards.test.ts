import { describe, expect, it, vi } from "vitest";
import type { ChangeEntry } from "../types";

const entriesMock = vi.hoisted(() => vi.fn());
const delMock = vi.hoisted(() => vi.fn());

vi.mock("idb-keyval", async (importOriginal) => {
  const actual = await importOriginal<typeof import("idb-keyval")>();
  return {
    ...actual,
    entries: entriesMock,
    del: delMock,
  };
});

const { getUnsyncedChanges, clearSyncedChanges } = await import("../change-log");

function makeChange(overrides: Partial<ChangeEntry> = {}): ChangeEntry {
  return {
    id: overrides.id ?? "01H00000000000000000000000",
    entity: overrides.entity ?? "book",
    entityId: overrides.entityId ?? "book-1",
    operation: overrides.operation ?? "put",
    data: overrides.data ?? {},
    timestamp: overrides.timestamp ?? 1,
    synced: overrides.synced ?? false,
  };
}

describe("change-log entry guards", () => {
  it("getUnsyncedChanges skips malformed IDB entries", async () => {
    const unsynced = makeChange({ id: "01H00000000000000000000001" });
    entriesMock.mockResolvedValueOnce([
      undefined,
      ["string-value", "not-a-change"],
      ["synced", makeChange({ id: "01H00000000000000000000002", synced: true })],
      ["unsynced", unsynced],
    ]);

    await expect(getUnsyncedChanges()).resolves.toEqual([unsynced]);
  });

  it("clearSyncedChanges skips malformed IDB entries", async () => {
    const synced = makeChange({ id: "01H00000000000000000000003", synced: true });
    entriesMock.mockResolvedValueOnce([
      undefined,
      ["string-value", "not-a-change"],
      ["unsynced", makeChange({ id: "01H00000000000000000000004" })],
      ["synced", synced],
    ]);
    delMock.mockResolvedValue(undefined);

    await expect(clearSyncedChanges()).resolves.toBe(1);
    expect(delMock).toHaveBeenCalledOnce();
  });
});
