import { describe, it, expect } from "vitest";
import { Effect, Layer } from "effect";
import { createStore, set, get, del, entries } from "idb-keyval";
import { BookService } from "~/lib/book-store";
import type { Book, BookMeta } from "~/lib/book-store";
import { ReadingPositionService } from "~/lib/position-store";
import { StorageError, BookNotFoundError, PositionError } from "~/lib/errors";

function makeBook(overrides: Partial<Book> = {}): Book {
  return {
    id: overrides.id ?? "book-1",
    title: overrides.title ?? "Test Book",
    author: overrides.author ?? "Test Author",
    coverImage: overrides.coverImage ?? null,
    data: overrides.data ?? new ArrayBuffer(8),
  };
}

let testCounter = 0;

function makeTestLayer() {
  const suffix = `test-${++testCounter}-${Date.now()}`;
  const bookStore = createStore(`book-db-${suffix}`, "books");
  const posStore = createStore(`pos-db-${suffix}`, "positions");
  const locStore = createStore(`loc-db-${suffix}`, "locations");

  const bookDataStore = createStore(`book-data-db-${suffix}`, "book-data");

  const bookLayer = Layer.succeed(BookService, {
    saveBook: (meta: BookMeta, data: ArrayBuffer) =>
      Effect.tryPromise({
        try: async () => {
          await set(meta.id, meta, bookStore);
          await set(meta.id, data, bookDataStore);
        },
        catch: (cause) => new StorageError({ operation: "saveBook", cause }),
      }),
    getBooks: () =>
      Effect.tryPromise({
        try: async () => {
          const allEntries = await entries<string, BookMeta>(bookStore);
          return allEntries.map(([, meta]) => meta).filter(Boolean);
        },
        catch: (cause) => new StorageError({ operation: "getBooks", cause }),
      }),
    getBook: (id: string) =>
      Effect.gen(function* () {
        const meta = yield* Effect.tryPromise({
          try: () => get<BookMeta>(id, bookStore),
          catch: (cause) => new StorageError({ operation: "getBook", cause }),
        });
        if (!meta) return yield* Effect.fail(new BookNotFoundError({ bookId: id }));
        return meta;
      }),
    getBookData: (id: string) =>
      Effect.gen(function* () {
        const data = yield* Effect.tryPromise({
          try: () => get<ArrayBuffer>(id, bookDataStore),
          catch: (cause) => new StorageError({ operation: "getBookData", cause }),
        });
        if (!data) return yield* Effect.fail(new BookNotFoundError({ bookId: id }));
        return data;
      }),
    deleteBook: (id: string) =>
      Effect.tryPromise({
        try: () => del(id, bookStore),
        catch: (cause) => new StorageError({ operation: "deleteBook", cause }),
      }),
  });

  const positionLayer = Layer.succeed(ReadingPositionService, {
    savePosition: (bookId: string, cfi: string) =>
      Effect.tryPromise({
        try: () => set(bookId, cfi, posStore),
        catch: (cause) => new PositionError({ operation: "savePosition", bookId, cause }),
      }),
    getPosition: (bookId: string) =>
      Effect.tryPromise({
        try: async () => {
          const cfi = await get<string>(bookId, posStore);
          return cfi ?? null;
        },
        catch: (cause) => new PositionError({ operation: "getPosition", bookId, cause }),
      }),
  });

  return { bookLayer, positionLayer };
}

