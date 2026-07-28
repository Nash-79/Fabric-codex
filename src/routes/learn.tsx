import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { listContentItems } from "@/lib/atlas.functions";
import { useLessonProgress } from "@/lib/use-lesson-progress";

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

const TIERS: { id: string; label: string; depths: number[]; blurb: string }[] = [
  {
    id: "beginner",
    label: "Beginner",
    depths: [1, 2],
    blurb: "Conceptual and practitioner essentials.",
  },
  {
    id: "intermediate",
    label: "Intermediate",
    depths: [3],
    blurb: "Architect-level decisions and trade-offs.",
  },
  {
    id: "expert",
    label: "Expert",
    depths: [4, 5],
    blurb: "Performance tuning and internals.",
  },
];

const TIER_SUFFIX: Record<string, string> = {
  beginner: "-beginner",
  intermediate: "-intermediate",
  expert: "-expert",
};

// Lessons follow a {family}-{tier} slug convention (e.g. spark-beginner, spark-sql-beginner).
// Suffix-strip rather than substring/includes matching, so "spark-sql-*" is never mistaken for a
// member of the "spark-*" family.
function familyOf(slug: string): string | null {
  for (const suffix of Object.values(TIER_SUFFIX)) {
    if (slug.endsWith(suffix)) return slug.slice(0, -suffix.length);
  }
  return null;
}

function nextTierSlug(slug: string, tierId: string): string | null {
  const family = familyOf(slug);
  if (!family) return null;
  const order = ["beginner", "intermediate", "expert"];
  const nextTier = order[order.indexOf(tierId) + 1];
  return nextTier ? `${family}${TIER_SUFFIX[nextTier]}` : null;
}

function LearnPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["content-items", "lesson"],
    queryFn: () => listContentItems({ data: { kind: "lesson" } }),
  });
  const { isDone } = useLessonProgress();

  const lessons = data ?? [];
  const bySlug = new Map(lessons.map((l: any) => [l.slug, l]));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="text-xs font-medium uppercase tracking-[0.18em] text-teal-300/80">
          Paths
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Learn Microsoft Fabric</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Every lesson is grounded in approved, cited claims. Pick a tier. Looking for architecture
          patterns instead?{" "}
          <Link to="/designs" className="text-teal-600 hover:underline dark:text-teal-300">
            Browse the architecture gallery →
          </Link>
        </p>

        {error && (
          <div className="mt-8 text-sm text-rose-600 dark:text-rose-300">
            {(error as Error).message}
          </div>
        )}

        <div className="mt-8 space-y-8">
          {TIERS.map((t) => {
            const tierLessons = lessons.filter((l: any) =>
              (l.depth_levels ?? []).some((d: number) => t.depths.includes(d)),
            );
            return (
              <section key={t.id}>
                <div className="flex items-baseline gap-3">
                  <h2 className="text-xl font-semibold text-foreground">{t.label}</h2>
                  <span className="text-xs text-muted-foreground">
                    {t.depths.map((d) => `L${d}`).join(" · ")}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{t.blurb}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
                  {!isLoading && tierLessons.length === 0 && (
                    <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                      No lessons yet.
                    </div>
                  )}
                  {tierLessons.map((l: any) => {
                    const meta = l.lesson_meta;
                    const done = isDone(l.slug);
                    const nextSlug = nextTierSlug(l.slug, t.id);
                    const next = nextSlug ? bySlug.get(nextSlug) : null;
                    return (
                      <Link
                        key={l.id}
                        to="/blogs/$kind/$slug"
                        params={{ kind: "lesson", slug: l.slug }}
                        search={{ from: "learn" }}
                        className="block rounded-xl border border-border bg-card p-4 transition hover:bg-accent"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[10px] uppercase tracking-wide text-teal-300/70">
                            {(l.depth_levels ?? []).map((d: number) => `L${d}`).join(" · ") || "L1"}
                          </div>
                          {done && (
                            <CheckCircle2
                              className="h-4 w-4 shrink-0 text-teal-500"
                              aria-label="Completed"
                            />
                          )}
                        </div>
                        <div className="mt-1 text-sm font-medium text-foreground">{l.title}</div>
                        {meta?.estimated_minutes && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            ~{meta.estimated_minutes} min
                          </div>
                        )}
                        {meta?.objectives?.length > 0 && (
                          <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                            {meta.objectives.slice(0, 3).map((o: string) => (
                              <li key={o}>{o}</li>
                            ))}
                          </ul>
                        )}
                        {next && (
                          <div className="mt-2 text-xs text-muted-foreground">
                            Next: {next.title}
                          </div>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}
