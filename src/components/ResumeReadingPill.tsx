import { useEffect, useState } from "react";
import { BookmarkCheck, X } from "lucide-react";

export function ResumeReadingPill({ pct, scrollY }: { pct: number; scrollY: number }) {
  const [visible, setVisible] = useState(true);

  // Auto-hide after 8s or when the user scrolls significantly
  useEffect(() => {
    const t = window.setTimeout(() => setVisible(false), 8000);
    const initial = window.scrollY;
    const onScroll = () => {
      if (Math.abs(window.scrollY - initial) > 200) setVisible(false);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="no-print fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full border border-teal-500/30 bg-card/95 px-3 py-2 shadow-lg shadow-black/20 backdrop-blur animate-fade-in">
      <button
        type="button"
        onClick={() => {
          window.scrollTo({ top: scrollY, behavior: "smooth" });
          setVisible(false);
        }}
        className="flex items-center gap-2 text-xs font-medium text-foreground"
      >
        <BookmarkCheck className="h-4 w-4 text-teal-500" />
        Resume reading ({Math.round(pct)}%)
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setVisible(false)}
        className="text-muted-foreground hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
