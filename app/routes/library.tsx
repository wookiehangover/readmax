import { useState, useCallback } from "react";
import { Effect } from "effect";
import { Outlet } from "react-router";
import type { Route } from "./+types/library";
import { BookService, type Book } from "~/lib/book-store";
import { AppRuntime } from "~/lib/effect-runtime";
import { DropZone } from "~/components/drop-zone";
import { ReaderNavigationProvider } from "~/lib/reader-context";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "eBook Reader" },
    { name: "description", content: "A browser-based ebook reader" },
  ];
}

export async function clientLoader() {
  const books = await AppRuntime.runPromise(BookService.pipe(Effect.andThen((s) => s.getBooks())));
  return { books };
}

clientLoader.hydrate = true as const;

export function HydrateFallback() {
  return (
    <div className="flex h-screen items-center justify-center">
      <p className="text-muted-foreground">Loading library…</p>
    </div>
  );
}

export default function LibraryLayout({ loaderData }: Route.ComponentProps) {
  const [books, setBooks] = useState<Book[]>(loaderData.books);

  const handleBookAdded = useCallback((book: Book) => {
    setBooks((prev) => [...prev, book]);
  }, []);

  return (
    <ReaderNavigationProvider>
      <DropZone onBookAdded={handleBookAdded}>
        <main className="h-screen">
          <Outlet context={{ books }} />
        </main>
      </DropZone>
    </ReaderNavigationProvider>
  );
}
