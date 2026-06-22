import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SiteHeader } from "@/components/SiteHeader";
import { listLessons } from "@/lib/atlas.functions";

export const Route = createFileRoute("/learn")({
  head: () => ({
    meta: [
      { title: "Learn — Fabric Atlas" },
      {
        name: "description",
        content:
          "Tiered Microsoft Fabric learning paths: Beginner (L1–L2), Intermediate (L3), Expert (L4–L5).",
      },
      { property: "og:title", content: "Learn — Fabric Atlas" },
      {
        property: "og:description",
        content: "Tiered Microsoft Fabric learning paths grounded in cited claims.",
      },
    ],
  }),
  component: LearnPage,
});

const TIERS: { id: string; label: string; depths: string[]; blurb: string }[] = [
  {
    id: "beginner",
    label: "Beginner",
    depths: ["L1", "L2"],
    blurb: "Conceptual and practitioner essentials.",
  },
  {
    id: "intermediate",
    label: "Intermediate",
    depths: ["L3"],
    blurb: "Architect-level decisions and trade-offs.",
  },
  {
    id: "expert",
    label: "Expert",
    depths: ["L4", "L5"],
    blurb: "Performance tuning and internals.",
  },
];

function LearnPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["lessons"],
    queryFn: () => listLessons(),
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="text-xs font-medium uppercase tracking-[0.18em] text-teal-300/80">
          Paths
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Learn Microsoft Fabric</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Every lesson is grounded in approved, cited claims. Pick a tier.
        </p>

        <div className="mt-8 space-y-8">
          {error && <div className="text-sm text-rose-300">{(error as Error).message}</div>}
          {TIERS.map((t) => {
            const lessons = (data ?? []).filter((l) => t.depths.includes(l.depth));
            return (
              <section key={t.id}>
                <div className="flex items-baseline gap-3">
                  <h2 className="text-xl font-semibold text-foreground">{t.label}</h2>
                  <span className="text-xs text-muted-foreground">{t.depths.join(" · ")}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{t.blurb}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
                  {!isLoading && lessons.length === 0 && (
                    <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                      No lessons yet.
                    </div>
                  )}
                  {lessons.map((l) => (
                    <div key={l.id} className="rounded-xl border border-border bg-card p-4">
                      <div className="text-[10px] uppercase tracking-wide text-teal-300/70">
                        {l.depth}
                      </div>
                      <div className="mt-1 text-sm font-medium text-foreground">{l.title}</div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}
