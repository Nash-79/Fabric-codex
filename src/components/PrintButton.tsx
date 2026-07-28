import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { exportArticlePdf, type PdfMeta } from "@/lib/export-pdf";

/**
 * Downloads the article as a real PDF (jsPDF + html2canvas-pro) so diagrams,
 * layout, and typography survive the export. Falls back to window.print() if
 * the client-side render fails.
 */
export function PrintButton({
  label = "Download PDF",
  getMeta,
}: {
  label?: string;
  getMeta?: () => PdfMeta;
}) {
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    const article = document.querySelector("article");
    if (!article || !getMeta) {
      window.print();
      setBusy(false);
      return;
    }
    const dismiss = toast.loading("Building PDF…");
    try {
      await exportArticlePdf(article as HTMLElement, getMeta());
      toast.success("PDF downloaded", { id: dismiss });
    } catch (err) {
      console.error(err);
      toast.error("PDF export failed — using browser print instead", { id: dismiss });
      window.print();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="no-print inline-flex h-10 items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-border hover:text-foreground disabled:opacity-60"
      aria-label={label}
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Download className="h-3.5 w-3.5" />
      )}
      {busy ? "Building…" : label}
    </button>
  );
}
