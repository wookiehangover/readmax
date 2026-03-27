import { BookOpen } from "lucide-react";

export function CoverPlaceholder({ title, author }: { title: string; author: string }) {
  return (
    <div className="flex aspect-[2/3] w-full flex-col items-center justify-center rounded-lg bg-muted p-3 text-center">
      <BookOpen className="mb-2 size-8 text-muted-foreground/50" />
      <p className="line-clamp-3 text-sm font-medium text-muted-foreground">{title}</p>
      {author && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground/70">{author}</p>}
    </div>
  );
}
