import { useEffect, useRef, useCallback } from "react";
import ePub from "epubjs";
import type EpubBook from "epubjs/types/book";
import type Rendition from "epubjs/types/rendition";
import { Button } from "~/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Book } from "~/lib/book-store";
import { useSettings } from "~/lib/settings";
import type { ReaderLayout } from "~/lib/settings";
import { ReaderSettingsMenu } from "~/components/reader-settings-menu";

interface BookReaderProps {
  book: Book;
}

function getRenditionOptions(layout: ReaderLayout) {
  switch (layout) {
    case "spread":
      return { spread: "always" as const, flow: "paginated" as const };
    case "scroll":
      return { spread: "none" as const, flow: "scrolled-doc" as const };
    case "single":
    default:
      return { spread: "none" as const, flow: "paginated" as const };
  }
}

export function BookReader({ book }: BookReaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<EpubBook | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const [settings, updateSettings] = useSettings();
  const layoutRef = useRef(settings.readerLayout);

  // Keep layoutRef in sync
  layoutRef.current = settings.readerLayout;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const opts = getRenditionOptions(settings.readerLayout);
    const epubBook = ePub(book.data);
    bookRef.current = epubBook;

    const rendition = epubBook.renderTo(el, {
      width: "100%",
      height: "100%",
      spread: opts.spread,
      flow: opts.flow,
    });
    renditionRef.current = rendition;

    rendition.display();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (layoutRef.current === "scroll") return;
      if (e.key === "ArrowLeft") {
        rendition.prev();
      } else if (e.key === "ArrowRight") {
        rendition.next();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      rendition.destroy();
      epubBook.destroy();
      bookRef.current = null;
      renditionRef.current = null;
    };
  }, [book.id, book.data, settings.readerLayout]);

  const handlePrev = useCallback(() => {
    renditionRef.current?.prev();
  }, []);

  const handleNext = useCallback(() => {
    renditionRef.current?.next();
  }, []);

  const handleLayoutChange = useCallback(
    (layout: ReaderLayout) => {
      if (layout === settings.readerLayout) return;

      // Save current location before switching
      const currentLocation = renditionRef.current?.location;
      const cfi =
        currentLocation?.start?.cfi;

      updateSettings({ readerLayout: layout });

      // Position will be restored when the rendition is recreated via the useEffect
      // by displaying the saved CFI after the new rendition mounts
      if (cfi) {
        // Use a microtask to wait for the new rendition to be created
        queueMicrotask(() => {
          renditionRef.current?.display(cfi);
        });
      }
    },
    [settings.readerLayout, updateSettings],
  );

  const isScrollMode = settings.readerLayout === "scroll";

  return (
    <div className="flex h-full flex-col">
      <div ref={containerRef} className="flex-1 overflow-hidden" />
      <div className="flex items-center justify-center gap-4 border-t p-2">
        {!isScrollMode && (
          <>
            <Button variant="ghost" size="icon" onClick={handlePrev}>
              <ChevronLeft className="size-4" />
              <span className="sr-only">Previous page</span>
            </Button>
            <Button variant="ghost" size="icon" onClick={handleNext}>
              <ChevronRight className="size-4" />
              <span className="sr-only">Next page</span>
            </Button>
          </>
        )}
        <ReaderSettingsMenu
          layout={settings.readerLayout}
          onLayoutChange={handleLayoutChange}
        />
      </div>
    </div>
  );
}

