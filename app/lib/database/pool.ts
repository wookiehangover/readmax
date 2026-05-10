import type { Pool, PoolConfig } from "pg";

let pool: Pool | null = null;

const MAX_POOL_SIZE = 1;
const MAX_POOL_USES = 1;

interface RuntimeEnv {
  readonly DATABASE_URL?: string;
}

interface RuntimeGlobals {
  readonly __readmaxxingGetEnv?: () => RuntimeEnv;
  readonly __readmaxxingHasRuntimeEnvContext?: () => boolean;
  readonly __readmaxxingGetRuntimePgPool?: () => Pool | undefined;
  readonly __readmaxxingSetRuntimePgPool?: (pool: Pool) => void;
  readonly __readmaxxingCreatePgPool?: (config: PoolConfig) => Pool;
  readonly process?: { env?: Record<string, string | undefined> };
}

export function getDatabaseConnectionString() {
  const env = getRuntimeEnv();

  return env.DATABASE_URL ?? getNodeDatabaseUrl();
}

export function getPool() {
  const runtimePool = getRuntimePgPoolFromContext();
  if (runtimePool) return runtimePool;

  if (hasRuntimeEnvContext()) {
    const newPool = createPool();
    setRuntimePgPoolInContext(newPool);
    return newPool;
  }

  if (!pool) {
    pool = createPool();
  }
  return pool;
}

function createPool() {
  return getPgPoolFactory()({
    connectionString: getDatabaseConnectionString(),
    max: MAX_POOL_SIZE,
    maxUses: MAX_POOL_USES,
  });
}

function getNodeDatabaseUrl() {
  return getRuntimeGlobals().process?.env?.DATABASE_URL;
}

function getRuntimeEnv(): RuntimeEnv {
  return getRuntimeGlobals().__readmaxxingGetEnv?.() ?? {};
}

function hasRuntimeEnvContext() {
  return getRuntimeGlobals().__readmaxxingHasRuntimeEnvContext?.() ?? false;
}

function getRuntimePgPoolFromContext() {
  return getRuntimeGlobals().__readmaxxingGetRuntimePgPool?.();
}

function setRuntimePgPoolInContext(newPool: Pool) {
  getRuntimeGlobals().__readmaxxingSetRuntimePgPool?.(newPool);
}

function getPgPoolFactory() {
  const factory = getRuntimeGlobals().__readmaxxingCreatePgPool;

  if (!factory) throw new Error("Postgres pool factory is not initialized");

  return factory;
}

function getRuntimeGlobals() {
  return globalThis as RuntimeGlobals;
}
