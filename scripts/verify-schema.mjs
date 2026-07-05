#!/usr/bin/env node
/**
 * CI / startup schema verifier. Runs the same expected-shape probes as the
 * in-app Migration Status panel and exits non-zero when any `fail` check trips.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Skips (exit 0 with notice) when either is missing so PR builds on forks don't fail.
 */
import { createClient } from "@supabase/supabase-js";
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.log("[verify-schema] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — skipping.");
  process.exit(0);
}

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const EXPECTED_TABLES = [
  ["admin_audit_events", "fail"],
  ["capabilities", "fail"],
  ["claims", "fail"],
  ["claimevents", "fail"],
  ["content_item_sources", "fail"],
  ["content_items", "fail"],
  ["diagrams", "fail"],
  ["favorites", "fail"],
  ["help_docs", "fail"],
  ["issues", "warn"],
  ["profiles", "fail"],
  ["queue_items", "fail"],
  ["roadmap_items", "fail"],
  ["roadmap_sync_state", "warn"],
  ["rss_subscriptions", "warn"],
  ["sources", "fail"],
  ["topic_capabilities", "fail"],
  ["topics", "fail"],
  ["user_invitations", "warn"],
  ["user_roles", "fail"],
  ["validation_runs", "warn"],
];

const EXPECTED_RPCS = [
  ["has_role", { _user_id: "00000000-0000-0000-0000-000000000000", _role: "admin" }],
  ["atlas_health_counts", {}],
  ["search_atlas", { term: "fabric", max_results: 1 }],
  ["current_user_has_role", { _role: "admin" }],
];

const SEED_CHECKS = [
  { table: "capabilities", min: 1, severity: "fail" },
  { table: "topics", min: 1, severity: "fail" },
  { table: "help_docs", min: 1, severity: "warn" },
  { table: "roadmap_items", min: 1, severity: "warn" },
  { table: "content_items", min: 1, severity: "warn", filter: { kind: "article", active: true } },
];

const results = [];
const push = (status, label, detail) => results.push({ status, label, detail });

for (const [name, severity] of EXPECTED_TABLES) {
  const { count, error } = await sb.from(name).select("*", { count: "exact", head: true });
  if (error && /does not exist|PGRST205|42P01|Could not find the table/i.test(error.message)) {
    push(severity, `table ${name}`, "missing");
  } else if (error) {
    push("ok", `table ${name}`, error.message);
  } else {
    push("ok", `table ${name}`, `${count ?? 0} rows`);
  }
}

for (const [name, args] of EXPECTED_RPCS) {
  const { error } = await sb.rpc(name, args);
  if (error && /does not exist|PGRST202|42883|Could not find the function/i.test(error.message)) {
    push("fail", `rpc ${name}`, "missing");
  } else {
    push("ok", `rpc ${name}`);
  }
}

for (const seed of SEED_CHECKS) {
  let q = sb.from(seed.table).select("*", { count: "exact", head: true });
  for (const [k, v] of Object.entries(seed.filter ?? {})) q = q.eq(k, v);
  const { count, error } = await q;
  if (error) push(seed.severity, `seed ${seed.table}`, error.message);
  else {
    const n = count ?? 0;
    push(n >= seed.min ? "ok" : seed.severity, `seed ${seed.table}`, `${n} rows (min ${seed.min})`);
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
let latest = null;
try {
  const files = readdirSync(join(__dirname, "..", "supabase", "migrations"))
    .filter((f) => /^\d{14}_.+\.sql$/.test(f))
    .sort()
    .reverse();
  latest = files[0] ?? null;
} catch {}

const summary = results.reduce((a, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), a), {
  ok: 0,
  warn: 0,
  fail: 0,
});

console.log(`[verify-schema] latest bundled migration: ${latest ?? "(none)"}`);
for (const r of results) {
  const tag = r.status.toUpperCase().padEnd(4);
  console.log(`  ${tag} ${r.label}${r.detail ? ` — ${r.detail}` : ""}`);
}
console.log(
  `[verify-schema] summary: ${summary.ok} ok, ${summary.warn} warn, ${summary.fail} fail`,
);

process.exit(summary.fail > 0 ? 1 : 0);
