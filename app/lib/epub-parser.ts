import ePub from "epubjs";

export interface EpubMetadata {
  title: string;
  author: string;
  coverUrl: string | null;
}

export async function parseEpub(data: ArrayBuffer): Promise<EpubMetadata> {
  const book = ePub(data);

  await book.ready;

  const metadata = await book.loaded.metadata;
  let coverUrl: string | null = null;

  try {
    coverUrl = await book.coverUrl();
  } catch {
    // cover may not exist in all epubs
  }

  const result: EpubMetadata = {
    title: metadata.title || "Untitled",
    author: metadata.creator || "Unknown Author",
    coverUrl,
  };

  book.destroy();

  return result;
}

