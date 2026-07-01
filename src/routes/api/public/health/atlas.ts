// Public health endpoint reporting the Atlas knowledge-base state:
// last seed time/trigger/signature, total rows in core tables, whether the
// bundled content fingerprint matches the last run, and whether the GIN
// indexes powering search_atlas are present.
//
// Uses the publishable/anon key so it works without SUPABASE_SERVICE_ROLE_KEY
// (which is not available on Lovable Cloud). RLS policies allow anon reads on
// the KB tables and the search_atlas RPC.

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const EXPECTED_INDEXES = ["claims_fts_idx", "blogs_fts_idx", "sources_fts_idx", "topics_fts_idx"];

function publicClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase public configuration is missing.");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const Route = createFileRoute("/api/public/health/atlas")({
  server: {
    handlers: {
      GET: async () => {
        let sb;
        try {
          sb = publicClient();
        } catch (e: any) {
          return Response.json(
            { status: "degraded", reason: e?.message ?? "supabase config missing" },
            { status: 503, headers: { "cache-control": "no-store" } },
          );
        }

        const { computeContentSignature } = await import("@/lib/seed-content.server");

        const [lastRunRes, countsRes] = await Promise.all([
          sb
            .from("seed_runs" as any)
            .select(
              "id, ran_at, trigger, content_signature, skipped, duration_ms, error, claim_count, source_count",
            )
            .order("ran_at", { ascending: false })
            .limit(1)
            .maybeSingle()
            .then(
              (r) => r,
              (err) => ({ data: null, error: err }),
            ),
          sb.rpc("atlas_health_counts" as any).then(
            (r) => r,
            (err) => ({ data: null, error: err }),
          ),
        ]);
        const counts = (countsRes.data ?? {}) as Record<string, number>;
        const seedReadError = (lastRunRes as any)?.error?.message ?? null;

        // Quick smoke test: search_atlas RPC must respond.
        let rpcOk = false;
        let rpcError: string | null = null;
        try {
          const { error } = await sb.rpc("search_atlas", {
            term: "atlas",
            max_results: 1,
          });
          rpcOk = !error;
          rpcError = error?.message ?? null;
        } catch (e: any) {
          rpcError = e?.message ?? String(e);
        }

        let bundledSignature: string | null = null;
        try {
          bundledSignature = computeContentSignature();
        } catch {
          bundledSignature = null;
        }
        const lastSig = (lastRunRes as any)?.data?.content_signature ?? null;
        const seedUpToDate = !!lastSig && !!bundledSignature && lastSig === bundledSignature;

        // Verify each expected GIN index exists (may be denied to anon; degrade gracefully).
        let indexRows: Array<{ indexname: string }> | null = null;
        try {
          const { data } = await sb
            .from("pg_indexes" as any)
            .select("indexname")
            .in("indexname", EXPECTED_INDEXES);
          indexRows = (data ?? null) as any;
        } catch {
          indexRows = null;
        }
        const presentIndexes = new Set((indexRows ?? []).map((r: any) => r.indexname));
        const indexes = EXPECTED_INDEXES.map((name) => ({
          name,
          present: indexRows ? presentIndexes.has(name) : true,
        }));
        const indexesReady = indexes.every((i) => i.present);

        const lastSeedAt = (lastRunRes as any)?.data?.ran_at ?? null;
        const ageSeconds = lastSeedAt
          ? Math.round((Date.now() - new Date(lastSeedAt).getTime()) / 1000)
          : null;

        const status = !rpcOk || !indexesReady
          ? "degraded"
          : lastSeedAt && seedUpToDate
            ? "healthy"
            : "stale";

        return Response.json(
          {
            status,
            checked_at: new Date().toISOString(),
            seed: {
              last_run_at: lastSeedAt,
              last_run_age_seconds: ageSeconds,
              last_trigger: (lastRunRes as any)?.data?.trigger ?? null,
              last_skipped: (lastRunRes as any)?.data?.skipped ?? null,
              last_error: (lastRunRes as any)?.data?.error ?? null,
              read_error: seedReadError,
              up_to_date: seedUpToDate,
              bundled_signature: bundledSignature,
              last_signature: lastSig,
            },
            counts: {
              claims: Number(counts.claims ?? 0),
              sources: Number(counts.sources ?? 0),
              blogs: Number(counts.blogs ?? 0),
              topics: Number(counts.topics ?? 0),
              diagrams: Number(counts.diagrams ?? 0),
              designs: Number(counts.designs ?? 0),
              help_docs: Number(counts.help_docs ?? 0),
            },
            search_atlas: {
              rpc_ok: rpcOk,
              rpc_error: rpcError,
              indexes_ready: indexesReady,
              indexes,
            },
          },
          {
            headers: { "cache-control": "no-store" },
            status: status === "degraded" ? 503 : 200,
          },
        );
      },
    },
  },
});
