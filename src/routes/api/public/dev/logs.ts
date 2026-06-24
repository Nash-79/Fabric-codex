import { createFileRoute } from "@tanstack/react-router";
import { filterLogs, groupByDay, readLogs, type LogLevel } from "@/lib/dev-logs.server";

export const Route = createFileRoute("/api/public/__dev/logs")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (typeof process !== "undefined" && process.env.NODE_ENV === "production") {
          return new Response("Not found", { status: 404 });
        }
        const url = new URL(request.url);
        const day = url.searchParams.get("day") || undefined;
        const q = url.searchParams.get("q") || undefined;
        const levelsParam = url.searchParams.get("levels");
        const limit = Number(url.searchParams.get("limit") || 500);
        const levels = levelsParam
          ? (levelsParam.split(",").filter(Boolean) as LogLevel[])
          : undefined;

        const all = await readLogs();
        const filtered = filterLogs(all, { day, levels, q, limit });
        const days = Object.keys(groupByDay(all)).sort().reverse();
        const counts = all.reduce<Record<string, number>>((acc, e) => {
          acc[e.level] = (acc[e.level] || 0) + 1;
          return acc;
        }, {});

        return Response.json(
          { total: all.length, days, counts, entries: filtered },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
