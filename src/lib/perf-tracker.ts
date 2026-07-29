// Lightweight in-browser RUM: captures Web Vitals (LCP/CLS/INP), route-load
// timings (fired by the router's `onBeforeNavigate`/`onResolved` lifecycle),
// and slow query timings (surfaced from any code that calls `recordSlowOp`).
//
// All samples live in-memory + sessionStorage so nothing leaves the browser.
// The `/dev/perf` route renders them. No external analytics.

export type PerfKind = "route" | "vital" | "query";

export type PerfSample = {
  id: number;
  kind: PerfKind;
  name: string;
  ms: number;
  ts: number;
  detail?: Record<string, unknown>;
};

const KEY = "fa.perf.samples.v1";
const MAX = 250;

let seq = 1;
const listeners = new Set<() => void>();
let cache: PerfSample[] | null = null;

function load(): PerfSample[] {
  if (cache) return cache;
  if (typeof window === "undefined") return (cache = []);
  try {
    const raw = window.sessionStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as PerfSample[]) : [];
  } catch {
    cache = [];
  }
  return cache!;
}

function persist() {
  if (typeof window === "undefined" || !cache) return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(cache.slice(-MAX)));
  } catch {
    // storage full / privacy mode — ignore.
  }
  listeners.forEach((fn) => fn());
}

export function recordPerf(sample: Omit<PerfSample, "id" | "ts">) {
  const list = load();
  list.push({ ...sample, id: seq++, ts: Date.now() });
  if (list.length > MAX) list.splice(0, list.length - MAX);
  persist();
}

export function recordSlowOp(name: string, ms: number, detail?: Record<string, unknown>) {
  // Only record ops that are actually noteworthy — under 50 ms is noise.
  if (ms < 50) return;
  recordPerf({ kind: "query", name, ms, detail });
}

export function getPerfSamples(): PerfSample[] {
  return [...load()].reverse();
}

export function clearPerfSamples() {
  cache = [];
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(KEY);
    } catch {
      // ignore
    }
  }
  listeners.forEach((fn) => fn());
}

export function subscribePerf(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// ---- Bootstrap: attach PerformanceObservers once per page load. -----------

let installed = false;

export function installPerfTracker() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  // LCP — largest content paint.
  safeObserve("largest-contentful-paint", (entries) => {
    const last = entries[entries.length - 1] as any;
    if (last) {
      recordPerf({
        kind: "vital",
        name: "LCP",
        ms: Math.round(last.renderTime || last.loadTime || last.startTime),
        detail: { element: last.element?.tagName },
      });
    }
  });

  // CLS — cumulative layout shift (sum session).
  let cls = 0;
  safeObserve("layout-shift", (entries) => {
    for (const e of entries as any[]) {
      if (!e.hadRecentInput) cls += e.value;
    }
  });
  window.addEventListener(
    "visibilitychange",
    () => {
      if (document.visibilityState === "hidden" && cls > 0) {
        recordPerf({ kind: "vital", name: "CLS", ms: Math.round(cls * 1000) / 1000 });
        cls = 0;
      }
    },
    { once: false },
  );

  // INP — interaction latency (event timing).
  safeObserve("event", (entries) => {
    for (const e of entries as any[]) {
      if (e.duration >= 40) {
        recordPerf({
          kind: "vital",
          name: "INP",
          ms: Math.round(e.duration),
          detail: { type: e.name },
        });
      }
    }
  });
}

function safeObserve(type: string, cb: (entries: PerformanceEntryList) => void) {
  try {
    const po = new PerformanceObserver((list) => cb(list.getEntries()));
    // `buffered: true` grabs entries the browser recorded before we attached.
    po.observe({ type, buffered: true } as PerformanceObserverInit);
  } catch {
    // Type not supported (Safari for `event`, older browsers) — silent skip.
  }
}
