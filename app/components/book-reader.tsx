import { useEffect, useRef, useCallback, useState } from "react";
import type Rendition from "epubjs/types/rendition";
import { Button } from "~/components/ui/button";
import { ChevronLeft, ChevronRight, Notebook, Search, TableOfContents } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "~/components/ui/popover";
import { TocList } from "~/components/book-list";
import type { BookMeta } from "~/lib/book-store";
import { useSettings } from "~/lib/settings";
import { ReaderSettingsMenu } from "~/components/reader-settings-menu";
import { AnnotationsPanel } from "~/components/annotations-panel";
import { HighlightPopover } from "~/components/highlight-popover";
import { useHighlights } from "~/lib/use-highlights";
import { useReaderNavigation } from "~/lib/reader-context";
import type { TiptapEditorHandle } from "~/components/tiptap-editor";
import type { HighlightReferenceAttrs } from "~/lib/tiptap-highlight-node";
import { cn } from "~/lib/utils";
import { useBookSearch } from "~/lib/use-book-search";
import { SearchBar } from "~/components/search-bar";
import { useEpubLifecycle } from "~/hooks/use-epub-lifecycle";

interface BookReaderProps {
  book: BookMeta;
}

export function BookReader({ book }: BookReaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<Rendition | null>(null);

  const [settings, updateSettings] = useSettings();
  const [annotationsPanelOpen, setAnnotationsPanelOpen] = useState(false);
  const editorRef = useRef<TiptapEditorHandle>(null);
  const [pendingHighlight, setPendingHighlight] = useState<HighlightReferenceAttrs | null>(null);
  const { toc: contextToc, navigateToHref, setToc, setNavigateToHref } = useReaderNavigation();
  const [tocOpen, setTocOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const {
    selectionPopover,
    editPopover,
    saveHighlight: saveHighlightFromPopover,
    deleteHighlightFromPopover,
    dismissPopovers,
    loadAndApplyHighlights,
    registerSelectionHandler,
  } = useHighlights({ bookId: book.id, renditionRef, containerRef });

  const { bookRef, toc, bookProgress, currentPage, totalPages, navigateToCfi } = useEpubLifecycle({
    bookId: book.id,
    containerRef,
    readerLayout: settings.readerLayout,
    fontFamily: settings.fontFamily,
    fontSize: settings.fontSize,
    lineHeight: settings.lineHeight,
    theme: settings.theme,
    loadAndApplyHighlights,
    registerSelectionHandler,
    onTocExtracted: (tocData) => {
      setToc(tocData);
      setNavigateToHref((href: string) => {
        renditionRef.current?.display(href).catch((err: unknown) => {
          console.warn("TOC navigation failed:", err);
        });
      });
    },
    onCleanupToc: () => {
      setToc([]);
      setNavigateToHref(() => {});
    },
    onSearchOpen: () => setSearchOpen(true),
    renditionRef,
  });

  const {
    search,
    results,
    currentIndex,
    next: searchNext,
    prev: searchPrev,
    clear: searchClear,
  } = useBookSearch(bookRef);

  // Use contextToc from the navigation context (synced via onTocExtracted)
  const activeToc = contextToc.length > 0 ? contextToc : toc;

  useEffect(() => {
    const timer = setTimeout(() => {
      (renditionRef.current as any)?.resize();
    }, 350);
    return () => clearTimeout(timer);
  }, [annotationsPanelOpen]);

  // Track previous search annotations so we can remove them
  const prevSearchCfisRef = useRef<string[]>([]);

  // Navigate to the current search result when it changes
  useEffect(() => {
    if (results.length > 0 && results[currentIndex]) {
      renditionRef.current?.display(results[currentIndex].cfi).catch((err: unknown) => {
        console.warn("Search navigation failed:", err);
      });
    }
  }, [results, currentIndex]);

  // Apply/remove search highlight annotations in the epub
  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition) return;

    // Remove previous annotations
    for (const cfi of prevSearchCfisRef.current) {
      try {
        rendition.annotations.remove(cfi, "highlight");
      } catch {
        // annotation may not exist
      }
    }

    if (results.length === 0) {
      prevSearchCfisRef.current = [];
      return;
    }

    // Add highlight annotations for all results
    const cfis: string[] = [];
    for (let i = 0; i < results.length; i++) {
      const cfi = results[i].cfi;
      cfis.push(cfi);
      const isCurrent = i === currentIndex;
      const className = isCurrent ? "search-hl-current" : "search-hl";
      try {
        rendition.annotations.highlight(cfi, {}, undefined, className, {
          fill: isCurrent ? "rgba(59, 130, 246, 0.6)" : "rgba(59, 130, 246, 0.25)",
          "fill-opacity": "1",
          "mix-blend-mode": "multiply",
        });
      } catch {
        // annotation may fail for invalid CFIs
      }
    }
    prevSearchCfisRef.current = cfis;
  }, [results, currentIndex]);

  // Clear search state when book changes
  useEffect(() => {
    setSearchOpen(false);
    setSearchQuery("");
    searchClear();
  }, [book.id, searchClear]);

  // Intercept Cmd/Ctrl+F in parent page and epub iframe
  useEffect(() => {
    const handleFindShortcut = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        e.stopPropagation();
        setSearchOpen(true);
      }
    };

    document.addEventListener("keydown", handleFindShortcut);

    // Also intercept in the epub iframe
    const rendition = renditionRef.current;
    const contents = (rendition as any)?.getContents?.() as any[] | undefined;
    contents?.forEach((content: any) => {
      content.document?.addEventListener("keydown", handleFindShortcut);
    });

    return () => {
      document.removeEventListener("keydown", handleFindShortcut);
      contents?.forEach((content: any) => {
        content.document?.removeEventListener("keydown", handleFindShortcut);
      });
    };
  }, []);

  const handleSearchQueryChange = useCallback(
    (query: string) => {
      setSearchQuery(query);
      search(query);
    },
    [search],
  );

  const handleSearchClose = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery("");
    searchClear();
  }, [searchClear]);

  const handlePrev = useCallback(() => renditionRef.current?.prev(), []);
  const handleNext = useCallback(() => renditionRef.current?.next(), []);

  const handleUpdateSettings = useCallback(
    (update: Partial<typeof settings>) => {
      if (update.readerLayout && update.readerLayout !== settings.readerLayout) {
        const cfi = renditionRef.current?.location?.start?.cfi;
        updateSettings(update);
        if (cfi) queueMicrotask(() => renditionRef.current?.display(cfi));
        return;
      }
      updateSettings(update);
    },
    [settings.readerLayout, updateSettings],
  );

  const handleSaveHighlight = useCallback(async () => {
    const highlight = await saveHighlightFromPopover();
    if (highlight) {
      const attrs: HighlightReferenceAttrs = {
        highlightId: highlight.id,
        cfiRange: highlight.cfiRange,
        text: highlight.text,
      };

      // If the editor is already mounted, append directly
      if (editorRef.current) {
        editorRef.current.appendHighlightReference(attrs);
      } else {
        // Queue the highlight and open the panel — the useEffect below
        // will flush it once the editor mounts
        setPendingHighlight(attrs);
      }

      // Always ensure the panel is open
      setAnnotationsPanelOpen(true);
    }
  }, [saveHighlightFromPopover]);

  // Flush pending highlight once the editor is mounted
  useEffect(() => {
    if (pendingHighlight && editorRef.current) {
      editorRef.current.appendHighlightReference(pendingHighlight);
      setPendingHighlight(null);
    }
  });

  const isScrollMode = settings.readerLayout === "scroll";

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="relative flex-1 overflow-hidden">
          {searchOpen && (
            <div className="absolute top-0 right-0 left-0 z-10">
              <SearchBar
                query={searchQuery}
                onQueryChange={handleSearchQueryChange}
                resultCount={results.length}
                currentIndex={currentIndex}
                onNext={searchNext}
                onPrev={searchPrev}
                onClose={handleSearchClose}
              />
            </div>
          )}
          <div
            ref={containerRef}
            className={cn("h-full overflow-hidden", {
              "px-4 pt-6 pb-2 md:px-8 md:pt-10 md:pb-4": settings.readerLayout,
            })}
          />
        </div>
        <div className="flex items-center justify-between border-t px-2 min-h-14 md:min-h-10 pb-[env(safe-area-inset-bottom)]">
          <div className="flex items-center gap-1.5">
            {totalPages !== null && currentPage !== null ? (
              <span className="text-muted-foreground text-[10px] tabular-nums md:text-xs">
                Page {currentPage} of {totalPages}
              </span>
            ) : (
              <span className="text-muted-foreground text-[10px] tabular-nums md:text-xs">
                {Math.round(bookProgress)}%
              </span>
            )}
          </div>
          <div className="flex items-center gap-0 md:gap-1">
            {!isScrollMode && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden size-10 md:flex md:size-8"
                  onClick={handlePrev}
                >
                  <ChevronLeft className="size-5 md:size-4" />
                  <span className="sr-only">Previous page</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden size-10 md:flex md:size-8"
                  onClick={handleNext}
                >
                  <ChevronRight className="size-5 md:size-4" />
                  <span className="sr-only">Next page</span>
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="size-10 md:size-8"
              onClick={() => setSearchOpen((prev) => !prev)}
              title="Search in book (Cmd+F)"
            >
              <Search className="size-5 md:size-4" />
              <span className="sr-only">Search in book</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-10 md:size-8"
              onClick={() => setAnnotationsPanelOpen(!annotationsPanelOpen)}
              title="Toggle notebook"
            >
              <Notebook className="size-5 md:size-4" />
              <span className="sr-only">Toggle notebook</span>
            </Button>
            {activeToc.length > 0 && (
              <Popover open={tocOpen} onOpenChange={setTocOpen}>
                <PopoverTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-10 md:size-8"
                      title="Table of Contents"
                    />
                  }
                >
                  <TableOfContents className="size-5 md:size-4" />
                  <span className="sr-only">Table of Contents</span>
                </PopoverTrigger>
                <PopoverContent
                  side="top"
                  align="end"
                  sideOffset={8}
                  className="max-h-80 w-64 overflow-y-auto p-1.5"
                >
                  <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
                    Table of Contents
                  </p>
                  <ul>
                    <TocList
                      entries={activeToc}
                      onNavigate={(href) => {
                        navigateToHref(href);
                        setTocOpen(false);
                      }}
                    />
                  </ul>
                </PopoverContent>
              </Popover>
            )}
            <ReaderSettingsMenu settings={settings} onUpdateSettings={handleUpdateSettings} />
          </div>
        </div>
        {selectionPopover && (
          <HighlightPopover
            position={selectionPopover.position}
            selectedText={selectionPopover.text}
            onSave={handleSaveHighlight}
            onDismiss={dismissPopovers}
          />
        )}
        {editPopover && (
          <HighlightPopover
            mode="edit"
            position={editPopover.position}
            selectedText={editPopover.highlight.text}
            onDelete={deleteHighlightFromPopover}
            onDismiss={dismissPopovers}
          />
        )}
      </div>
      <AnnotationsPanel
        bookId={book.id}
        bookTitle={book.title}
        isOpen={annotationsPanelOpen}
        onClose={() => setAnnotationsPanelOpen(false)}
        onNavigateToCfi={navigateToCfi}
        editorRef={editorRef}
      />
    </div>
  );
}
