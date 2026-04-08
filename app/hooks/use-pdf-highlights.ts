import { useCallback, useEffect, useRef, useState } from "react";
import { Effect } from "effect";
import { AnnotationService, type Highlight } from "~/lib/annotations-store";
import { AppRuntime } from "~/lib/effect-runtime";
import { type Theme, resolveTheme } from "~/lib/settings";

const HIGHLIGHT_COLOR_LIGHT = "rgba(255, 213, 79, 0.6)";
const HIGHLIGHT_COLOR_DARK = "rgba(255, 220, 100, 0.8)";

function getHighlightColor(theme: Theme): string {
  return resolveTheme(theme) === "dark" ? HIGHLIGHT_COLOR_DARK : HIGHLIGHT_COLOR_LIGHT;
}

export interface PdfSelectionPopover {
  position: { x: number; y: number };
  text: string;
  pageNumber: number;
  textOffset: number;
  textLength: number;
}

interface UsePdfHighlightsOptions {
  bookId: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
  theme: Theme;
  onHighlightClick?: (highlight: Highlight) => void;
}

/** Build the synthetic cfiRange string used as a key for PDF highlights. */
function makePdfCfiRange(pageNumber: number, textOffset: number, textLength: number): string {
  return `pdf:page:${pageNumber}:offset:${textOffset}:len:${textLength}`;
}

/**
 * Given a text layer div and a Selection range, compute the character offset
 * of the selection start within the full text content of the page.
 */
function computeTextOffset(textLayerDiv: HTMLElement, range: Range): number {
  // Walk up from range.startContainer to find the containing direct-child span
  let startNode: Node | null = range.startContainer;
  let containingSpan: HTMLElement | null = null;
  while (startNode && startNode !== textLayerDiv) {
    if (startNode instanceof HTMLElement && startNode.parentElement === textLayerDiv) {
      containingSpan = startNode;
      break;
    }
    startNode = startNode.parentNode;
  }

  if (!containingSpan) return 0;

  // Sum text lengths of all preceding direct-child spans in DOM order
  let offset = 0;
  const children = textLayerDiv.children;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child === containingSpan) {
      // Add the offset within this span
      offset += range.startOffset;
      break;
    }
    offset += child.textContent?.length ?? 0;
  }
  return offset;
}

/**
 * Render highlight overlay rectangles on the text layer for a given highlight.
 * Returns the created overlay element for cleanup.
 */
function renderHighlightOverlay(
  textLayerDiv: HTMLElement,
  highlight: Highlight,
  onClick: (e: MouseEvent) => void,
): HTMLDivElement | null {
  const { textOffset, textLength } = highlight;
  if (textOffset === undefined || textLength === undefined) return null;

  // Walk text layer spans to find the character range
  const spans = textLayerDiv.querySelectorAll("span");
  let charCount = 0;
  let startFound = false;
  const rects: DOMRect[] = [];

  for (const span of spans) {
    const spanText = span.textContent ?? "";
    const spanLen = spanText.length;
    const spanStart = charCount;
    const spanEnd = charCount + spanLen;
    charCount = spanEnd;

    // Check if this span overlaps with our highlight range
    const hlStart = textOffset;
    const hlEnd = textOffset + textLength;

    if (spanEnd <= hlStart) continue;
    if (spanStart >= hlEnd) break;

    // This span overlaps — get the overlapping portion
    const overlapStart = Math.max(0, hlStart - spanStart);
    const overlapEnd = Math.min(spanLen, hlEnd - spanStart);

    if (overlapStart >= overlapEnd) continue;

    // Create a range for this portion of the span
    const textNode = span.firstChild;
    if (!textNode) continue;

    try {
      const r = document.createRange();
      r.setStart(textNode, overlapStart);
      r.setEnd(textNode, overlapEnd);
      const clientRects = r.getClientRects();
      for (const rect of clientRects) {
        rects.push(rect);
      }
      startFound = true;
    } catch {
      // Skip invalid ranges
    }
  }

  if (!startFound || rects.length === 0) return null;

  // Create overlay container positioned inside the text layer so coordinates
  // are naturally relative to the same parent. The text layer is position:absolute
  // with a CSS scale transform, so children share its coordinate system.
  const overlay = document.createElement("div");
  overlay.className = "pdf-highlight-overlay";
  overlay.dataset.highlightId = highlight.id;
  overlay.style.cssText =
    "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;";

  // Get the text layer's viewport rect to convert getClientRects() results
  // into text-layer-local coordinates. We must account for the CSS scale
  // transform that pdf.js applies to the text layer.
  const textLayerRect = textLayerDiv.getBoundingClientRect();
  const transformStr = textLayerDiv.style.transform;
  const scaleMatch = transformStr.match(/scale\(([^)]+)\)/);
  const scale = scaleMatch ? parseFloat(scaleMatch[1]) : 1;

  for (const rect of rects) {
    const mark = document.createElement("div");
    // getClientRects() gives viewport coords; subtract text layer's viewport
    // origin, then divide by scale to get coordinates in the text layer's
    // pre-transform coordinate system.
    const localLeft = (rect.left - textLayerRect.left) / scale;
    const localTop = (rect.top - textLayerRect.top) / scale;
    const localWidth = rect.width / scale;
    const localHeight = rect.height / scale;
    mark.style.cssText = `position:absolute;background:${highlight.color};pointer-events:auto;cursor:pointer;border-radius:2px;`;
    mark.style.left = `${localLeft}px`;
    mark.style.top = `${localTop}px`;
    mark.style.width = `${localWidth}px`;
    mark.style.height = `${localHeight}px`;
    mark.addEventListener("click", onClick);
    overlay.appendChild(mark);
  }

  // Insert overlay inside the text layer div. Place it as the first child
  // so it renders behind the text spans (which are selectable on top).
  textLayerDiv.insertBefore(overlay, textLayerDiv.firstChild);
  return overlay;
}

