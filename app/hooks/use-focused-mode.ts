import { useCallback, useEffect, useRef } from "react";
import type { DockviewApi, AddPanelPositionOptions } from "dockview";
import { useWorkspace } from "~/lib/context/workspace-context";
import { truncateTitle } from "~/lib/workspace-utils";
import type { LayoutMode } from "~/lib/settings";

/**
 * Session-scoped state for a single focused-mode cluster. Persisted only in
 * memory — if the user reloads, focused clusters re-populate as they open
 * books (cluster panel content is re-mounted from IDB/Postgres on demand).
 */
export interface FocusedCluster {
  bookId: string;
  bookTitle: string;
  bookFormat?: string;
  hasChat: boolean;
  hasNotebook: boolean;
  activeTab: "book" | "chat" | "notebook";
}

export interface ClusterBarEntry {
  readonly bookId: string;
  readonly bookTitle: string;
}

export interface UseFocusedModeParams {
  /** Current dockview API ref owned by workspace.tsx. */
  apiRef: React.MutableRefObject<DockviewApi | null>;
  /** Active layout mode; the swap and Cmd+1..9 effects are inert in freeform. */
  layoutMode: LayoutMode;
  /** Mobile viewport ref, read during cluster swap for tab/split decisions. */
  isMobileRef: React.MutableRefObject<boolean | undefined>;
}

export interface UseFocusedModeResult {
  readonly focusedClustersRef: React.MutableRefObject<Map<string, FocusedCluster>>;
  readonly focusedOrderRef: React.MutableRefObject<string[]>;
  readonly swapInProgressRef: React.MutableRefObject<boolean>;
  readonly closeFocusedCluster: (bookId: string) => void;
  readonly getClusterEntries: () => ClusterBarEntry[];
  readonly getActiveClusterId: () => string | null;
}

