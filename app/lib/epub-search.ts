import type EpubBook from "epubjs/types/book";

export interface SearchResult {
  cfi: string;
  excerpt: string;
  section: string;
}

export interface SearchOptions {
  /** Optional abort signal to cancel the search early */
  signal?: AbortSignal;
}

/**
 * Search an epubjs Book instance for a query string across all spine items.
 * Returns an array of results with CFI locations, excerpts, and section labels.
 *
 * This is a standalone, testable utility extracted from the useBookSearch hook.
 */
export async function searchBookForCfi(
  book: EpubBook,
  query: string,
  options?: SearchOptions,
): Promise<SearchResult[]> {
  await book.ready;

  const spine = book.spine as any;
  if (typeof spine.each !== "function") {
    return [];
  }

  // Collect all spine items
  const spineItems: any[] = [];
  spine.each((item: any) => {
    spineItems.push(item);
  });

  const allResults: SearchResult[] = [];

  for (const item of spineItems) {
    if (options?.signal?.aborted) return allResults;

    try {
      await item.load(book.load.bind(book));
      const sectionResults: { cfi: string; excerpt: string }[] =
        await item.find(query);

      for (const result of sectionResults) {
        allResults.push({
          cfi: result.cfi,
          excerpt: result.excerpt,
          section: item.label || item.href || "",
        });
      }

      item.unload();
    } catch {
      // Individual section search failures are non-fatal
    }
  }

  return allResults;
}
