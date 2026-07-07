import { useEffect, useState } from "react";

type Saved = { pct: number; scrollY: number; updatedAt: number };

const key = (kind: string, slug: string) => `fa:read:${kind}:${slug}`;

export function useReadingProgress(kind: string, slug: string) {
  const [saved, setSaved] = useState<Saved | null>(null);

  // Load saved position on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key(kind, slug));
      if (raw) setSaved(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, [kind, slug]);

  // Throttled scroll writer
  useEffect(() => {
    let timer: number | undefined;
    const save = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max <= 0) return;
      const pct = Math.min(100, Math.max(0, (window.scrollY / max) * 100));
      const payload: Saved = { pct, scrollY: window.scrollY, updatedAt: Date.now() };
      try {
        localStorage.setItem(key(kind, slug), JSON.stringify(payload));
      } catch {
        // ignore
      }
    };
    const onScroll = () => {
      if (timer) return;
      timer = window.setTimeout(() => {
        timer = undefined;
        save();
      }, 400);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (timer) window.clearTimeout(timer);
    };
  }, [kind, slug]);

  return saved;
}