describe("BookService", () => {
  describe("saveBook + getBooks", () => {
    it("saves and retrieves books", async () => {
      const { bookLayer } = makeTestLayer();
      const run = <A, E>(e: Effect.Effect<A, E, BookService>) =>
        Effect.runPromise(Effect.provide(e, bookLayer));
      const book = makeBook();
      await run(BookService.pipe(Effect.andThen((s) => s.saveBook(book, book.data))));
      const books = await run(BookService.pipe(Effect.andThen((s) => s.getBooks())));
      expect(books).toHaveLength(1);
      expect(books[0].id).toBe("book-1");
      expect(books[0].title).toBe("Test Book");
    });

    it("returns empty array when no books", async () => {
      const { bookLayer } = makeTestLayer();
      const run = <A, E>(e: Effect.Effect<A, E, BookService>) =>
        Effect.runPromise(Effect.provide(e, bookLayer));
      const books = await run(BookService.pipe(Effect.andThen((s) => s.getBooks())));
      expect(books).toEqual([]);
    });
  });

  describe("getBook", () => {
    it("retrieves a single book by id", async () => {
      const { bookLayer } = makeTestLayer();
      const run = <A, E>(e: Effect.Effect<A, E, BookService>) =>
        Effect.runPromise(Effect.provide(e, bookLayer));
      const book = makeBook();
      await run(BookService.pipe(Effect.andThen((s) => s.saveBook(book, book.data))));
      const result = await run(BookService.pipe(Effect.andThen((s) => s.getBook("book-1"))));
      expect(result.id).toBe("book-1");
      expect(result.title).toBe("Test Book");
    });

    it("fails with BookNotFoundError for missing book", async () => {
      const { bookLayer } = makeTestLayer();
      const exit = await Effect.runPromiseExit(
        Effect.provide(BookService.pipe(Effect.andThen((s) => s.getBook("nonexistent"))), bookLayer),
      );
      expect(exit._tag).toBe("Failure");
      if (exit._tag === "Failure") {
        expect((exit.cause as any).error?._tag).toBe("BookNotFoundError");
      }
    });
  });

  describe("deleteBook", () => {
    it("deletes a book", async () => {
      const { bookLayer } = makeTestLayer();
      const run = <A, E>(e: Effect.Effect<A, E, BookService>) =>
        Effect.runPromise(Effect.provide(e, bookLayer));
      const book = makeBook();
      await run(BookService.pipe(Effect.andThen((s) => s.saveBook(book, book.data))));
      await run(BookService.pipe(Effect.andThen((s) => s.deleteBook("book-1"))));
      const books = await run(BookService.pipe(Effect.andThen((s) => s.getBooks())));
      expect(books).toEqual([]);
    });
  });
});

describe("ReadingPositionService", () => {
  describe("savePosition + getPosition", () => {
    it("saves and retrieves a reading position", async () => {
      const { positionLayer } = makeTestLayer();
      const run = <A, E>(e: Effect.Effect<A, E, ReadingPositionService>) =>
        Effect.runPromise(Effect.provide(e, positionLayer));
      await run(ReadingPositionService.pipe(Effect.andThen((s) => s.savePosition("book-1", "epubcfi(/6/4)"))));
      const pos = await run(ReadingPositionService.pipe(Effect.andThen((s) => s.getPosition("book-1"))));
      expect(pos).toBe("epubcfi(/6/4)");
    });

    it("returns null for missing position", async () => {
      const { positionLayer } = makeTestLayer();
      const run = <A, E>(e: Effect.Effect<A, E, ReadingPositionService>) =>
        Effect.runPromise(Effect.provide(e, positionLayer));
      const pos = await run(ReadingPositionService.pipe(Effect.andThen((s) => s.getPosition("no-book"))));
      expect(pos).toBeNull();
    });

    it("overwrites an existing position", async () => {
      const { positionLayer } = makeTestLayer();
      const run = <A, E>(e: Effect.Effect<A, E, ReadingPositionService>) =>
        Effect.runPromise(Effect.provide(e, positionLayer));
      await run(ReadingPositionService.pipe(Effect.andThen((s) => s.savePosition("book-1", "epubcfi(/6/4)"))));
      await run(ReadingPositionService.pipe(Effect.andThen((s) => s.savePosition("book-1", "epubcfi(/6/8)"))));
      const pos = await run(ReadingPositionService.pipe(Effect.andThen((s) => s.getPosition("book-1"))));
      expect(pos).toBe("epubcfi(/6/8)");
    });
  });
});
