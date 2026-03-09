import { createStore, get, set, del, keys } from "idb-keyval";

// --- Types ---

export interface Highlight {
  id: string;
  bookId: string;
  cfiRange: string;
  text: string;
  note: string;
  color: string;
  createdAt: number;
}

export interface Notebook {
  bookId: string;
  content: any; // tiptap JSON document
  updatedAt: number;
}

// --- Stores (separate databases per idb-keyval limitation) ---

const highlightStore = createStore("ebook-reader-highlights", "highlights");
const notebookStore = createStore("ebook-reader-notebooks", "notebooks");

// --- Highlight CRUD ---

export async function saveHighlight(highlight: Highlight): Promise<void> {
  await set(highlight.id, highlight, highlightStore);
}

export async function getHighlightsByBook(
  bookId: string,
): Promise<Highlight[]> {
  const allKeys = await keys(highlightStore);
  const highlights: Highlight[] = [];
  for (const key of allKeys) {
    const highlight = await get<Highlight>(key, highlightStore);
    if (highlight && highlight.bookId === bookId) {
      highlights.push(highlight);
    }
  }
  return highlights;
}

export async function updateHighlight(
  id: string,
  updates: Partial<Omit<Highlight, "id" | "bookId" | "createdAt">>,
): Promise<void> {
  const existing = await get<Highlight>(id, highlightStore);
  if (!existing) return;
  await set(id, { ...existing, ...updates }, highlightStore);
}

export async function deleteHighlight(id: string): Promise<void> {
  await del(id, highlightStore);
}

// --- Notebook CRUD ---

export async function saveNotebook(notebook: Notebook): Promise<void> {
  await set(notebook.bookId, notebook, notebookStore);
}

export async function getNotebook(bookId: string): Promise<Notebook | null> {
  const notebook = await get<Notebook>(bookId, notebookStore);
  return notebook ?? null;
}

