import { MoreHorizontal, Check } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import type { ReaderLayout } from "~/lib/settings";

interface ReaderSettingsMenuProps {
  layout: ReaderLayout;
  onLayoutChange: (layout: ReaderLayout) => void;
}

const layoutOptions: { value: ReaderLayout; label: string }[] = [
  { value: "single", label: "Single Page" },
  { value: "spread", label: "Two Page Spread" },
  { value: "scroll", label: "Continuous Scroll" },
];

export function ReaderSettingsMenu({
  layout,
  onLayoutChange,
}: ReaderSettingsMenuProps) {
  return (
    <Popover>
      <PopoverTrigger className="inline-flex h-9 w-9 items-center justify-center rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground">
        <MoreHorizontal className="size-4" />
        <span className="sr-only">Reader settings</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-48 p-1">
        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
          Layout
        </div>
        {layoutOptions.map((option) => (
          <button
            key={option.value}
            onClick={() => onLayoutChange(option.value)}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
          >
            <span className="w-4">
              {layout === option.value && <Check className="size-4" />}
            </span>
            {option.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

