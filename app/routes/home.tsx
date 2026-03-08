import { useState, useCallback } from "react";

import type { Route } from "./+types/home";
import { getBooks, type Book } from "~/lib/book-store";
import { DropZone } from "~/components/drop-zone";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "eBook Reader" },
    { name: "description", content: "A browser-based ebook reader" },
  ];
}

export async function clientLoader() {
  const books = await getBooks();
  return { books };
}

// Prevent SSR loader from running — data comes from IndexedDB client-side only
clientLoader.hydrate = true as const;

export function HydrateFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">Loading library…</p>
    </div>
  );
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const [books, setBooks] = useState<Book[]>(loaderData.books);

  const handleBookAdded = useCallback((book: Book) => {
    setBooks((prev) => [...prev, book]);
  }, []);

  return (
    <DropZone onBookAdded={handleBookAdded}>
      <div className="container mx-auto p-6">
        <h1 className="mb-6 text-2xl font-bold">Library</h1>

        {books.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-lg text-muted-foreground">
              No books yet
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Drag and drop .epub files anywhere on this page to get started
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {books.map((book) => (
              <div
                key={book.id}
                className="group rounded-lg border bg-card p-3 transition-colors hover:bg-accent"
              >
                {book.coverUrl ? (
                  <img
                    src={book.coverUrl}
                    alt={book.title}
                    className="mb-2 aspect-[2/3] w-full rounded object-cover"
                  />
                ) : (
                  <div className="mb-2 flex aspect-[2/3] w-full items-center justify-center rounded bg-muted">
                    <span className="text-3xl text-muted-foreground">📖</span>
                  </div>
                )}
                <p className="truncate text-sm font-medium">{book.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {book.author}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </DropZone>
  );
}