function isEditableElement(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

/**
 * Encapsulates focused-mode session state, the swap effect that (un)mounts
 * cluster panels when the active cluster changes, the Cmd+1..9 shortcut,
 * the close-cluster handler, and ClusterBar getters. The returned refs are
 * shared with workspace.tsx's openBook/openNotebook/openChat and with the
 * dockview listeners registered in `onReady`.
 */
export function useFocusedMode({
  apiRef,
  layoutMode,
  isMobileRef,
}: UseFocusedModeParams): UseFocusedModeResult {
  const ws = useWorkspace();
  const focusedClustersRef = useRef(new Map<string, FocusedCluster>());
  const focusedOrderRef = useRef<string[]>([]);
  // Last cluster bookId the swap effect acted on. Prevents re-running swap
  // logic for the same activation (which would re-mount panels unnecessarily).
  const lastSwappedRef = useRef<string | null>(null);
  // Guard to suppress the onDidActivePanelChange → setActiveCluster feedback
  // loop while the swap effect is mid-swap (removing/adding panels).
  const swapInProgressRef = useRef(false);

  // Mount the panels for `targetBookId`'s focused cluster, removing any
  // currently-mounted cluster panels first. Called whenever the active
  // focused cluster changes. Content state (reading position, notebook,
  // chat) is rehydrated from IDB/Postgres when the panel remounts.
  const swapFocusedCluster = useCallback(
    (targetBookId: string | null) => {
      const api = apiRef.current;
      if (!api) return;

      swapInProgressRef.current = true;
      try {
        // Remove every panel that belongs to any tracked focused cluster so
        // we start from a clean slate.
        const trackedBookIds = focusedClustersRef.current;
        const toRemove = api.panels.filter((p) => {
          const bId = (p.params as Record<string, unknown>)?.bookId;
          return typeof bId === "string" && trackedBookIds.has(bId);
        });
        for (const p of toRemove) api.removePanel(p);

        if (!targetBookId) return;
        const cluster = focusedClustersRef.current.get(targetBookId);
        if (!cluster) return;

        const { bookId, bookTitle, bookFormat, hasChat, hasNotebook, activeTab } = cluster;

        // Add the book panel (left group / first group on mobile).
        const bookPanelId = `book-${bookId}`;
        api.addPanel({
          id: bookPanelId,
          component: "book-reader",
          title: truncateTitle(bookTitle),
          params: { bookId, bookTitle, bookFormat },
          renderer: "always",
        });

        const rightSplit = !isMobileRef.current;

        // Add chat panel (right split on desktop, tab on mobile).
        if (hasChat) {
          const chatPanelId = `chat-${bookId}`;
          api.addPanel({
            id: chatPanelId,
            component: "chat",
            title: truncateTitle(`Discuss: ${bookTitle}`),
            params: { bookId, bookTitle },
            renderer: "always",
            ...(rightSplit
              ? { position: { referencePanel: bookPanelId, direction: "right" as const } }
              : {}),
          });
        }

        // Add notebook panel — as a tab in the right group if chat exists,
        // otherwise split right (desktop) or tab (mobile).
        if (hasNotebook) {
          const notebookPanelId = `notebook-${bookId}`;
          const chatPanel = hasChat ? api.panels.find((p) => p.id === `chat-${bookId}`) : undefined;
          const position: AddPanelPositionOptions | undefined = rightSplit
            ? chatPanel
              ? { referenceGroup: chatPanel.group }
              : { referencePanel: bookPanelId, direction: "right" as const }
            : undefined;
          api.addPanel({
            id: notebookPanelId,
            component: "notebook",
            title: truncateTitle(`Notes: ${bookTitle}`),
            params: { bookId, bookTitle },
            renderer: "always",
            ...(position ? { position } : {}),
          });
        }

        // Focus the remembered active tab so pill-switching feels continuous.
        let focusId = bookPanelId;
        if (activeTab === "chat" && hasChat) focusId = `chat-${bookId}`;
        else if (activeTab === "notebook" && hasNotebook) focusId = `notebook-${bookId}`;
        const focusPanel = api.panels.find((p) => p.id === focusId);
        if (focusPanel) focusPanel.focus();
      } finally {
        swapInProgressRef.current = false;
      }
    },
    [apiRef, isMobileRef],
  );

  // Subscribe to cluster-change notifications and run the swap whenever the
  // active focused cluster changes. Uses `lastSwappedRef` to ignore
  // re-notifications for the same active id (which also occurs while the
  // swap itself is adding panels).
  useEffect(() => {
    if (layoutMode !== "focused") return;
    const run = () => {
      const target = ws.activeClusterBookIdRef.current;
      if (target === lastSwappedRef.current) return;
      lastSwappedRef.current = target;
      swapFocusedCluster(target);
    };
    // Initial sync in case a cluster was already active when the subscription
    // was (re-)established (e.g. after a mode toggle).
    run();
    return ws.subscribeClusterChanges(run);
  }, [layoutMode, swapFocusedCluster, ws]);

  // Cmd+1..9 to activate the Nth open focused cluster. Skips editable
  // elements so typing "1" in an input doesn't swap clusters.
  useEffect(() => {
    if (layoutMode !== "focused") return;
    function handler(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.shiftKey || e.altKey) return;
      const digit = Number.parseInt(e.key, 10);
      if (!Number.isInteger(digit) || digit < 1 || digit > 9) return;
      if (isEditableElement()) return;
      const order = focusedOrderRef.current;
      const target = order[digit - 1];
      if (!target) return;
      e.preventDefault();
      ws.setActiveCluster(target);
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [layoutMode, ws]);

  // Close a focused-mode cluster: remove from the session map and either
  // activate the next cluster in order or clear panels entirely.
  const closeFocusedCluster = useCallback(
    (bookId: string) => {
      focusedClustersRef.current.delete(bookId);
      focusedOrderRef.current = focusedOrderRef.current.filter((id) => id !== bookId);
      if (ws.activeClusterBookIdRef.current === bookId) {
        const nextId = focusedOrderRef.current[focusedOrderRef.current.length - 1] ?? null;
        // setActiveCluster with a different id triggers the swap effect.
        // If no cluster remains, explicitly clear panels.
        if (nextId === null) {
          ws.activeClusterBookIdRef.current = null;
          swapFocusedCluster(null);
          lastSwappedRef.current = null;
          ws.notifyClusterChanges();
        } else {
          ws.setActiveCluster(nextId);
        }
      } else {
        ws.notifyClusterChanges();
      }
    },
    [swapFocusedCluster, ws],
  );

  // ClusterBar getters — return snapshots from the refs. ClusterBar
  // subscribes to cluster changes separately to trigger re-renders.
  const getClusterEntries = useCallback((): ClusterBarEntry[] => {
    return focusedOrderRef.current.map((bookId) => {
      const fc = focusedClustersRef.current.get(bookId);
      return { bookId, bookTitle: fc?.bookTitle ?? bookId };
    });
  }, []);
  const getActiveClusterId = useCallback(() => ws.activeClusterBookIdRef.current, [ws]);

  return {
    focusedClustersRef,
    focusedOrderRef,
    swapInProgressRef,
    closeFocusedCluster,
    getClusterEntries,
    getActiveClusterId,
  };
}
