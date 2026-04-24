import { Unlock } from "lucide-react";
import { cn } from "~/lib/utils";

interface FreeformBadgeProps {
  /** Restore focused mode. */
  readonly onRestore: () => void;
}

/**
 * Ambient indicator rendered above dockview while freeform mode is active.
 * Clicking it immediately restores focused mode — the safe default does
 * not need a confirm.
 */
export function FreeformBadge({ onRestore }: FreeformBadgeProps) {
  return (
    <div className="flex items-center justify-start border-b border-border/60 bg-amber-500/5 px-2 py-1">
      <button
        type="button"
        data-testid="freeform-badge"
        onClick={onRestore}
        title="Click to restore focused layout"
        className={cn(
          "group flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10",
          "px-2 py-0.5 text-[11px] font-medium text-amber-700 transition-colors",
          "hover:bg-amber-500/20 hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40",
        )}
      >
        <Unlock className="size-3" />
        <span>Freeform</span>
        <span className="text-[10px] font-normal text-amber-700/70 group-hover:text-amber-800/80 dark:text-amber-300/70 dark:group-hover:text-amber-200/80">
          — click to restore focused
        </span>
      </button>
    </div>
  );
}
