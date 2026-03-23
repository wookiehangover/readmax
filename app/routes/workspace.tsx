import { useState, useCallback, useRef } from "react";
import { Effect } from "effect";
import {
  DockviewReact,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
  type DockviewApi,
} from "dockview";
import type { Route } from "./+types/workspace";
import { BookService, type Book } from "~/lib/book-store";
import { AppRuntime } from "~/lib/effect-runtime";
import { useSettings, resolveTheme } from "~/lib/settings";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Workspace" },
    { name: "description", content: "Multi-pane book workspace" },
  ];
}

export async function clientLoader() {
  const books = await AppRuntime.runPromise(
    BookService.pipe(Effect.andThen((s) => s.getBooks())),
  );
  return { books };
}

clientLoader.hydrate = true as const;

export function HydrateFallback() {
  return (
    <div className="flex h-screen items-center justify-center">
      <p className="text-muted-foreground">Loading workspace…</p>
    </div>
  );
}

function BookReaderPanel({ params }: IDockviewPanelProps<{ bookId: string; bookTitle: string }>) {
  return (
    <div className="flex h-full items-center justify-center p-4 text-foreground">
      <div className="text-center">
        <p className="text-lg font-semibold">{params.bookTitle}</p>
        <p className="text-sm text-muted-foreground">Book reader panel — {params.bookId}</p>
      </div>
    </div>
  );
}

function NotebookPanel({ params }: IDockviewPanelProps<{ bookId?: string; title?: string }>) {
  return (
    <div className="flex h-full items-center justify-center p-4 text-foreground">
      <div className="text-center">
        <p className="text-lg font-semibold">{params.title ?? "Notebook"}</p>
        <p className="text-sm text-muted-foreground">Notebook panel</p>
      </div>
    </div>
  );
}

const components: Record<string, React.FunctionComponent<IDockviewPanelProps<any>>> = {
  "book-reader": BookReaderPanel,
  notebook: NotebookPanel,
};

export default function WorkspaceRoute({ loaderData }: Route.ComponentProps) {
  const [books] = useState<Book[]>(loaderData.books);
  const [settings] = useSettings();
  const apiRef = useRef<DockviewApi | null>(null);

  const effectiveTheme = resolveTheme(settings.theme);
  const dockviewTheme =
    effectiveTheme === "dark" ? "dockview-theme-dark" : "dockview-theme-light";

  const onReady = useCallback((event: DockviewReadyEvent) => {
    apiRef.current = event.api;
  }, []);

  const openBook = useCallback((book: Book) => {
    const api = apiRef.current;
    if (!api) return;

    const panelId = `book-${book.id}`;
    const existing = api.panels.find((p) => p.id === panelId);
    if (existing) {
      existing.focus();
      return;
    }

    api.addPanel({
      id: panelId,
      component: "book-reader",
      title: book.title,
      params: { bookId: book.id, bookTitle: book.title },
    });
  }, []);

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="flex w-[240px] shrink-0 flex-col border-r bg-card">
        <div className="border-b px-4 py-3">
          <h1 className="text-lg font-semibold">Books</h1>
        </div>
        <div className="flex-1 overflow-y-auto">
          {books.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              No books yet. Drop an epub file on the library page.
            </p>
          ) : (
            <ul className="space-y-1 p-2">
              {books.map((book) => (
                <li key={book.id}>
                  <button
                    type="button"
                    onClick={() => openBook(book)}
                    className="w-full rounded px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    <p className="truncate font-medium">{book.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{book.author}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Dockview container */}
      <div className="flex-1">
        <DockviewReact
          className={dockviewTheme}
          components={components}
          onReady={onReady}
        />
      </div>
    </div>
  );
}

