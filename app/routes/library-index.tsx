import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router";
import { Effect } from "effect";
import { BookOpen } from "lucide-react";
import type { Route } from "./+types/library-index";
import { BookService, type Book } from "~/lib/book-store";
import { AppRuntime } from "~/lib/effect-runtime";
import { DropZone } from "~/components/drop-zone";

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

function CoverImage({ coverImage, alt }: { coverImage: Blob; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(coverImage);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [coverImage]);

  if (!url) return null;

  return (
    <img
      src={url}
      alt={alt}
      className="aspect-[2/3] w-full rounded-lg object-cover"
    />
  );
}

function CoverPlaceholder({ title, author }: { title: string; author: string }) {
  return (
    <div className="flex aspect-[2/3] w-full flex-col items-center justify-center rounded-lg bg-muted p-3 text-center">
      <BookOpen className="mb-2 size-8 text-muted-foreground/50" />
      <p className="line-clamp-3 text-sm font-medium text-muted-foreground">
        {title}
      </p>
      {author && (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground/70">
          {author}
        </p>
      )}
    </div>
  );
}

export default function LibraryIndex({ loaderData }: Route.ComponentProps) {
  const [books, setBooks] = useState<Book[]>(loaderData.books);

  const handleBookAdded = useCallback((book: Book) => {
    setBooks((prev) => [...prev, book]);
  }, []);

  return (
    <DropZone onBookAdded={handleBookAdded}>
      {books.length === 0 ? (
        <div className="flex h-screen flex-col items-center justify-center text-center">
          <BookOpen className="mb-4 size-12 text-muted-foreground/50" />
          <p className="text-lg font-medium text-muted-foreground">
            Your library is empty
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Drop an .epub file anywhere to get started
          </p>
        </div>
      ) : (
        <div className="h-screen overflow-y-auto p-6">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {books.map((book) => (
              <Link
                key={book.id}
                to={`/books/${book.id}`}
                className="group block"
              >
                <div className="overflow-hidden rounded-lg shadow-sm transition-shadow group-hover:shadow-md">
                  {book.coverImage ? (
                    <CoverImage coverImage={book.coverImage} alt={book.title} />
                  ) : (
                    <CoverPlaceholder title={book.title} author={book.author} />
                  )}
                </div>
                <p className="mt-2 truncate text-sm font-medium">{book.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {book.author}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </DropZone>
  );
}
