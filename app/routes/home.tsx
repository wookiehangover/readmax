import { BookOpen } from "lucide-react";

export default function Home() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <BookOpen className="mb-4 size-12 text-muted-foreground/50" />
      <p className="text-lg font-medium text-muted-foreground">
        Select a book to start reading
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Choose a book from the sidebar, or drop an .epub file anywhere
      </p>
    </div>
  );
}

