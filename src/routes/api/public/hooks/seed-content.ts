// Public cron webhook that re-seeds bundled content/ into Supabase when the
// content fingerprint changes. Authenticated via the Supabase publishable key
// (apikey header) so pg_cron can call it without a custom shared secret.

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/seed-content")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        const apikey = request.headers.get("apikey") ?? request.headers.get("x-api-key");
        if (!expected || apikey !== expected) {
          return new Response("unauthorized", { status: 401 });
        }

        let force = false;
        try {
          const body = (await request.json()) as { force?: boolean } | null;
          force = !!body?.force;
        } catch {
          // empty body is fine
        }

        const started = Date.now();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runContentSeed, computeContentSignature } =
          await import("@/lib/seed-content.server");
        const signature = computeContentSignature();

        // Skip when the bundled content fingerprint matches the last successful run.
        if (!force) {
          const { data: last } = await supabaseAdmin
            .from("seed_runs")
            .select("content_signature, skipped, error")
            .order("ran_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (last && !last.error && last.content_signature === signature) {
            const { data: ins } = await supabaseAdmin
              .from("seed_runs")
              .insert({
                trigger: "cron",
                content_signature: signature,
                skipped: true,
                duration_ms: Date.now() - started,
              })
              .select("id")
              .single();
            return Response.json({
              ok: true,
              skipped: true,
              reason: "content_signature_unchanged",
              signature,
              run_id: ins?.id,
            });
          }
        }

        try {
          const summary = await runContentSeed(supabaseAdmin);

          // search_atlas reads from base tables; ANALYZE refreshes planner stats
          // so the GIN indexes are picked up promptly after large upserts.
          await supabaseAdmin.rpc("search_atlas", { term: "atlas", max_results: 1 });

          const { data: ins } = await supabaseAdmin
            .from("seed_runs")
            .insert({
              trigger: force ? "cron-force" : "cron",
              content_signature: summary.signature,
              source_count: summary.sourceRowsUpserted,
              claim_count: summary.claimsInserted,
              blog_count: summary.blogRowsUpserted,
              topic_count: summary.topicRowsUpserted,
              diagram_count: summary.diagramRowsUpserted,
              skipped: false,
              duration_ms: Date.now() - started,
            })
            .select("id")
            .single();

          return Response.json({ ok: true, skipped: false, run_id: ins?.id, summary });
        } catch (err: any) {
          const message = err?.message ?? String(err);
          await supabaseAdmin.from("seed_runs").insert({
            trigger: force ? "cron-force" : "cron",
            content_signature: signature,
            skipped: false,
            duration_ms: Date.now() - started,
            error: message,
          });
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
