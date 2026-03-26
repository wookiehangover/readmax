import { useState, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router";
import { Effect } from "effect";
import { Ellipsis, FileText, Trash2 } from "lucide-react";
import { CoverImage, CoverPlaceholder, AddBookCard } from "~/components/book-grid";
import type { Route } from "./+types/library-index";
import { BookService, type Book } from "~/lib/book-store";
import { AnnotationService } from "~/lib/annotations-store";
import { AppRuntime } from "~/lib/effect-runtime";
import { parseEpubEffect } from "~/lib/epub-service";
import { DropZone } from "~/components/drop-zone";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Reader" }, { name: "description", content: "A browser-based ebook reader" }];
}

export async function clientLoader() {
  const books = await AppRuntime.runPromise(BookService.pipe(Effect.andThen((s) => s.getBooks())));
  return { books };
}

clientLoader.hydrate = true as const;

export function HydrateFallback() {
  return (
    <div className="flex h-dvh items-center justify-center">
      <p className="text-muted-foreground">Loading library…</p>
    </div>
  );
}



export default function LibraryIndex({ loaderData }: Route.ComponentProps) {
  const [books, setBooks] = useState<Book[]>(loaderData.books);
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleBookAdded = useCallback((book: Book) => {
    setBooks((prev) => [...prev, book]);
  }, []);

  const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      if (!file.name.endsWith(".epub")) continue;
      try {
        const arrayBuffer = await file.arrayBuffer();
        const metadata = await AppRuntime.runPromise(parseEpubEffect(arrayBuffer));
        const book: Book = {
          id: crypto.randomUUID(),
          title: metadata.title,
          author: metadata.author,
          coverImage: metadata.coverImage,
          data: arrayBuffer,
        };
        await AppRuntime.runPromise(BookService.pipe(Effect.andThen((s) => s.saveBook(book))));
        setBooks((prev) => [...prev, book]);
      } catch (err) {
        console.error("Failed to add book:", err);
      }
    }
    e.target.value = "";
  }, []);

  const handleDeleteBook = useCallback(async (bookId: string) => {
    const confirmed = window.confirm("Are you sure you want to delete this book?");
    if (!confirmed) return;

    const program = Effect.gen(function* () {
      const bookSvc = yield* BookService;
      const annotationSvc = yield* AnnotationService;

      // Delete all highlights for this book
      const highlights = yield* annotationSvc.getHighlightsByBook(bookId);
      for (const hl of highlights) {
        yield* annotationSvc.deleteHighlight(hl.id);
      }

      // Delete the book itself
      yield* bookSvc.deleteBook(bookId);
    }).pipe(
      Effect.catchAll((error) =>
        Effect.sync(() => {
          console.error("Failed to delete book:", error);
        }),
      ),
    );

    await AppRuntime.runPromise(program);
    setBooks((prev) => prev.filter((b) => b.id !== bookId));
  }, []);

  return (
    <DropZone onBookAdded={handleBookAdded}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".epub"
        multiple
        className="hidden"
        onChange={handleFileInput}
      />
      {books.length === 0 ? (
        <div className="flex h-dvh items-center justify-center p-6">
          <div className="w-40">
            <AddBookCard onClick={() => fileInputRef.current?.click()} />
          </div>
        </div>
      ) : (
        <div className="h-dvh overflow-y-auto p-4 md:p-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {books.map((book) => (
              <div key={book.id} className="group relative">
                <Link to={`/books/${book.id}`} className="block">
                  <div className="overflow-hidden rounded-lg shadow-sm transition-shadow group-hover:shadow-md">
                    {book.coverImage ? (
                      <CoverImage coverImage={book.coverImage} alt={book.title} />
                    ) : (
                      <CoverPlaceholder title={book.title} author={book.author} />
                    )}
                  </div>
                  <p className="mt-2 truncate text-sm font-medium">{book.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{book.author}</p>
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className="absolute top-1 right-1 flex size-7 items-center justify-center rounded-md bg-black/50 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/70 focus-visible:opacity-100 group-hover:opacity-100"
                    render={<button type="button" />}
                    onClick={(e) => e.preventDefault()}
                  >
                    <Ellipsis className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => navigate(`/books/${book.id}/details`)}>
                      <FileText className="size-4" />
                      Details
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => handleDeleteBook(book.id)}
                    >
                      <Trash2 className="size-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
            <div>
              <AddBookCard onClick={() => fileInputRef.current?.click()} />
            </div>
          </div>
        </div>
      )}
    </DropZone>
  );
}
