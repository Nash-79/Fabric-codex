import { useCallback, useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { mergeLocalProgress, upsertMyProgress, type ProgressRow } from "@/lib/atlas.functions";
import { useAuthSession } from "@/lib/use-auth-session";

// The sync layer behind D3 (docs/plan/phase-1-curriculum.md WP1.2). Public reading is unchanged —
// anonymous progress stays entirely in the existing fa:lesson-done / fa:read:{kind}:{slug} /
// fa:steps:{kind}:{slug} localStorage keys (use-lesson-progress.ts, use-reading-progress.ts,
// use-step-progress.ts are untouched). This module adds three things on top, active only once
// signed in:
//   1. A one-time merge of local progress into user_progress on first authenticated load per
//      device (fa:merged-at stamp), union+max so a completion recorded on either side wins.
//   2. recordProgress(): the write path components call going forward — always writes local
//      (so anonymous behavior is identical, and a signed-in device still has an instant local
//      copy), and additionally queues a server write.
//   3. An offline-tolerant queue: queued writes persist in localStorage (fa:progress-queue) and
//      flush on the browser's `online` event, so a completion recorded mid-flight-without-network
//      isn't lost, it's just delayed. No service-worker Background Sync — the existing PWA config
//      uses generateSW with no injection point for one, and a delayed-until-tab-reopens flush is
//      an acceptable tradeoff for a reading-progress checkbox, not a financial transaction.

const MERGED_STAMP_KEY = "fa:merged-at";
const QUEUE_KEY = "fa:progress-queue";
const LESSON_DONE_KEY = "fa:lesson-done";

type QueuedWrite = {
  contentKind: "article" | "design" | "lesson";
  contentSlug: string;
  status: "in_progress" | "completed";
  percent: number;
  completedAt: string | null;
  queuedAt: number;
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable (private browsing) — the write is lost, but nothing throws;
    // matches the existing hooks' silent-ignore convention.
  }
}

/** Scans every fa:read:{kind}:{slug} key plus fa:lesson-done into one ProgressRow[]. */
function collectLocalProgress(): ProgressRow[] {
  const rows = new Map<string, ProgressRow>();
  const nowIso = new Date().toISOString();

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith("fa:read:")) continue;
    const [, , kind, ...slugParts] = key.split(":");
    const slug = slugParts.join(":");
    if (!kind || !slug) continue;
    const saved = readJson<{ pct: number; updatedAt: number } | null>(key, null);
    if (!saved) continue;
    const percent = Math.round(saved.pct);
    const status = percent >= 95 ? "completed" : "in_progress";
    rows.set(`${kind}:${slug}`, {
      content_kind: kind as ProgressRow["content_kind"],
      content_slug: slug,
      status,
      percent,
      completed_at: status === "completed" ? new Date(saved.updatedAt).toISOString() : null,
      updated_at: new Date(saved.updatedAt).toISOString(),
    });
  }

  // fa:lesson-done is a flat set of lesson slugs, always fully complete — merge over any partial
  // fa:read:lesson:{slug} entry for the same slug (a lesson marked done outranks a scroll-percent
  // guess for the same content).
  const doneLessons = readJson<string[]>(LESSON_DONE_KEY, []);
  for (const slug of doneLessons) {
    rows.set(`lesson:${slug}`, {
      content_kind: "lesson",
      content_slug: slug,
      status: "completed",
      percent: 100,
      completed_at: rows.get(`lesson:${slug}`)?.completed_at ?? nowIso,
      updated_at: nowIso,
    });
  }

  return [...rows.values()];
}

function getQueue(): QueuedWrite[] {
  return readJson<QueuedWrite[]>(QUEUE_KEY, []);
}

function setQueue(queue: QueuedWrite[]) {
  writeJson(QUEUE_KEY, queue);
}

function enqueue(write: QueuedWrite) {
  const queue = getQueue().filter(
    (w) => !(w.contentKind === write.contentKind && w.contentSlug === write.contentSlug),
  );
  queue.push(write);
  setQueue(queue);
}

/**
 * Runs the merge-on-sign-in and offline-queue flush. Mount once near the app root (or once per
 * signed-in session) — see __root.tsx. Returns recordProgress() for components to call; it works
 * identically whether or not the queue/merge machinery below has finished, since local writes are
 * synchronous and queueing is fire-and-forget.
 */
export function useProgressSync() {
  const { userId, isSignedIn, isResolved } = useAuthSession();
  const mergeFn = useServerFn(mergeLocalProgress);
  const upsertFn = useServerFn(upsertMyProgress);
  const flushing = useRef(false);

  const flushQueue = useCallback(async () => {
    if (flushing.current || !navigator.onLine) return;
    const queue = getQueue();
    if (!queue.length) return;
    flushing.current = true;
    try {
      const remaining: QueuedWrite[] = [];
      for (const write of queue) {
        try {
          await upsertFn({
            data: {
              contentKind: write.contentKind,
              contentSlug: write.contentSlug,
              status: write.status,
              percent: write.percent,
              completedAt: write.completedAt,
            },
          });
        } catch {
          // Still offline, or a transient failure — keep it queued and retry on the next flush
          // trigger (reconnect, or the next recordProgress call).
          remaining.push(write);
        }
      }
      setQueue(remaining);
    } finally {
      flushing.current = false;
    }
  }, [upsertFn]);

  // Merge once per device, the first time we see a signed-in session.
  useEffect(() => {
    if (!isResolved || !isSignedIn || !userId) return;
    const stampKey = `${MERGED_STAMP_KEY}:${userId}`;
    if (localStorage.getItem(stampKey)) return;
    const localRows = collectLocalProgress();
    if (!localRows.length) {
      writeJson(stampKey, Date.now());
      return;
    }
    mergeFn({ data: { rows: localRows } })
      .then(() => writeJson(stampKey, Date.now()))
      .catch(() => {
        // Leave the stamp unset — retried on the next mount (e.g. next page load) rather than
        // silently losing the local progress this device has.
      });
  }, [isResolved, isSignedIn, userId, mergeFn]);

  // Flush the offline queue on reconnect and on mount (covers "was offline, tab stayed open,
  // network came back before an 'online' event fired in this tab" edge cases).
  useEffect(() => {
    if (!isSignedIn) return;
    flushQueue();
    window.addEventListener("online", flushQueue);
    return () => window.removeEventListener("online", flushQueue);
  }, [isSignedIn, flushQueue]);

  const recordProgress = useCallback(
    (
      kind: "article" | "design" | "lesson",
      slug: string,
      update: { status: "in_progress" | "completed"; percent: number },
    ) => {
      // Local write always happens first and synchronously — anonymous behavior is unaffected,
      // and a signed-in device gets an instant local copy even before the server round-trip.
      const nowIso = new Date().toISOString();
      writeJson(`fa:read:${kind}:${slug}`, {
        pct: update.percent,
        scrollY: 0,
        updatedAt: Date.now(),
      });
      if (kind === "lesson" && update.status === "completed") {
        const done = new Set(readJson<string[]>(LESSON_DONE_KEY, []));
        done.add(slug);
        writeJson(LESSON_DONE_KEY, [...done]);
      }

      if (!isSignedIn) return;

      const write: QueuedWrite = {
        contentKind: kind,
        contentSlug: slug,
        status: update.status,
        percent: update.percent,
        completedAt: update.status === "completed" ? nowIso : null,
        queuedAt: Date.now(),
      };
      enqueue(write);
      if (navigator.onLine) void flushQueue();
    },
    [isSignedIn, flushQueue],
  );

  return { recordProgress };
}
