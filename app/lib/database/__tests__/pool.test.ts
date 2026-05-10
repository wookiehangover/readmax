import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const poolMock = vi.hoisted(() => ({
  configs: [] as Array<{ connectionString?: string }>,
}));

vi.mock("pg", () => ({
  Pool: class {
    constructor(config: { connectionString?: string }) {
      poolMock.configs.push(config);
    }
  },
}));

describe("database pool", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    vi.resetModules();
    poolMock.configs = [];
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it("uses the runtime DATABASE_URL when the env store is available", async () => {
    const { runWithEnv } = await import("~/lib/env.server");
    const { getDatabaseConnectionString, getPool } = await import("../pool");

    runWithEnv({ DATABASE_URL: "postgres://worker-runtime" }, {} as ExecutionContext, () => {
      expect(getDatabaseConnectionString()).toBe("postgres://worker-runtime");
      getPool();
    });

    expect(poolMock.configs).toEqual([{ connectionString: "postgres://worker-runtime" }]);
  });

  it("falls back to DATABASE_URL in Node/dev/tests", async () => {
    process.env.DATABASE_URL = "postgres://node-dev";

    await import("~/lib/env.server");
    const { getDatabaseConnectionString, getPool } = await import("../pool");

    expect(getDatabaseConnectionString()).toBe("postgres://node-dev");
    getPool();

    expect(poolMock.configs).toEqual([{ connectionString: "postgres://node-dev" }]);
  });
});
