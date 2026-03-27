import { Plus } from "lucide-react";

export function AddBookCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex aspect-[2/3] w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/50 text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:bg-muted"
    >
      <Plus className="mb-2 size-8" />
      <span className="text-sm font-medium">Add book</span>
    </button>
  );
}
