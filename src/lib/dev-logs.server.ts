// Dev-only helper: read and parse the mirrored Vite dev-server log file.
// Safe no-op in production (file does not exist on the Worker runtime).

export type LogLevel = "error" | "warn" | "info" | "debug";

export type LogEntry = {
  id: number;
  ts: string; // ISO
  day: string; // YYYY-MM-DD
  time: string; // HH:MM:SS
  level: LogLevel;
  source: string; // vite-client | vite-ssr | stdout | stderr
  message: string;
  file?: string;
  raw: string;
};

const LOG_PATHS = ["/tmp/dev-server-logs/dev-server.log"];

function detectLevel(line: string): LogLevel {
  const l = line.toLowerCase();
  if (/\berror\b|\bexception\b|\bfailed\b|\bunhandled\b/.test(l)) return "error";
  if (/\bwarn(ing)?\b|\bdeprecated\b/.test(l)) return "warn";
  if (/\bdebug\b/.test(l)) return "debug";
  return "info";
}

function detectSource(line: string): string {
  if (line.includes("[vite] (client)")) return "vite-client";
  if (line.includes("[vite] (ssr)")) return "vite-ssr";
  if (line.includes("[vite]")) return "vite";
  if (line.startsWith("[stderr]")) return "stderr";
  if (line.startsWith("[stdout]")) return "stdout";
  return "stdout";
}

// Parse `H:MM:SS AM` or `HH:MM:SS` prefix into ISO using today's date.
function parseTimestamp(
  line: string,
  fallbackDay: string,
): { ts: string; day: string; time: string } {
  const m = line.match(/(\d{1,2}:\d{2}:\d{2})(?:\s*([AP]M))?/i);
  if (!m) {
    const ts = new Date().toISOString();
    return { ts, day: ts.slice(0, 10), time: ts.slice(11, 19) };
  }
  const parts = m[1].split(":").map(Number);
  let hh = parts[0];
  const mm = parts[1];
  const ss = parts[2];
  const ampm = m[2]?.toUpperCase();
  if (ampm === "PM" && hh < 12) hh += 12;
  if (ampm === "AM" && hh === 12) hh = 0;
  const time = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  const ts = `${fallbackDay}T${time}Z`;
  return { ts, day: fallbackDay, time };
}

function extractFile(message: string): string | undefined {
  const m = message.match(/(\/dev-server\/[^\s:]+|src\/[^\s:]+\.[a-zA-Z]+)(?::\d+:\d+)?/);
  return m?.[1]?.replace(/^\/dev-server\//, "");
}

export function parseLog(raw: string): LogEntry[] {
  const lines = raw.split(/\r?\n/);
  const today = new Date().toISOString().slice(0, 10);
  const entries: LogEntry[] = [];
  let id = 0;
  let current: LogEntry | null = null;

  for (const line of lines) {
    if (!line.trim()) continue;
    // Continuation lines (indented or "  File:" / "  Plugin:") attach to previous.
    if (current && /^\s+\S/.test(line)) {
      current.message += "\n" + line.replace(/^\s+/, "");
      current.raw += "\n" + line;
      const f = extractFile(line);
      if (!current.file && f) current.file = f;
      continue;
    }
    const source = detectSource(line);
    const cleaned = line
      .replace(/^\[(stdout|stderr)\]\s*/, "")
      .replace(/^\d{1,2}:\d{2}:\d{2}\s*[AP]M\s*/i, (m) => m); // keep timestamp for parse
    const { ts, day, time } = parseTimestamp(line, today);
    const message = line
      .replace(/^\[(stdout|stderr)\]\s*/, "")
      .replace(/^\d{1,2}:\d{2}:\d{2}\s*[AP]M\s*/i, "")
      .replace(/^\[vite\]\s*\([^)]*\)\s*/, "")
      .replace(/^\[vite\]\s*/, "")
      .trim();
    const level = detectLevel(line);
    current = {
      id: id++,
      ts,
      day,
      time,
      level,
      source,
      message,
      file: extractFile(message),
      raw: cleaned,
    };
    entries.push(current);
  }
  return entries;
}

export async function readLogs(): Promise<LogEntry[]> {
  // Guard: this module should only be reached on the dev server, but be safe.
  if (typeof process === "undefined" || process.env.NODE_ENV === "production") return [];
  try {
    const { readFile } = await import("node:fs/promises");
    for (const path of LOG_PATHS) {
      try {
        const raw = await readFile(path, "utf8");
        return parseLog(raw);
      } catch {
        /* try next */
      }
    }
  } catch {
    /* node:fs unavailable */
  }
  return [];
}

export async function readRecentLogs(limit = 80): Promise<LogEntry[]> {
  const all = await readLogs();
  return all.slice(-limit);
}

export function filterLogs(
  entries: LogEntry[],
  opts: { day?: string; levels?: LogLevel[]; q?: string; limit?: number },
): LogEntry[] {
  let out = entries;
  if (opts.day) out = out.filter((e) => e.day === opts.day);
  if (opts.levels && opts.levels.length) {
    const set = new Set(opts.levels);
    out = out.filter((e) => set.has(e.level));
  }
  if (opts.q) {
    const q = opts.q.toLowerCase();
    out = out.filter(
      (e) =>
        e.message.toLowerCase().includes(q) ||
        e.file?.toLowerCase().includes(q) ||
        e.source.toLowerCase().includes(q),
    );
  }
  if (opts.limit) out = out.slice(-opts.limit);
  return out;
}

export function groupByDay(entries: LogEntry[]): Record<string, LogEntry[]> {
  const out: Record<string, LogEntry[]> = {};
  for (const e of entries) {
    (out[e.day] ||= []).push(e);
  }
  return out;
}
