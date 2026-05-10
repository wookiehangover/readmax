import type { Pool } from "pg";

let pool: Pool | null = null;

interface RuntimeEnv {
  readonly DATABASE_URL?: string;
}

interface PoolConfig {
  readonly connectionString?: string;
}

export function getDatabaseConnectionString() {
  const env = getRuntimeEnv();

  return env.DATABASE_URL ?? getNodeDatabaseUrl();
}

export function getPool() {
  if (!pool) {
    pool = getPgPoolFactory()({
      connectionString: getDatabaseConnectionString(),
    });
  }
  return pool;
}

function getNodeDatabaseUrl() {
  return (
    globalThis as {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env?.DATABASE_URL;
}

function getRuntimeEnv(): RuntimeEnv {
  return (
    (
      globalThis as {
        __readmaxxingGetEnv?: () => RuntimeEnv;
      }
    ).__readmaxxingGetEnv?.() ?? {}
  );
}

function getPgPoolFactory() {
  const factory = (
    globalThis as {
      __readmaxxingCreatePgPool?: (config: PoolConfig) => Pool;
    }
  ).__readmaxxingCreatePgPool;

  if (!factory) throw new Error("Postgres pool factory is not initialized");

  return factory;
}
