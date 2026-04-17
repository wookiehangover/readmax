import { createClient } from "redis";

class RedisConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RedisConfigError";
  }
}

let client: ReturnType<typeof createClient> | null = null;
let connectionPromise: Promise<ReturnType<typeof createClient>> | null = null;

function getRedisUrl(): string {
  const url = process.env.REDIS_URL;
  if (!url) {
    if (process.env.NODE_ENV === "production") {
      throw new RedisConfigError(
        "REDIS_URL is not set. Set REDIS_URL in the production environment (Vercel KV / Upstash / other Redis-compatible).",
      );
    }
    throw new RedisConfigError(
      "REDIS_URL is not set. Add it to .env.local to enable resumable chat streaming.",
    );
  }
  return url;
}

function createRedisClient() {
  if (client) {
    return client;
  }

  client = createClient({
    url: getRedisUrl(),
  });

  client.on("error", (err) => {
    console.error("Redis client error:", err);
  });

  client.on("connect", () => {
    console.info("Redis client connected");
  });

  return client;
}

async function ensureConnected() {
  if (!client) {
    createRedisClient();
  }

  if (!connectionPromise) {
    connectionPromise = client!
      .connect()
      .then(() => client!)
      .catch((err) => {
        console.error("Failed to connect to Redis:", err);
        connectionPromise = null;
        throw err;
      });
  }

  return await connectionPromise;
}

export { ensureConnected as redis };
