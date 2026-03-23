import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router";
import { BookOpen } from "lucide-react";
import type { Book } from "~/lib/book-store";

interface LibraryOutletContext {
  books: Book[];
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

export default function LibraryIndex() {
  const { books } = useOutletContext<LibraryOutletContext>();

  if (books.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center">
        <BookOpen className="mb-4 size-12 text-muted-foreground/50" />
        <p className="text-lg font-medium text-muted-foreground">
          Your library is empty
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Drop an .epub file anywhere to get started
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6">
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
  );
}
