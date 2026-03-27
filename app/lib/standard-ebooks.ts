import { Context, Effect, Layer } from "effect";
import { StandardEbooksError } from "~/lib/errors";

const SE_BASE = "https://standardebooks.org";

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

// --- Helpers ---

function deriveEpubDownloadUrl(urlPath: string): string {
  // /ebooks/jane-austen/pride-and-prejudice → jane-austen_pride-and-prejudice
  const segments = urlPath.replace(/^\/ebooks\//, "").split("/");
  const filename = segments.join("_") + ".epub";
  return `${SE_BASE}${urlPath}/downloads/${filename}`;
}

function parseSearchHtml(html: string, page: number): SESearchResult {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const items = doc.querySelectorAll('li[typeof="schema:Book"]');
  const books: SEBook[] = [];

  items.forEach((li) => {
    const titleEl = li.querySelector('[property="schema:name"]');
    const authorEl = li.querySelector(
      '[typeof="schema:Person"] [property="schema:name"]',
    );
    const imgEl = li.querySelector("img");
    const aboutAttr = li.getAttribute("about");

    if (titleEl && authorEl) {
      books.push({
        title: titleEl.textContent?.trim() ?? "",
        author: authorEl.textContent?.trim() ?? "",
        urlPath: aboutAttr ?? "",
        coverUrl: imgEl ? `${SE_BASE}${imgEl.getAttribute("src")}` : null,
      });
    }
  });

  // Extract total pages from pagination nav
  let totalPages = 1;
  const paginationLinks = doc.querySelectorAll("nav.pagination a");
  paginationLinks.forEach((a) => {
    const pageNum = parseInt(a.textContent?.trim() ?? "", 10);
    if (!isNaN(pageNum) && pageNum > totalPages) {
      totalPages = pageNum;
    }
  });

  return { books, currentPage: page, totalPages };
}

function parseAtomFeed(xml: string): SEBook[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const entries = doc.querySelectorAll("entry");
  const books: SEBook[] = [];

  entries.forEach((entry) => {
    const title = entry.querySelector("title")?.textContent?.trim() ?? "";
    const authorEl = entry.querySelector("author name");
    const author = authorEl?.textContent?.trim() ?? "";
    const summary = entry.querySelector("summary")?.textContent?.trim();
    const thumbnail = entry.querySelector("thumbnail");
    const coverUrl = thumbnail?.getAttribute("url") ?? null;

    // Extract urlPath from entry id or link
    const idText = entry.querySelector("id")?.textContent?.trim() ?? "";
    const urlPath = idText.startsWith(SE_BASE)
      ? idText.replace(SE_BASE, "")
      : idText;

    // Extract subjects from category elements
    const categories = entry.querySelectorAll("category");
    const subjects: string[] = [];
    categories.forEach((cat) => {
      const term = cat.getAttribute("term");
      if (term) subjects.push(term);
    });

    books.push({
      title,
      author,
      urlPath,
      coverUrl,
      summary: summary || undefined,
      subjects: subjects.length > 0 ? subjects : undefined,
    });
  });

  return books;
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
            "per-page": "12",
            page: String(page),
          });
          const res = await fetch(`${SE_BASE}/ebooks?${params.toString()}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const html = await res.text();
          return parseSearchHtml(html, page);
        },
        catch: (cause) =>
          new StandardEbooksError({ operation: "searchBooks", cause }),
      }),

    getNewReleases: () =>
      Effect.tryPromise({
        try: async () => {
          const res = await fetch(
            `${SE_BASE}/feeds/atom/new-releases`,
          );
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const xml = await res.text();
          return parseAtomFeed(xml);
        },
        catch: (cause) =>
          new StandardEbooksError({ operation: "getNewReleases", cause }),
      }),

    downloadEpub: (urlPath: string) =>
      Effect.tryPromise({
        try: async () => {
          const url = deriveEpubDownloadUrl(urlPath);
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.arrayBuffer();
        },
        catch: (cause) =>
          new StandardEbooksError({ operation: "downloadEpub", cause }),
      }),
  },
);
