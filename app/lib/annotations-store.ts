import { createStore, get, set, del, entries } from "idb-keyval";
import { Context, Effect, Layer, Schema } from "effect";
import type { JSONContent } from "@tiptap/react";
import { HighlightError, NotebookError, DecodeError } from "~/lib/errors";

// --- Schemas ---

export const HighlightSchema = Schema.Struct({
  id: Schema.String,
  bookId: Schema.String,
  cfiRange: Schema.String,
  text: Schema.String,
  color: Schema.String,
  createdAt: Schema.Number,
});

export type Highlight = typeof HighlightSchema.Type;

const decodeHighlight = Schema.decodeUnknownSync(HighlightSchema);

/**
 * Notebook content is a TipTap JSONContent tree — opaque structure
 * that we validate structurally (must be a record) but don't deeply schema-check.
 */
export const NotebookSchema = Schema.Struct({
  bookId: Schema.String,
  content: Schema.Unknown,
  updatedAt: Schema.Number,
});

/** Notebook with TipTap JSONContent. The content field is validated as present but not deeply checked. */
export interface Notebook {
  bookId: string;
  content: JSONContent;
  updatedAt: number;
}

const decodeNotebook = (raw: unknown): Notebook => {
  const decoded = Schema.decodeUnknownSync(NotebookSchema)(raw);
  return decoded as unknown as Notebook;
};

// --- Service interface ---

export class AnnotationService extends Context.Tag("AnnotationService")<
  AnnotationService,
  {
    readonly saveHighlight: (highlight: Highlight) => Effect.Effect<void, HighlightError>;
    readonly getHighlightsByBook: (bookId: string) => Effect.Effect<Highlight[], HighlightError | DecodeError>;
    readonly updateHighlight: (
      id: string,
      updates: Partial<Omit<Highlight, "id" | "bookId" | "createdAt">>,
    ) => Effect.Effect<void, HighlightError | DecodeError>;
    readonly deleteHighlight: (id: string) => Effect.Effect<void, HighlightError>;
    readonly saveNotebook: (notebook: Notebook) => Effect.Effect<void, NotebookError>;
    readonly getNotebook: (bookId: string) => Effect.Effect<Notebook | null, NotebookError | DecodeError>;
  }
>() {}

// --- idb-keyval stores (lazy-initialized for SSR safety) ---

let _highlightStore: ReturnType<typeof createStore> | null = null;
let _notebookStore: ReturnType<typeof createStore> | null = null;

function getHighlightStore() {
  if (!_highlightStore) _highlightStore = createStore("ebook-reader-highlights", "highlights");
  return _highlightStore;
}

function getNotebookStore() {
  if (!_notebookStore) _notebookStore = createStore("ebook-reader-notebooks", "notebooks");
  return _notebookStore;
}

// --- Live implementation ---

export const AnnotationServiceLive = Layer.succeed(AnnotationService, {
  saveHighlight: (highlight) =>
    Effect.tryPromise({
      try: () => set(highlight.id, highlight, getHighlightStore()),
      catch: (cause) =>
        new HighlightError({ operation: "saveHighlight", highlightId: highlight.id, cause }),
    }),

  getHighlightsByBook: (bookId) =>
    Effect.gen(function* () {
      const allEntries = yield* Effect.tryPromise({
        try: () => entries<string, unknown>(getHighlightStore()),
        catch: (cause) => new HighlightError({ operation: "getHighlightsByBook", cause }),
      });
      return yield* Effect.try({
        try: () =>
          allEntries
            .map(([, raw]) => raw)
            .filter(Boolean)
            .map((raw) => decodeHighlight(raw))
            .filter((hl) => hl.bookId === bookId),
        catch: (cause) => new DecodeError({ operation: "getHighlightsByBook", cause }),
      });
    }),

  updateHighlight: (id, updates) =>
    Effect.gen(function* () {
      const raw = yield* Effect.tryPromise({
        try: () => get<unknown>(id, getHighlightStore()),
        catch: (cause) =>
          new HighlightError({ operation: "updateHighlight", highlightId: id, cause }),
      });
      if (!raw) {
        return yield* Effect.fail(
          new HighlightError({ operation: "updateHighlight", highlightId: id }),
        );
      }
      const existing = yield* Effect.try({
        try: () => decodeHighlight(raw),
        catch: (cause) => new DecodeError({ operation: "updateHighlight", cause }),
      });
      yield* Effect.tryPromise({
        try: () => set(id, { ...existing, ...updates }, getHighlightStore()),
        catch: (cause) =>
          new HighlightError({ operation: "updateHighlight", highlightId: id, cause }),
      });
    }),

  deleteHighlight: (id) =>
    Effect.tryPromise({
      try: () => del(id, getHighlightStore()),
      catch: (cause) =>
        new HighlightError({ operation: "deleteHighlight", highlightId: id, cause }),
    }),

  saveNotebook: (notebook) =>
    Effect.tryPromise({
      try: () => set(notebook.bookId, notebook, getNotebookStore()),
      catch: (cause) =>
        new NotebookError({ operation: "saveNotebook", bookId: notebook.bookId, cause }),
    }),

  getNotebook: (bookId) =>
    Effect.gen(function* () {
      const raw = yield* Effect.tryPromise({
        try: () => get<unknown>(bookId, getNotebookStore()),
        catch: (cause) => new NotebookError({ operation: "getNotebook", bookId, cause }),
      });
      if (!raw) return null;
      return yield* Effect.try({
        try: () => decodeNotebook(raw),
        catch: (cause) => new DecodeError({ operation: "getNotebook", cause }),
      });
    }),
});
