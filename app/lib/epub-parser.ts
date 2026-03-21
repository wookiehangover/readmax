import { Effect } from "effect";
import { parseEpubEffect, EpubServiceLive } from "~/lib/epub-service";

export type { EpubMetadata } from "~/lib/epub-service";

/**
 * Parse an epub file and extract metadata.
 * This is a convenience wrapper that runs the EpubService effect.
 */
export async function parseEpub(
  data: ArrayBuffer,
): Promise<import("~/lib/epub-service").EpubMetadata> {
  return Effect.runPromise(
    parseEpubEffect(data).pipe(Effect.provide(EpubServiceLive)),
  );
}

