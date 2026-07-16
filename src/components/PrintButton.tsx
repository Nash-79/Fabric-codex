import { useState } from "react";
import { Download, FileCode2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { exportArticlePdf, type PdfMeta } from "@/lib/export-pdf";
import { exportArticleHtml } from "@/lib/export-html";

/**
 * Article export toolbar: block-aware PDF (jsPDF + html2canvas-pro) plus a
 * self-contained HTML snapshot. Both operate on the current <article> element.
 */
export function PrintButton({
  label = "Download PDF",
  getMeta,
}: {
  label?: string;
  getMeta?: () => PdfMeta;
}) {
  const [pdfBusy, setPdfBusy] = useState(false);
  const [htmlBusy, setHtmlBusy] = useState(false);

  const getArticle = () => document.querySelector("article") as HTMLElement | null;

  const onPdf = async () => {
    if (pdfBusy) return;
    setPdfBusy(true);
    const article = getArticle();
    if (!article || !getMeta) {
      window.print();
      setPdfBusy(false);
      return;
    }
    const dismiss = toast.loading("Building PDF…");
    try {
      await exportArticlePdf(article, getMeta());
      toast.success("PDF downloaded", { id: dismiss });
    } catch (err) {
      console.error(err);
      toast.error("PDF export failed — using browser print instead", { id: dismiss });
      window.print();
    } finally {
      setPdfBusy(false);
    }
  };

  const onHtml = async () => {
    if (htmlBusy) return;
    setHtmlBusy(true);
    const article = getArticle();
    if (!article || !getMeta) {
      setHtmlBusy(false);
      return;
    }
    const dismiss = toast.loading("Building HTML…");
    try {
      await exportArticleHtml(article, getMeta());
      toast.success("HTML downloaded", { id: dismiss });
    } catch (err) {
      console.error(err);
      toast.error("HTML export failed", { id: dismiss });
    } finally {
      setHtmlBusy(false);
    }
  };

  const btn =
    "no-print inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-border hover:text-foreground disabled:opacity-60";

  return (
    <div className="no-print inline-flex items-center gap-2">
      <button type="button" onClick={onPdf} disabled={pdfBusy} className={btn} aria-label={label}>
        {pdfBusy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
        {pdfBusy ? "Building…" : label}
      </button>
      <button
        type="button"
        onClick={onHtml}
        disabled={htmlBusy}
        className={btn}
        aria-label="Download HTML"
      >
        {htmlBusy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <FileCode2 className="h-3.5 w-3.5" />
        )}
        {htmlBusy ? "Building…" : "Download HTML"}
      </button>
    </div>
  );
}
