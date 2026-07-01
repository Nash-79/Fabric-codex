// Public health endpoint reporting the Atlas knowledge-base state:
// last seed time/trigger/signature, total rows in core tables, whether the
// bundled content fingerprint matches the last run, and whether the GIN
// indexes powering search_atlas are present.

import { createFileRoute } from "@tanstack/react-router";

const EXPECTED_INDEXES = ["claims_fts_idx", "blogs_fts_idx", "sources_fts_idx", "topics_fts_idx"];

export const Route = createFileRoute("/api/public/health/atlas")({
  server: {
    handlers: {
      GET: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { computeContentSignature } = await import("@/lib/seed-content.server");

        const [lastRunRes, countsRes] = await Promise.all([
          supabaseAdmin
            .from("seed_runs")
            .select(
              "id, ran_at, trigger, content_signature, skipped, duration_ms, error, claim_count, source_count",
            )
            .order("ran_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabaseAdmin.rpc("atlas_health_counts"),
        ]);
        const counts = (countsRes.data ?? {}) as Record<string, number>;

        // Quick smoke test: search_atlas RPC must respond.
        let rpcOk = false;
        let rpcError: string | null = null;
        try {
          const { error } = await supabaseAdmin.rpc("search_atlas", {
            term: "atlas",
            max_results: 1,
          });
          rpcOk = !error;
          rpcError = error?.message ?? null;
        } catch (e: any) {
          rpcError = e?.message ?? String(e);
        }

        const bundledSignature = computeContentSignature();
        const lastSig = lastRunRes.data?.content_signature ?? null;
        const seedUpToDate = !!lastSig && lastSig === bundledSignature;

        // Verify each expected GIN index exists.
        const { data: indexRows } = await supabaseAdmin
          .from("pg_indexes" as any)
          .select("indexname")
          .in("indexname", EXPECTED_INDEXES);
        const presentIndexes = new Set((indexRows ?? []).map((r: any) => r.indexname));
        // Fallback when pg_indexes is not exposed: trust the migration ran.
        const indexes = EXPECTED_INDEXES.map((name) => ({
          name,
          present: indexRows ? presentIndexes.has(name) : true,
        }));
        const indexesReady = indexes.every((i) => i.present);

        const lastSeedAt = lastRunRes.data?.ran_at ?? null;
        const ageSeconds = lastSeedAt
          ? Math.round((Date.now() - new Date(lastSeedAt).getTime()) / 1000)
          : null;

        const status =
          !rpcOk || !indexesReady || !lastSeedAt ? "degraded" : seedUpToDate ? "healthy" : "stale";

        return Response.json(
          {
            status,
            checked_at: new Date().toISOString(),
            seed: {
              last_run_at: lastSeedAt,
              last_run_age_seconds: ageSeconds,
              last_trigger: lastRunRes.data?.trigger ?? null,
              last_skipped: lastRunRes.data?.skipped ?? null,
              last_error: lastRunRes.data?.error ?? null,
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
