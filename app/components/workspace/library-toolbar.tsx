import { Search } from "lucide-react";
import { Input } from "~/components/ui/input";
import { LibraryViewToggle } from "~/components/workspace/library-view-toggle";

interface LibraryToolbarProps {
  query: string;
  onQueryChange: (value: string) => void;
}

export function LibraryToolbar({ query, onQueryChange }: LibraryToolbarProps) {
  return (
    <div className="flex items-center gap-3 border-b px-4 py-2 md:px-6">
      <div className="relative flex-1 max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search books…"
          className="h-8 pl-7 text-sm"
          aria-label="Search books"
        />
      </div>
      <LibraryViewToggle />
    </div>
  );
}
