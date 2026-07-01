## Goal

Replace the generic "This page didn't load" 500 with a developer-facing diagnostic page, and add a structured log viewer. Then audit why `/`, `/settings`, and other routes are failing so the diagnostics actually surface a root cause instead of just a prettier blank screen.

## 1. Diagnostic error page (replaces `renderErrorPage`)

Rework `src/lib/error-page.ts` into `renderErrorPage({ request, error, logs })` that renders:

- Header: HTTP method + path (e.g. `GET /`), timestamp, error class.
- "Failing route / loader" block — derived from the captured Error stack: parse the first frame that points into `src/routes/**` or `src/lib/**.functions.ts` and surface `<route file>` + nearest exported symbol (loader / handler / component). Falls back to "unknown" when the stack is unavailable.
- Error message + full stack (collapsible `<details>`, monospace).
- Recent dev-server log snippet (last ~80 lines, see §2) inlined server-side so it renders even when JS is dead.
- Action buttons: Reload, Go home, Open `/__dev/logs` (the new viewer).

Wire it through `src/server.ts` `normalizeCatastrophicSsrResponse` and the top-level catch so both pre-dispatch throws and h3-swallowed 500s flow through it. The page is gated to dev-only (`import.meta.env.DEV`) — production keeps the existing branded fallback so we don't leak stacks.

## 2. Structured dev log viewer

New server route `src/routes/api/public/__dev/logs.ts` (dev-only guard) that reads:

- SQLite daemon log at `/tmp/sandbox-state.db` (`daemon_logs` where `daemon_name='vite'`)
- Mirrored file at `/tmp/dev-server-logs/dev-server.log` as fallback

…and normalizes each line into a structured record:

```json
{
  "ts": "2026-06-24T07:08:45Z",
  "day": "2026-06-24",
  "level": "warn|error|info",
  "source": "vite-client|vite-ssr|stdout|stderr",
  "message": "...",
  "file": "src/...",
  "raw": "..."
}
```

Parser handles the `H:MM:SS AM [vite] (client) warning: <file>:<l>:<c> <msg>` shape plus plain stdout/stderr lines. Supports query params: `?day=YYYY-MM-DD&level=error,warn&q=substring&limit=500`.

New page route `src/routes/__dev.logs.tsx` (dev-only):

- Day selector (tabs grouped by `day`, newest first).
- Level filter chips (error / warn / info / debug) with counts.
- Free-text search box.
- Each entry is a collapsible `<details>` row: header shows time + level pill + truncated message; expanded shows file path, full message, and the pretty-printed JSON record.
- Auto-refresh toggle (poll every 3 s).
- "Copy as JSON" per entry and "Download day as NDJSON" per day.

Styled with existing Tailwind tokens, monospace for log bodies, no new deps.

## 3. Root-cause audit for failing routes

Before declaring the diagnostic work done, drive the new error page against `/`, `/advisor`, `/settings`, `/registry`, `/search`, `/sources`, `/topics`, `/designs`, `/learn`, `/help`, `/author` via curl + Playwright and capture which loader is throwing. Likely candidates from current dev-server output:

- `src/lib/atlas.functions.ts` still uses deprecated `.inputValidator()` (6 sites) — warning today, but TanStack may have already broken behavior; verify each loader returns data.
- `_authenticated/settings.tsx` loader runs under the auth gate but may invoke a server fn that needs `attachSupabaseAuth` — confirm middleware order in `src/start.ts` (CSRF warning indicates middleware audit overdue too).
- Public routes calling protected server fns from a loader (forbidden during SSR/prerender).

For each failing route, file a targeted fix in a follow-up step (not in this plan's scope unless trivial). The plan's exit criteria is: every top-nav route renders 200, or its 500 page clearly names the offending loader + log line.

## Technical notes

- Keep `error-page.ts` dependency-free (per `tanstack-ssr-error-handling`) — inline minimal CSS, no `@/` imports. Logs are passed in as a pre-rendered HTML string from the wrapper.
- `consumeLastCapturedError()` already gives us the Error object; extend it to also return `request.method + url` captured at fetch entry so the diagnostic page can show the failing request even when h3 swallowed it.
- Log viewer route lives under `/api/public/__dev/` (bypasses auth) but the handler short-circuits with 404 when `process.env.NODE_ENV === 'production'`, so it never ships live.
- No package installs required.

## Out of scope

- Persisting logs beyond the sandbox lifetime.
- Streaming logs over WebSocket (polling is sufficient).
- Production-side error reporting changes.
