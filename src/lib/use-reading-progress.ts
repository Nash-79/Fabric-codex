import { useEffect, useRef, useState } from "react";
import { useProgressSync } from "@/lib/use-progress-sync";

type Saved = { pct: number; scrollY: number; updatedAt: number };

const key = (kind: string, slug: string) => `fa:read:${kind}:${slug}`;

// Server-sync threshold: syncing on every 400ms scroll tick would flood upsertMyProgress with
// near-duplicate writes. Only push when the rounded percent actually changes, and only past 10%
// (matches ReaderShell's own showResume floor — below that isn't meaningful progress yet).
const SYNC_MIN_PCT = 10;

export function useReadingProgress(kind: string, slug: string) {
  const [saved, setSaved] = useState<Saved | null>(null);
  const { recordProgress } = useProgressSync();
  const lastSyncedPct = useRef(-1);

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
      const rounded = Math.round(pct);
      if (rounded >= SYNC_MIN_PCT && rounded !== lastSyncedPct.current) {
        lastSyncedPct.current = rounded;
        recordProgress(kind as "article" | "design" | "lesson", slug, {
          status: rounded >= 95 ? "completed" : "in_progress",
          percent: rounded,
        });
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
  }, [kind, slug, recordProgress, lastSyncedPct]);

  return saved;
}
