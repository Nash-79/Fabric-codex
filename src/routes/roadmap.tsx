import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Badge } from "@/components/ui/badge";
import { listRoadmapItems, type RoadmapItem } from "@/lib/atlas.functions";

export const Route = createFileRoute("/roadmap")({
  head: () => ({
    meta: [
      { title: "Roadmap — Fabric Atlas" },
      {
        name: "description",
        content:
          "What's coming to Microsoft Fabric, synced from the Fabric GPS community mirror with source details preserved.",
      },
      { property: "og:title", content: "Roadmap — Fabric Atlas" },
      {
        property: "og:description",
        content:
          "The Microsoft Fabric public roadmap, synced item-for-item via the Fabric GPS API.",
      },
    ],
  }),
  component: RoadmapPage,
});

const STATUS_ORDER = ["rolling_out", "planned", "launched"] as const;
const STATUS_LABEL: Record<string, string> = {
  rolling_out: "Rolling out",
  planned: "Planned",
  launched: "Launched",
};
const STATUS_CLASS: Record<string, string> = {
  rolling_out: "border-teal-400/30 bg-teal-500/10 text-teal-200",
  planned: "border-amber-400/30 bg-amber-500/10 text-amber-200",
  launched: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
};

function RoadmapPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["roadmap-items"],
    queryFn: () => listRoadmapItems(),
  });

  const items = (data ?? []) as RoadmapItem[];

  const releaseTypes = useMemo(
    () => [...new Set(items.map((i) => i.release_type).filter(Boolean))].sort(),
    [items],
  );
  const quarters = useMemo(
    () => [...new Set(items.map((i) => i.target_release).filter(Boolean))].sort(),
    [items],
  );

  const [releaseType, setReleaseType] = useState<string>("");
  const [quarter, setQuarter] = useState<string>("");

  const filtered = useMemo(
    () =>
      items.filter(
        (i) =>
          (!releaseType || i.release_type === releaseType) &&
          (!quarter || i.target_release === quarter),
      ),
    [items, releaseType, quarter],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, RoadmapItem[]>();
    for (const status of STATUS_ORDER) map.set(status, []);
    for (const item of filtered) {
      const bucket = map.get(item.status) ?? map.get("planned")!;
      bucket.push(item);
    }
    return map;
  }, [filtered]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="text-xs font-medium uppercase tracking-[0.18em] text-teal-300/80">
          What&rsquo;s next
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Roadmap</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Synced verbatim from{" "}
          <a
            href="https://www.fabric-gps.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-teal-600 hover:underline dark:text-teal-300"
          >
            fabric-gps.com
          </a>
          , a community mirror of the Microsoft Fabric public roadmap. The records below preserve
          the API payload and link to canonical Microsoft posts where supplied; roadmap dates can
          change and are not treated as verified product availability.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <select
            value={releaseType}
            onChange={(e) => setReleaseType(e.target.value)}
            className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground"
          >
            <option value="">All release types</option>
            {releaseTypes.map((rt) => (
              <option key={rt} value={rt}>
                {rt}
              </option>
            ))}
          </select>
          <select
            value={quarter}
            onChange={(e) => setQuarter(e.target.value)}
            className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground"
          >
            <option value="">All target dates</option>
            {quarters.map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>
        </div>

        {isLoading && <div className="mt-8 text-sm text-muted-foreground">Loading roadmap…</div>}
        {error && <div className="mt-8 text-sm text-rose-300">{(error as Error).message}</div>}
        {!isLoading && items.length === 0 && (
          <div className="mt-8 rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No roadmap items synced yet.
          </div>
        )}

        {!isLoading &&
          items.length > 0 &&
          STATUS_ORDER.map((status) => {
            const bucket = grouped.get(status) ?? [];
            if (bucket.length === 0) return null;
            return (
              <section key={status} className="mt-8">
                <h2 className="mb-3 text-lg font-semibold tracking-tight">
                  {STATUS_LABEL[status]}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    ({bucket.length})
                  </span>
                </h2>
                <div className="space-y-3">
                  {bucket.map((item) => (
                    <a
                      key={item.id}
                      href={item.link}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-lg border border-border bg-card p-5 transition hover:border-border hover:bg-accent"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className={STATUS_CLASS[item.status] ?? STATUS_CLASS.planned}>
                            {STATUS_LABEL[item.status] ?? item.status}
                          </Badge>
                          {item.release_type && (
                            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                              {item.release_type}
                            </span>
                          )}
                          <h3 className="text-base font-semibold text-foreground">{item.title}</h3>
                        </div>
                        {item.target_release && (
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {item.target_release}
                          </span>
                        )}
                      </div>
                      {item.pub_date && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Last updated {new Date(item.pub_date).toLocaleDateString()}
                        </p>
                      )}
                      {item.product_name && (
                        <p className="mt-2 text-xs text-muted-foreground">{item.product_name}</p>
                      )}
                      {item.feature_description && (
                        <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">
                          {item.feature_description}
                        </p>
                      )}
                    </a>
                  ))}
                </div>
              </section>
            );
          })}
      </main>
    </div>
  );
}
