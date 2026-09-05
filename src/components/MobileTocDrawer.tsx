import { useState } from "react";
import { List } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ContentTocSidebar, type TocEntry } from "@/components/ContentTocSidebar";

export function MobileTocDrawer({ headings }: { headings: TocEntry[] }) {
  const [open, setOpen] = useState(false);
  if (!headings.length) return null;
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Open table of contents"
          className="no-print fixed bottom-4 right-4 z-40 inline-flex h-12 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground shadow-lg shadow-black/30 transition hover:border-teal-500/50 lg:hidden"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0)" }}
        >
          <List className="h-4 w-4" aria-hidden />
          Contents
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[85vw] max-w-sm overflow-y-auto p-4">
        <SheetHeader>
          <SheetTitle>Table of contents</SheetTitle>
        </SheetHeader>
        <div className="mt-4" onClick={() => setOpen(false)}>
          <ContentTocSidebar headings={headings} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
