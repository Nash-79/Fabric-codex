// Server-only schema/data health checks. Read-only; safe to call in server functions,
// server routes, startup best-effort probes, and the CLI verifier.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type CheckStatus = "ok" | "warn" | "fail";
export type Check = { id: string; label: string; status: CheckStatus; detail?: string };
export type MigrationRef = { version: string; name: string };
export type SchemaHealthReport = {
  generatedAt: string;
  latestMigration: MigrationRef | null;
  recentMigrations: MigrationRef[];
  checks: Check[];
  summary: { ok: number; warn: number; fail: number };
};

// Hand-maintained expected shape. Update alongside migrations.
const EXPECTED_TABLES: { name: string; severity: CheckStatus }[] = [
  { name: "admin_audit_events", severity: "fail" },
  { name: "capabilities", severity: "fail" },
  { name: "claims", severity: "fail" },
  { name: "claimevents", severity: "fail" },
  { name: "content_feedback", severity: "warn" },
  { name: "content_item_sources", severity: "fail" },
  { name: "content_items", severity: "fail" },
  { name: "diagrams", severity: "fail" },
  { name: "favorites", severity: "fail" },
  { name: "help_docs", severity: "fail" },
  { name: "issues", severity: "warn" },
  { name: "profiles", severity: "fail" },
  { name: "queue_items", severity: "fail" },
  { name: "roadmap_items", severity: "fail" },
  { name: "roadmap_sync_state", severity: "warn" },
  { name: "rss_subscriptions", severity: "warn" },
  { name: "sources", severity: "fail" },
  { name: "topic_capabilities", severity: "fail" },
  { name: "topics", severity: "fail" },
  { name: "user_invitations", severity: "warn" },
  { name: "user_roles", severity: "fail" },
  { name: "validation_runs", severity: "warn" },
];

// Only probe read-only RPCs to avoid side effects; the rest are inferred present when has_role works.
const EXPECTED_RPCS: { name: string; probe: () => Promise<{ ok: boolean; detail?: string }> }[] = [
  {
    name: "has_role",
    probe: async () => {
      const { error } = await supabaseAdmin.rpc("has_role", {
        _user_id: "00000000-0000-0000-0000-000000000000",
        _role: "admin",
      });
      return classifyRpc(error);
    },
  },
  {
    name: "atlas_health_counts",
    probe: async () => {
      const { error } = await supabaseAdmin.rpc("atlas_health_counts");
      return classifyRpc(error);
    },
  },
  {
    name: "search_atlas",
    probe: async () => {
      const { error } = await supabaseAdmin.rpc("search_atlas", {
        term: "fabric",
        max_results: 1,
      });
      return classifyRpc(error);
    },
  },
  {
    name: "current_user_has_role",
    probe: async () => {
      // Requires auth.uid(); NULL uid is fine — function still exists and returns false.
      const { error } = await supabaseAdmin.rpc("current_user_has_role", { _role: "admin" });
      return classifyRpc(error);
    },
  },
];

// Seed thresholds: minimum row counts for the app to feel populated.
const SEED_CHECKS: {
  table: string;
  min: number;
  severity: CheckStatus;
  filter?: (q: any) => any;
}[] = [
  { table: "capabilities", min: 1, severity: "fail" },
  { table: "topics", min: 1, severity: "fail" },
  { table: "help_docs", min: 1, severity: "warn" },
  { table: "roadmap_items", min: 1, severity: "warn" },
  {
    table: "content_items",
    min: 1,
    severity: "warn",
    filter: (q) => q.eq("kind", "article").eq("active", true),
  },
];

function classifyRpc(error: any): { ok: boolean; detail?: string } {
  if (!error) return { ok: true };
  const msg = String(error.message ?? error);
  // PostgREST returns PGRST202 / 42883 when a function signature isn't found.
  if (/does not exist|PGRST202|42883|Could not find the function/i.test(msg)) {
    return { ok: false, detail: msg };
  }
  // Any other error means the function exists but the probe args weren't accepted — that's fine.
  return { ok: true };
}

// Bundled at build time — reflects what's in the repo, not what's applied. We treat this as
// the "expected" set; matched against runtime probes above.
const migrationFiles = import.meta.glob("/supabase/migrations/*.sql", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

function listBundledMigrations(): MigrationRef[] {
  return Object.keys(migrationFiles)
    .map((path) => {
      const file = path.split("/").pop() ?? path;
      const m = file.match(/^(\d{14})_(.+)\.sql$/);
      return m ? { version: m[1], name: m[2] } : { version: "", name: file };
    })
    .filter((m) => m.version)
    .sort((a, b) => b.version.localeCompare(a.version));
}

async function probeTable(name: string): Promise<{ ok: boolean; count: number; detail?: string }> {
  const { count, error } = await supabaseAdmin
    .from(name as any)
    .select("*", { count: "exact", head: true });
  if (error) {
    const msg = String(error.message ?? error);
    // PGRST205 / 42P01: table not found.
    if (/does not exist|PGRST205|42P01|Could not find the table/i.test(msg)) {
      return { ok: false, count: 0, detail: msg };
    }
    return { ok: true, count: 0, detail: msg };
  }
  return { ok: true, count: count ?? 0 };
}

export async function getSchemaHealth(): Promise<SchemaHealthReport> {
  const checks: Check[] = [];

  // Tables
  for (const { name, severity } of EXPECTED_TABLES) {
    const res = await probeTable(name);
    if (res.ok) {
      checks.push({
        id: `table:${name}`,
        label: `Table ${name}`,
        status: "ok",
        detail: `${res.count} rows`,
      });
    } else {
      checks.push({
        id: `table:${name}`,
        label: `Table ${name}`,
        status: severity,
        detail: res.detail ?? "missing",
      });
    }
  }

  // RPCs
  for (const rpc of EXPECTED_RPCS) {
    try {
      const res = await rpc.probe();
      checks.push({
        id: `rpc:${rpc.name}`,
        label: `RPC ${rpc.name}`,
        status: res.ok ? "ok" : "fail",
        detail: res.detail,
      });
    } catch (e: any) {
      checks.push({
        id: `rpc:${rpc.name}`,
        label: `RPC ${rpc.name}`,
        status: "fail",
        detail: String(e?.message ?? e),
      });
    }
  }

  // Seed data
  for (const seed of SEED_CHECKS) {
    let q = supabaseAdmin.from(seed.table as any).select("*", { count: "exact", head: true });
    if (seed.filter) q = seed.filter(q);
    const { count, error } = await q;
    if (error) {
      checks.push({
        id: `seed:${seed.table}`,
        label: `Seed data in ${seed.table}`,
        status: seed.severity,
        detail: String(error.message ?? error),
      });
      continue;
    }
    const n = count ?? 0;
    checks.push({
      id: `seed:${seed.table}`,
      label: `Seed data in ${seed.table}`,
      status: n >= seed.min ? "ok" : seed.severity,
      detail: `${n} rows (min ${seed.min})`,
    });
  }

  const recent = listBundledMigrations();
  const summary = checks.reduce((acc, c) => ((acc[c.status] += 1), acc), {
    ok: 0,
    warn: 0,
    fail: 0,
  });

  return {
    generatedAt: new Date().toISOString(),
    latestMigration: recent[0] ?? null,
    recentMigrations: recent.slice(0, 10),
    checks,
    summary,
  };
}
