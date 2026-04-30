import { AsyncLocalStorage } from "node:async_hooks";

export interface Env {
  readonly HYPERDRIVE?: Hyperdrive;
  readonly R2_FILES?: R2Bucket;
  readonly R2_COVERS?: R2Bucket;
  readonly AGENTS?: DurableObjectNamespace;
  readonly DATABASE_URL?: string;
  readonly BLOB_READ_WRITE_TOKEN?: string;
  readonly REDIS_URL?: string;
  readonly WEBAUTHN_RP_NAME?: string;
  readonly WEBAUTHN_RP_ID?: string;
  readonly WEBAUTHN_RP_ORIGIN?: string;
  readonly ANTHROPIC_API_KEY?: string;
  readonly AI_GATEWAY_API_KEY?: string;
  readonly AI_GATEWAY_BASE_URL?: string;
  readonly AI_GATEWAY_ACCOUNT_ID?: string;
  readonly AI_GATEWAY_NAME?: string;
  readonly NODE_ENV?: string;
}

interface EnvContext {
  readonly env: Env;
  readonly ctx: ExecutionContext;
}

const envStorage = new AsyncLocalStorage<EnvContext>();

export function runWithEnv<T>(env: Env, ctx: ExecutionContext, callback: () => T): T {
  return envStorage.run({ env, ctx }, callback);
}

export function getEnv(): Env {
  const stored = envStorage.getStore();
  if (stored) return stored.env;

  return getNodeEnvFallback();
}

export function getExecutionContext(): ExecutionContext | undefined {
  return envStorage.getStore()?.ctx;
}

export function isDatabaseRuntimeAvailable(): boolean {
  const env = getEnv();

  return Boolean(env.DATABASE_URL) && !env.HYPERDRIVE;
}

function getNodeEnvFallback(): Env {
  const nodeEnv = (
    globalThis as {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env;

  return (nodeEnv ?? {}) as Env;
}
