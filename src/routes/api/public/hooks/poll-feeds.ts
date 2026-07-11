// Public cron webhook for scheduled RSS + roadmap polling. Authenticated with the Supabase
// publishable key in the apikey/x-api-key header, matching seed-content.ts.

import { createFileRoute } from "@tanstack/react-router";
import { authorizeAgentRead, getAgentSnapshot } from "@/lib/agent-read.server";

export const Route = createFileRoute("/api/public/hooks/poll-feeds")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!authorizeAgentRead(request))
          return Response.json({ error: "unauthorized" }, { status: 401 });
        try {
          return Response.json(await getAgentSnapshot(), {
            headers: { "cache-control": "no-store" },
          });
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : "Agent snapshot failed." },
            { status: 503, headers: { "cache-control": "no-store" } },
          );
        }
      },
      POST: async ({ request }) => {
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        const apikey = request.headers.get("apikey") ?? request.headers.get("x-api-key");
        if (!expected || apikey !== expected) {
          return new Response("unauthorized", { status: 401 });
        }

        let body: { watchers?: boolean; feeds?: boolean; roadmap?: boolean } = {};
        try {
          const raw = await request.text();
          body = raw ? JSON.parse(raw) : {};
        } catch {
          return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
        }

        const runWatchers = body.watchers ?? body.feeds ?? true;
        const runRoadmap = body.roadmap !== false;
        const result: Record<string, unknown> = {};
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { pollFabricRoadmapCore } = await import("@/lib/rss-poll.server");
        const { pollSourceWatchersCore } = await import("@/lib/source-watcher.server");

        if (runWatchers) {
          result.watchers = await pollSourceWatchersCore(supabaseAdmin, { actorId: null });
        }
        if (runRoadmap) {
          result.roadmap = await pollFabricRoadmapCore(supabaseAdmin);
        }

        await supabaseAdmin.from("admin_audit_events").insert({
          actor_id: null,
          action: "watcher.polled_by_hook",
          target_type: "hook",
          target_id: "poll-feeds",
          metadata: result as any,
        });

        return Response.json({ ok: true, ...result });
      },
    },
  },
});
