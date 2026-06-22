import { Printer } from "lucide-react";

/**
 * Export-to-PDF / print trigger. Calls window.print(); the print stylesheet
 * (@media print in styles.css) hides app chrome and prints the article on a
 * clean white page. Tagged `no-print` so it never appears in the output.
 */
export function PrintButton({ label = "Export PDF" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-border hover:text-foreground"
      aria-label={label}
    >
      <Printer className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
