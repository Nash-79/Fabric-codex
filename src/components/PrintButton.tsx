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
      className="no-print inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-white/70 transition hover:border-white/30 hover:text-white"
      aria-label={label}
    >
      <Printer className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
