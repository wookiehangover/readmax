import { Context, Effect, Layer } from "effect";
import { StandardEbooksError } from "~/lib/errors";

// --- Types ---

export interface SEBook {
  title: string;
  author: string;
  urlPath: string;
  coverUrl: string | null;
  summary?: string;
  subjects?: string[];
}

export interface SESearchResult {
  books: SEBook[];
  currentPage: number;
  totalPages: number;
}

// --- Service ---

export class StandardEbooksService extends Context.Tag("StandardEbooksService")<
  StandardEbooksService,
  {
    readonly searchBooks: (
      query: string,
      page?: number,
    ) => Effect.Effect<SESearchResult, StandardEbooksError>;
    readonly getNewReleases: () => Effect.Effect<SEBook[], StandardEbooksError>;
    readonly downloadEpub: (
      urlPath: string,
    ) => Effect.Effect<ArrayBuffer, StandardEbooksError>;
  }
>() {}

export const StandardEbooksServiceLive = Layer.succeed(
  StandardEbooksService,
  {
    searchBooks: (query: string, page = 1) =>
      Effect.tryPromise({
        try: async () => {
          const params = new URLSearchParams({
            query,
            page: String(page),
          });
          const res = await fetch(
            `/api/standard-ebooks/search?${params.toString()}`,
          );
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return (await res.json()) as SESearchResult;
        },
        catch: (cause) =>
          new StandardEbooksError({ operation: "searchBooks", cause }),
      }),

    getNewReleases: () =>
      Effect.tryPromise({
        try: async () => {
          const res = await fetch("/api/standard-ebooks/new-releases");
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return (await res.json()) as SEBook[];
        },
        catch: (cause) =>
          new StandardEbooksError({ operation: "getNewReleases", cause }),
      }),

    downloadEpub: (urlPath: string) =>
      Effect.tryPromise({
        try: async () => {
          const params = new URLSearchParams({ path: urlPath });
          const res = await fetch(
            `/api/standard-ebooks/download?${params.toString()}`,
          );
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.arrayBuffer();
        },
        catch: (cause) =>
          new StandardEbooksError({ operation: "downloadEpub", cause }),
      }),
  },
);
