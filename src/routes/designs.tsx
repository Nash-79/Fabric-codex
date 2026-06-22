import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SiteHeader } from "@/components/SiteHeader";
import { listDesigns } from "@/lib/atlas.functions";

export const Route = createFileRoute("/designs")({
  head: () => ({
    meta: [
      { title: "Designs — Fabric Atlas" },
      {
        name: "description",
        content:
          "Cited Microsoft Fabric solution architectures, each validated against approved claims.",
      },
      { property: "og:title", content: "Designs — Fabric Atlas" },
      {
        property: "og:description",
        content: "Cited Fabric solution architectures, validated against approved claims.",
      },
    ],
  }),
  component: DesignsPage,
});

function DesignsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["designs"],
    queryFn: () => listDesigns(),
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="text-xs font-medium uppercase tracking-[0.18em] text-teal-300/80">
          Architectures
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Designs</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Solution designs generated from verified claims and run through the validation pass.
          Inferences are labelled.
        </p>

        <div className="mt-8 space-y-3">
          {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {error && <div className="text-sm text-rose-300">{(error as Error).message}</div>}
          {!isLoading && (data ?? []).length === 0 && (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No designs published yet. Designs are authored locally and synced via{" "}
              <code className="text-teal-300">scripts/import_content.py</code>.
            </div>
          )}
          {(data ?? []).map((d) => (
            <Link
              key={d.id}
              to="/design/$slug"
              params={{ slug: d.slug }}
              className="block rounded-2xl border border-border bg-card p-5 transition hover:border-border hover:bg-accent"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-foreground">{d.title}</h2>
                <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {d.status}
                </span>
              </div>
              {d.summary && <p className="mt-2 text-sm text-muted-foreground">{d.summary}</p>}
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
