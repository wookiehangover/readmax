import type { IWatermarkPanelProps } from "dockview";
import { BookOpen, Columns2, Upload } from "lucide-react";
import { useWorkspace } from "~/lib/workspace-context";

export function WatermarkPanel(_props: IWatermarkPanelProps) {
  const { fileInputRef } = useWorkspace();

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="flex max-w-md flex-col items-center text-center">
        <div className="mb-6 flex items-center gap-2 text-muted-foreground/30">
          <div className="flex h-12 w-9 items-center justify-center rounded border border-dashed border-muted-foreground/20">
            <BookOpen className="size-4" />
          </div>
          <Columns2 className="size-3.5" />
          <div className="flex h-12 w-9 items-center justify-center rounded border border-dashed border-muted-foreground/20">
            <BookOpen className="size-4" />
          </div>
        </div>

        <h2 className="text-lg font-medium text-foreground">Drop an epub here to start reading</h2>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="mt-5 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          <Upload className="size-4" />
          Upload an epub
        </button>

        <p className="mt-3 text-xs text-muted-foreground">
          or drag and drop a <span className="font-medium">.epub</span> file anywhere
        </p>
      </div>
    </div>
  );
}
