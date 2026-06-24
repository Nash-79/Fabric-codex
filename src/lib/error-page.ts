import type { LogEntry } from "./dev-logs.server";

function detectSupabaseEnvError(error: unknown): { missing: string[] } | null {
  const msg = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (!/Missing Supabase environment variable/i.test(msg)) return null;
  const after = msg.split(":")[1] ?? "";
  const missing = after
    .split(/[,.]/)[0]
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[A-Z_]+$/.test(s));
  return { missing: missing.length ? missing : ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY"] };
}

export function renderErrorPage(error?: unknown): string {
  const supa = detectSupabaseEnvError(error);
  const title = supa ? "Backend not configured" : "This page didn't load";
  const body = supa
    ? `<h1>Backend not configured</h1>
       <p>This deployment is missing required backend environment variables, so authentication can't start.</p>
       <div class="panel">
         <div class="panel-label">Missing variable${supa.missing.length > 1 ? "s" : ""}</div>
         <ul class="vars">${supa.missing.map((v) => `<li><code>${v}</code></li>`).join("")}</ul>
       </div>
       <ol class="steps">
         <li>In the Lovable editor, open <strong>Cloud</strong> and confirm the backend is connected.</li>
         <li>Click <strong>Publish &rarr; Update</strong> to rebuild with the latest environment variables.</li>
         <li>Wait ~1 minute for the deploy to finish, then hard-refresh this page (Ctrl/Cmd+Shift+R).</li>
       </ol>
       <p class="hint">The variables exist in the project, but the currently published bundle was built before they were available. Re-publishing inlines them into the new client bundle.</p>`
    : `<h1>This page didn't load</h1>
       <p>Something went wrong on our end. You can try refreshing or head back home.</p>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font: 15px/1.55 system-ui, -apple-system, sans-serif; background: #fafafa; color: #111; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 34rem; width: 100%; padding: 2rem; background: #fff; border: 1px solid #e5e7eb; border-radius: 0.75rem; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
      h1 { font-size: 1.35rem; margin: 0 0 0.5rem; }
      p { color: #4b5563; margin: 0 0 1rem; }
      .panel { background: #fef3c7; border: 1px solid #fde68a; border-radius: 0.5rem; padding: 0.75rem 1rem; margin: 1rem 0; }
      .panel-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #92400e; margin-bottom: 0.25rem; }
      .vars { margin: 0; padding-left: 1.1rem; }
      .vars code { background: rgba(0,0,0,0.06); padding: 1px 6px; border-radius: 3px; font-size: 12.5px; }
      .steps { color: #374151; padding-left: 1.25rem; margin: 0.5rem 0 1rem; }
      .steps li { margin-bottom: 0.35rem; }
      .hint { color: #6b7280; font-size: 13px; margin-top: 0.75rem; }
      .actions { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 1.25rem; }
      a, button { padding: 0.5rem 1rem; border-radius: 0.375rem; font: inherit; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: #111; color: #fff; }
      .secondary { background: #fff; color: #111; border-color: #d1d5db; }
    </style>
  </head>
  <body>
    <div class="card">
      ${body}
      <div class="actions">
        <button class="primary" onclick="location.reload()">Try again</button>
        <a class="secondary" href="/">Go home</a>
      </div>
    </div>
  </body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type StackFrame = { file: string; line?: string; col?: string; symbol?: string };

function parseFirstAppFrame(stack: string | undefined): StackFrame | undefined {
  if (!stack) return undefined;
  const lines = stack.split("\n");
  for (const raw of lines) {
    const m = raw.match(/at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?/);
    if (!m) continue;
    const file = m[2];
    if (!/\/src\//.test(file) && !/^src\//.test(file)) continue;
    if (/node_modules/.test(file)) continue;
    return {
      symbol: m[1]?.trim(),
      file: file.replace(/^.*\/src\//, "src/"),
      line: m[3],
      col: m[4],
    };
  }
  return undefined;
}

function inferRoute(file?: string): string | undefined {
  if (!file) return undefined;
  if (file.includes("src/routes/")) {
    return file
      .replace(/^.*src\/routes\//, "")
      .replace(/\.tsx?$/, "")
      .replace(/\./g, "/");
  }
  if (file.includes(".functions.")) return `serverFn: ${file.split("/").pop()}`;
  return file.split("/").pop();
}

function levelBadge(level: string) {
  const colors: Record<string, string> = {
    error: "#fee2e2;color:#991b1b",
    warn: "#fef3c7;color:#92400e",
    info: "#e0f2fe;color:#075985",
    debug: "#f3f4f6;color:#374151",
  };
  return `background:${colors[level] || colors.info};padding:1px 6px;border-radius:3px;font-size:11px;font-weight:600;text-transform:uppercase`;
}

export function renderDevErrorPage(opts: {
  request?: { method: string; pathname: string };
  error: unknown;
  logs: LogEntry[];
}): string {
  const err = opts.error;
  const errObj = err instanceof Error ? err : undefined;
  const name = errObj?.name ?? "Error";
  const message = errObj?.message ?? String(err ?? "Unknown error");
  const stack = errObj?.stack ?? "";
  const frame = parseFirstAppFrame(stack);
  const route = inferRoute(frame?.file);
  const req = opts.request;
  const reqLine = req ? `${req.method} ${req.pathname}` : "unknown request";
  const ts = new Date().toISOString();

  const logRows = opts.logs
    .slice(-60)
    .reverse()
    .map((e) => {
      return `<tr>
  <td style="padding:4px 8px;color:#6b7280;white-space:nowrap;font-variant-numeric:tabular-nums">${escapeHtml(e.time)}</td>
  <td style="padding:4px 8px"><span style="${levelBadge(e.level)}">${e.level}</span></td>
  <td style="padding:4px 8px;color:#6b7280;white-space:nowrap">${escapeHtml(e.source)}</td>
  <td style="padding:4px 8px;font-family:ui-monospace,monospace;font-size:12px;color:#111;white-space:pre-wrap;word-break:break-word">${escapeHtml(e.message)}</td>
</tr>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>SSR error · ${escapeHtml(reqLine)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
  :root { color-scheme: light dark; }
  body { font: 14px/1.5 -apple-system, system-ui, sans-serif; background: #0b1020; color: #e5e7eb; margin: 0; padding: 24px; }
  .wrap { max-width: 1100px; margin: 0 auto; }
  .pill { display:inline-block;background:#1f2937;color:#fca5a5;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase }
  h1 { font-size: 20px; margin: 8px 0 4px; color: #fee2e2 }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: #9ca3af; margin: 28px 0 8px }
  .card { background: #111827; border: 1px solid #1f2937; border-radius: 8px; padding: 16px; }
  .grid { display: grid; grid-template-columns: 160px 1fr; gap: 6px 16px; font-size: 13px }
  .grid dt { color: #9ca3af }
  .grid dd { margin: 0; font-family: ui-monospace, monospace; color: #e5e7eb; word-break: break-all }
  pre { margin: 0; padding: 12px; background: #0b1020; border: 1px solid #1f2937; border-radius: 6px; overflow: auto; font-size: 12px; color: #fca5a5 }
  details > summary { cursor: pointer; color: #9ca3af; padding: 6px 0 }
  table { width: 100%; border-collapse: collapse; font-size: 12px }
  table tr { border-bottom: 1px solid #1f2937 }
  .actions a, .actions button { display:inline-block;margin-right:8px;padding:8px 14px;border-radius:6px;font-size:13px;font-weight:500;border:1px solid #374151;background:#1f2937;color:#e5e7eb;cursor:pointer;text-decoration:none }
  .actions .primary { background:#2563eb;border-color:#2563eb;color:#fff }
  .muted { color: #6b7280 }
</style>
</head>
<body>
<div class="wrap">
  <div class="pill">Dev server error · 500</div>
  <h1>${escapeHtml(name)}: ${escapeHtml(message.split("\n")[0])}</h1>
  <div class="muted" style="font-size:12px">${escapeHtml(ts)}</div>

  <div class="actions" style="margin:16px 0 4px">
    <button class="primary" onclick="location.reload()">Reload</button>
    <a href="/">Go home</a>
    <a href="/dev/logs" target="_blank">Open log viewer</a>
  </div>

  <h2>Request</h2>
  <div class="card">
    <dl class="grid">
      <dt>Method · Path</dt><dd>${escapeHtml(reqLine)}</dd>
      <dt>Failing route</dt><dd>${escapeHtml(route ?? "unknown — no app frame in stack")}</dd>
      <dt>Source</dt><dd>${frame ? escapeHtml(`${frame.file}:${frame.line}:${frame.col}`) : '<span class="muted">unknown</span>'}</dd>
      <dt>Symbol</dt><dd>${frame?.symbol ? escapeHtml(frame.symbol) : '<span class="muted">unknown</span>'}</dd>
    </dl>
  </div>

  <h2>Error</h2>
  <div class="card">
    <div style="font-family:ui-monospace,monospace;font-size:13px;color:#fca5a5;white-space:pre-wrap;word-break:break-word">${escapeHtml(message)}</div>
    ${stack ? `<details style="margin-top:10px"><summary>Stack trace</summary><pre>${escapeHtml(stack)}</pre></details>` : ""}
  </div>

  <h2>Recent dev-server logs (${opts.logs.length})</h2>
  <div class="card" style="padding:0;overflow:auto;max-height:420px">
    ${logRows ? `<table>${logRows}</table>` : '<div style="padding:16px" class="muted">No logs available.</div>'}
  </div>

  <p class="muted" style="margin-top:16px;font-size:12px">This diagnostic page is only shown in development.</p>
</div>
</body>
</html>`;
}
