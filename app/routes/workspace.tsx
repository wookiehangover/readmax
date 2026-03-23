import { useState, useCallback, useRef, useEffect } from "react";
import { Effect } from "effect";
import {
  DockviewReact,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
  type DockviewApi,
  type IWatermarkPanelProps,
  type DockviewTheme,
} from "dockview";
import { Link } from "react-router";
import { BookOpen, NotebookPen, Library } from "lucide-react";
import { BookCover } from "~/components/book-list";
import type { Route } from "./+types/workspace";
import { BookService, type Book } from "~/lib/book-store";
import { WorkspaceService } from "~/lib/workspace-store";
import { AppRuntime } from "~/lib/effect-runtime";
import { useSettings } from "~/lib/settings";
import { WorkspaceBookReader } from "~/components/workspace-book-reader";
import { WorkspaceNotebook } from "~/components/workspace-notebook";

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

// --- Navigation coordination ---
// Map of bookId -> navigateToCfi callback, shared across panels
const navigationMap = new Map<string, (cfi: string) => void>();

// --- Panel components ---

function BookReaderPanel({
  params,
  api,
}: IDockviewPanelProps<{ bookId: string }>) {
  const handleRegister = useCallback((bookId: string, nav: (cfi: string) => void) => {
    navigationMap.set(bookId, nav);
  }, []);

  const handleUnregister = useCallback((bookId: string) => {
    navigationMap.delete(bookId);
  }, []);

  return (
    <WorkspaceBookReader
      bookId={params.bookId}
      panelApi={api}
      onRegisterNavigation={handleRegister}
      onUnregisterNavigation={handleUnregister}
    />
  );
}

function NotebookPanel({
  params,
}: IDockviewPanelProps<{ bookId: string; bookTitle: string }>) {
  const handleNavigateToCfi = useCallback(
    (cfi: string) => {
      const nav = navigationMap.get(params.bookId);
      nav?.(cfi);
    },
    [params.bookId],
  );

  return (
    <WorkspaceNotebook
      bookId={params.bookId}
      bookTitle={params.bookTitle}
      onNavigateToCfi={handleNavigateToCfi}
    />
  );
}

const components: Record<string, React.FunctionComponent<IDockviewPanelProps<any>>> = {
  "book-reader": BookReaderPanel,
  notebook: NotebookPanel,
};

// --- Empty state watermark ---

function WatermarkPanel(_props: IWatermarkPanelProps) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <BookOpen className="mx-auto mb-3 size-10 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">No tabs open</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Select a book from the sidebar to get started
        </p>
      </div>
    </div>
  );
}

export default function WorkspaceRoute({ loaderData }: Route.ComponentProps) {
  const [books] = useState<Book[]>(loaderData.books);
  const [settings, updateSettings] = useSettings();
  const collapsed = settings.sidebarCollapsed;
  const apiRef = useRef<DockviewApi | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dockviewTheme: DockviewTheme = {
    name: "app",
    className: "dockview-theme-app",
  };

  // Debounced layout save
  const saveLayout = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const layout = api.toJSON();
      AppRuntime.runPromise(
        WorkspaceService.pipe(Effect.andThen((s) => s.saveLayout(layout))),
      ).catch(console.error);
    }, 500);
  }, []);

  const onReady = useCallback(
    (event: DockviewReadyEvent) => {
      apiRef.current = event.api;

      // Try to restore saved layout
      AppRuntime.runPromise(
        WorkspaceService.pipe(
          Effect.andThen((s) => s.getLayout()),
          Effect.catchAll(() => Effect.succeed(null)),
        ),
      )
        .then((layout) => {
          if (layout) {
            event.api.fromJSON(layout);
          }
        })
        .catch(console.error);

      // Subscribe to layout changes for persistence
      event.api.onDidLayoutChange(() => {
        saveLayout();
      });
    },
    [saveLayout],
  );

  // Cleanup save timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      navigationMap.clear();
    };
  }, []);

  // Cmd+B / Ctrl+B to toggle sidebar
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        updateSettings({ sidebarCollapsed: !collapsed });
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [collapsed, updateSettings]);

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
      renderer: "always",
    });
  }, []);

  const openNotebook = useCallback((book: Book) => {
    const api = apiRef.current;
    if (!api) return;

    const panelId = `notebook-${book.id}`;
    const existing = api.panels.find((p) => p.id === panelId);
    if (existing) {
      existing.focus();
      return;
    }

    api.addPanel({
      id: panelId,
      component: "notebook",
      title: `Notes: ${book.title}`,
      params: { bookId: book.id, bookTitle: book.title },
      renderer: "always",
    });
  }, []);

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside
        className={`flex shrink-0 flex-col border-r bg-card transition-[width] duration-200 ease-in-out ${
          collapsed ? "w-14" : "w-[300px]"
        }`}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          {!collapsed && <h1 className="text-lg font-semibold">Books</h1>}
          <Link
            to="/"
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Back to Library"
          >
            <Library className="size-4" />
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto">
          {books.length === 0 ? (
            !collapsed && (
              <p className="p-4 text-sm text-muted-foreground">
                No books yet. Drop an epub file on the library page.
              </p>
            )
          ) : (
            <ul className="flex flex-col gap-0.5 p-1">
              {books.map((book) => (
                <li key={book.id} className="group/book relative">
                  <button
                    type="button"
                    onClick={() => openBook(book)}
                    className={`flex w-full items-center rounded-md text-left hover:bg-accent ${
                      collapsed ? "justify-center p-1.5" : "gap-3 px-3 py-2"
                    }`}
                    title={book.title}
                  >
                    {book.coverImage ? (
                      <BookCover coverImage={book.coverImage} />
                    ) : (
                      <div className="flex h-12 w-8 shrink-0 items-center justify-center rounded bg-muted">
                        <span className="text-xs text-muted-foreground">📖</span>
                      </div>
                    )}
                    {!collapsed && (
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{book.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{book.author}</p>
                      </div>
                    )}
                  </button>
                  {!collapsed && (
                    <div className="absolute top-1/2 right-1 flex -translate-y-1/2 gap-0.5 opacity-0 group-hover/book:opacity-100">
                      <button
                        type="button"
                        onClick={() => openBook(book)}
                        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                        title="Open book"
                      >
                        <BookOpen className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openNotebook(book)}
                        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                        title="Open notebook"
                      >
                        <NotebookPen className="size-3.5" />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Dockview container */}
      <div className="flex-1">
        <DockviewReact
          theme={dockviewTheme}
          components={components}
          watermarkComponent={WatermarkPanel}
          onReady={onReady}
        />
      </div>
    </div>
  );
}