export function usePdfHighlights({
  bookId,
  containerRef,
  theme,
  onHighlightClick,
}: UsePdfHighlightsOptions) {
  const highlightsRef = useRef<Map<string, Highlight>>(new Map());
  const overlaysRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const [selectionPopover, setSelectionPopover] = useState<PdfSelectionPopover | null>(null);

  const onHighlightClickRef = useRef(onHighlightClick);
  onHighlightClickRef.current = onHighlightClick;

  const makeClickCallback = useCallback(
    (cfiRange: string) => (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const stored = highlightsRef.current.get(cfiRange);
      if (!stored) return;
      setSelectionPopover(null);
      onHighlightClickRef.current?.(stored);
    },
    [],
  );

  /** Apply a single highlight overlay on all matching page wrappers in the container. */
  const applyHighlightOverlay = useCallback(
    (highlight: Highlight) => {
      const el = containerRef.current;
      if (!el) return;

      // Remove existing overlay for this highlight
      const existing = overlaysRef.current.get(highlight.id);
      if (existing) existing.remove();

      const { pageNumber } = highlight;
      if (pageNumber === undefined) return;

      // Find the page wrapper(s) for this page
      const wrappers = el.querySelectorAll<HTMLDivElement>(
        `.pdf-page-wrapper[data-page-number="${pageNumber}"], .pdf-page-wrapper`,
      );

      for (const wrapper of wrappers) {
        const pgNum = wrapper.dataset.pageNumber ? parseInt(wrapper.dataset.pageNumber, 10) : 1;
        // In single-page mode, there's no data-page-number — match if it's the only wrapper
        if (wrapper.dataset.pageNumber && pgNum !== pageNumber) continue;
        if (!wrapper.dataset.pageNumber && wrappers.length > 1) continue;

        const textLayer = wrapper.querySelector<HTMLDivElement>(".pdf-text-layer");
        if (!textLayer) continue;

        const overlay = renderHighlightOverlay(
          textLayer,
          highlight,
          makeClickCallback(highlight.cfiRange),
        );
        if (overlay) {
          overlaysRef.current.set(highlight.id, overlay);
        }
      }
    },
    [containerRef, makeClickCallback],
  );

  /** Load all highlights for this book and render overlays. */
  const loadAndApplyHighlights = useCallback(async () => {
    const program = Effect.gen(function* () {
      const svc = yield* AnnotationService;
      return yield* svc.getHighlightsByBook(bookId);
    }).pipe(
      Effect.catchAll((error) =>
        Effect.sync(() => {
          console.error("Failed to load PDF highlights:", error);
          return [] as Highlight[];
        }),
      ),
    );
    const existing = await AppRuntime.runPromise(program);
    const hlMap = new Map<string, Highlight>();
    for (const hl of existing) {
      hlMap.set(hl.cfiRange, hl);
      applyHighlightOverlay(hl);
    }
    highlightsRef.current = hlMap;
  }, [bookId, applyHighlightOverlay]);

  /** Re-render all highlight overlays (call after page re-render). */
  const reapplyAllHighlights = useCallback(() => {
    // Remove all existing overlays
    for (const overlay of overlaysRef.current.values()) {
      overlay.remove();
    }
    overlaysRef.current.clear();

    // Re-apply
    for (const hl of highlightsRef.current.values()) {
      applyHighlightOverlay(hl);
    }
  }, [applyHighlightOverlay]);

  /** Register mouseup handler on the container to detect text selection in the PDF text layer. */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleMouseUp = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;

      const rawText = selection.toString();
      const trimmedText = rawText.trim();
      if (!trimmedText) return;

      const range = selection.getRangeAt(0);

      // Find the text layer div that contains this selection
      let node: Node | null = range.startContainer;
      let textLayerDiv: HTMLElement | null = null;
      while (node) {
        if (node instanceof HTMLElement && node.classList.contains("pdf-text-layer")) {
          textLayerDiv = node;
          break;
        }
        node = node.parentElement;
      }
      if (!textLayerDiv) return;

      // Get page number from the wrapper
      const wrapper = textLayerDiv.closest<HTMLElement>(".pdf-page-wrapper");
      const pageNumber = wrapper?.dataset.pageNumber ? parseInt(wrapper.dataset.pageNumber, 10) : 1;

      // Compute offset and adjust for any leading whitespace trimmed from the selection
      const textOffset = computeTextOffset(textLayerDiv, range);
      const leadingWhitespace = rawText.length - rawText.trimStart().length;
      const adjustedOffset = textOffset + leadingWhitespace;
      const textLength = trimmedText.length;

      // Position the popover near the selection
      const rangeRect = range.getBoundingClientRect();
      const x = rangeRect.left + rangeRect.width / 2;
      const y = rangeRect.bottom;

      setSelectionPopover({
        position: { x, y },
        text: trimmedText,
        pageNumber,
        textOffset: adjustedOffset,
        textLength,
      });
    };

    el.addEventListener("mouseup", handleMouseUp);
    return () => el.removeEventListener("mouseup", handleMouseUp);
  }, [containerRef]);

  /** Save the current selection as a highlight. */
  const saveHighlight = useCallback(async (): Promise<Highlight | null> => {
    if (!selectionPopover) return null;

    const { text, pageNumber, textOffset, textLength } = selectionPopover;
    const color = getHighlightColor(theme);
    const cfiRange = makePdfCfiRange(pageNumber, textOffset, textLength);

    const highlight: Highlight = {
      id: crypto.randomUUID(),
      bookId,
      cfiRange,
      text,
      color,
      createdAt: Date.now(),
      pageNumber,
      textOffset,
      textLength,
    };

    const saveProgram = Effect.gen(function* () {
      const svc = yield* AnnotationService;
      yield* svc.saveHighlight(highlight);
    });
    await AppRuntime.runPromise(saveProgram).catch(console.error);

    highlightsRef.current.set(cfiRange, highlight);
    applyHighlightOverlay(highlight);

    setSelectionPopover(null);
    window.getSelection()?.removeAllRanges();

    return highlight;
  }, [selectionPopover, bookId, theme, applyHighlightOverlay]);

  /** Remove a highlight by cfiRange. */
  const removeHighlight = useCallback((cfiRange: string) => {
    const hl = highlightsRef.current.get(cfiRange);
    if (!hl) return;

    // Remove overlay
    const overlay = overlaysRef.current.get(hl.id);
    if (overlay) {
      overlay.remove();
      overlaysRef.current.delete(hl.id);
    }

    // Remove from store
    const deleteProgram = Effect.gen(function* () {
      const svc = yield* AnnotationService;
      yield* svc.deleteHighlight(hl.id);
    });
    AppRuntime.runPromise(deleteProgram).catch(console.error);

    highlightsRef.current.delete(cfiRange);
  }, []);

  /** Apply a temporary flash highlight on the PDF for a given cfiRange. */
  const applyTempHighlight = useCallback(
    (cfiRange: string) => {
      // Parse the synthetic cfiRange to get page info
      const match = cfiRange.match(/^pdf:page:(\d+):offset:(\d+):len:(\d+)$/);
      if (!match) return;

      const pageNumber = parseInt(match[1], 10);
      const textOffset = parseInt(match[2], 10);
      const textLength = parseInt(match[3], 10);

      const tempHl: Highlight = {
        id: `temp-${Date.now()}`,
        bookId,
        cfiRange,
        text: "",
        color: "rgba(100, 200, 255, 0.5)",
        createdAt: Date.now(),
        pageNumber,
        textOffset,
        textLength,
      };

      applyHighlightOverlay(tempHl);

      // Flash and remove after a delay
      setTimeout(() => {
        const overlay = overlaysRef.current.get(tempHl.id);
        if (overlay) {
          overlay.remove();
          overlaysRef.current.delete(tempHl.id);
        }
      }, 2000);
    },
    [bookId, applyHighlightOverlay],
  );

  const dismissPopovers = useCallback(() => {
    setSelectionPopover(null);
  }, []);

  return {
    selectionPopover,
    saveHighlight,
    dismissPopovers,
    loadAndApplyHighlights,
    reapplyAllHighlights,
    highlightsRef,
    removeHighlight,
    applyTempHighlight,
  };
}
