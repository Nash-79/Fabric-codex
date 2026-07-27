import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CitationSidebar, type Citation } from "@/components/CitationSidebar";

// Sources-as-drawer (Editorial Experience Revamp Phase 3), mirroring MobileTocDrawer's Sheet
// pattern but externally controlled — no internal SheetTrigger. The existing "Sources (N)"
// action-bar button and the citation-click interceptor both need to open this imperatively, so
// `open`/`onOpenChange` stay lifted in ReaderShell rather than self-contained state here.
export function CitationDrawer({
  citations,
  open,
  onOpenChange,
}: {
  citations: Citation[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[90vw] max-w-md overflow-y-auto p-4">
        <SheetHeader>
          <SheetTitle>Sources</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          <CitationSidebar citations={citations} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
