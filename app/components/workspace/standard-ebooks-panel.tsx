import { useCallback } from "react";
import type { IDockviewPanelProps } from "dockview";
import type { Book } from "~/lib/book-store";
import { useWorkspace } from "~/lib/workspace-context";
import { StandardEbooksBrowser } from "~/components/standard-ebooks-browser";

export function StandardEbooksPanel(_props: IDockviewPanelProps<Record<string, never>>) {
  const ws = useWorkspace();

  const handleBookAdded = useCallback(
    (book: Book) => {
      ws.booksRef.current = [...ws.booksRef.current, book];
      ws.booksChangeListener.current?.();
      ws.openBookRef.current?.(book);
    },
    [ws],
  );

  return <StandardEbooksBrowser onBookAdded={handleBookAdded} />;
}
