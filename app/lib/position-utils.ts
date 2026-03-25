/**
 * Pure helper functions for dual-key reading position save/restore logic.
 *
 * Extracted from workspace-book-reader.tsx so the priority resolution
 * and dual-key save can be unit-tested without IndexedDB or React.
 */

export interface ResolveStartCfiOpts {
  /** In-memory CFI from the current session (highest priority). */
  latestCfi: string | null;
  /** Panel-specific key (unique per dockview panel). */
  panelId: string | undefined;
  /** Book-level key (shared across panels showing the same book). */
  bookId: string;
  /** Callback to look up a persisted position by key. */
  getPosition: (key: string) => Promise<string | null>;
}

/**
 * Resolve the CFI to display when opening / re-mounting a book.
 *
 * Priority:
 *  1. `latestCfi` — kept in a ref across layout changes within the same session.
 *  2. Panel-specific position — survives browser refresh when the workspace
 *     layout is restored with the same panel IDs.
 *  3. Book-level position — the "last read" fallback shared by all panels.
 *  4. `null` — no saved position; the renderer will open at the beginning.
 */
export async function resolveStartCfi(opts: ResolveStartCfiOpts): Promise<string | null> {
  const { latestCfi, panelId, bookId, getPosition } = opts;

  if (latestCfi) return latestCfi;

  if (panelId !== undefined) {
    const panelCfi = await getPosition(panelId);
    if (panelCfi) return panelCfi;
  }

  const bookCfi = await getPosition(bookId);
  if (bookCfi) return bookCfi;

  return null;
}

export interface SavePositionDualKeyOpts {
  /** Panel-specific key (may be undefined when there is no dockview panel). */
  panelId: string | undefined;
  /** Book-level key. */
  bookId: string;
  /** The CFI string to persist. */
  cfi: string;
  /** Callback to persist a position by key. */
  savePosition: (key: string, cfi: string) => Promise<void>;
}

/**
 * Save a reading position under both the panel key and the book key.
 *
 * When `panelId` is undefined only the book-level key is written.
 */
export async function savePositionDualKey(opts: SavePositionDualKeyOpts): Promise<void> {
  const { panelId, bookId, cfi, savePosition } = opts;

  const saves: Promise<void>[] = [savePosition(bookId, cfi)];
  if (panelId !== undefined) {
    saves.push(savePosition(panelId, cfi));
  }
  await Promise.all(saves);
}

