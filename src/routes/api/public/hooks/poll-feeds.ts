// Public cron webhook for scheduled RSS + roadmap polling. Authenticated with the Supabase
// publishable key in the apikey/x-api-key header, matching seed-content.ts.

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/poll-feeds")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        const apikey = request.headers.get("apikey") ?? request.headers.get("x-api-key");
        if (!expected || apikey !== expected) {
          return new Response("unauthorized", { status: 401 });
        }

        let body: { feeds?: boolean; roadmap?: boolean } = {};
        try {
          const raw = await request.text();
          body = raw ? JSON.parse(raw) : {};
        } catch {
          return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
        }

        const runFeeds = body.feeds !== false;
        const runRoadmap = body.roadmap !== false;
        const result: Record<string, unknown> = {};
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { pollFabricRoadmapCore, pollRssFeedsCore } = await import("@/lib/rss-poll.server");

        if (runFeeds) {
          result.feeds = await pollRssFeedsCore(supabaseAdmin, { actorId: null });
        }
        if (runRoadmap) {
          result.roadmap = await pollFabricRoadmapCore(supabaseAdmin);
        }

        await supabaseAdmin.from("admin_audit_events").insert({
          actor_id: null,
          action: "rss.polled_by_hook",
          target_type: "hook",
          target_id: "poll-feeds",
          metadata: result as any,
        });

        return Response.json({ ok: true, ...result });
      },
    },
  },
});
