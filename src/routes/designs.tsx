import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";

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
  const { data, isLoading } = useQuery({
    queryKey: ["designs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("designs")
        .select("id,slug,title,summary,status,updated_at")
        .order("updated_at", { ascending: false });
      return data ?? [];
    },
  });

  return (
    <div className="min-h-screen bg-[#070b16] text-white">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="text-xs font-medium uppercase tracking-[0.18em] text-teal-300/80">
          Architectures
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Designs</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/55">
          Solution designs generated from verified claims and run through the validation pass.
          Inferences are labelled.
        </p>

        <div className="mt-8 space-y-3">
          {isLoading && <div className="text-sm text-white/40">Loading…</div>}
          {!isLoading && (data ?? []).length === 0 && (
            <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm text-white/45">
              No designs published yet. Designs are authored locally and synced via{" "}
              <code className="text-teal-300">scripts/import_content.py</code>.
            </div>
          )}
          {(data ?? []).map((d) => (
            <Link
              key={d.id}
              to="/design/$slug"
              params={{ slug: d.slug }}
              className="block rounded-2xl border border-white/10 bg-white/[0.02] p-5 transition hover:border-white/25 hover:bg-white/[0.04]"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-white">{d.title}</h2>
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/60">
                  {d.status}
                </span>
              </div>
              {d.summary && <p className="mt-2 text-sm text-white/65">{d.summary}</p>}
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
