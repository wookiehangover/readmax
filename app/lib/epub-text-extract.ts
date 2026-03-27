import ePub from "epubjs";

const DEFAULT_MAX_CHARS = 100_000;
const CHAPTER_SEPARATOR = "\n\n--- Chapter ---\n\n";

/**
 * Extract plain text from an epub ArrayBuffer by iterating through spine items.
 * Client-side only — epubjs requires DOM.
 *
 * @param data - The epub file as an ArrayBuffer
 * @param maxChars - Maximum characters to return (default 100,000)
 * @returns Concatenated plain text from all chapters, truncated to maxChars
 */
export async function extractBookText(
  data: ArrayBuffer,
  maxChars: number = DEFAULT_MAX_CHARS,
): Promise<string> {
  const book = ePub(data);

  try {
    await book.ready;

    const spine = book.spine as any;
    if (typeof spine.each !== "function") {
      return "";
    }

    // Collect spine items
    const spineItems: any[] = [];
    spine.each((item: any) => {
      spineItems.push(item);
    });

    const chunks: string[] = [];
    let totalLength = 0;

    for (const item of spineItems) {
      if (totalLength >= maxChars) break;

      try {
        await item.load(book.load.bind(book));
        const text = item.document?.body?.textContent?.trim() ?? "";
        item.unload();

        if (!text) continue;

        chunks.push(text);
        totalLength += text.length + CHAPTER_SEPARATOR.length;
      } catch (err) {
        console.warn(
          `Failed to load spine item "${item.href ?? "unknown"}":`,
          err,
        );
        continue;
      }
    }

    let result = chunks.join(CHAPTER_SEPARATOR);

    if (result.length > maxChars) {
      result = result.slice(0, maxChars);
    }

    return result;
  } finally {
    book.destroy();
  }
}
