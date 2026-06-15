import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, useEffect } from "react";
import { z } from "zod";
import { listDomains, listAssets, listMyFavorites, toggleFavorite } from "@/lib/atlas.functions";
import { SiteHeader } from "@/components/SiteHeader";
import { AssetCard } from "@/components/AssetCard";
import { accent } from "@/lib/fabric-theme";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

const domainsQO = queryOptions({ queryKey: ["domains"], queryFn: () => listDomains() });
const assetsQO = queryOptions({ queryKey: ["assets"], queryFn: () => listAssets() });

const SearchSchema = z.object({
  domain: z.string().optional(),
  q: z.string().optional(),
});

export const Route = createFileRoute("/atlas")({
  validateSearch: SearchSchema,
  head: () => ({
    meta: [
      { title: "Atlas — Fabric Atlas" },
      { name: "description", content: "Browse Microsoft Fabric architecture patterns, blueprints, and references." },
      { property: "og:title", content: "Fabric Atlas" },
      { property: "og:url", content: "/atlas" },
    ],
    links: [{ rel: "canonical", href: "/atlas" }],
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(domainsQO),
      context.queryClient.ensureQueryData(assetsQO),
    ]);
  },
  component: AtlasPage,
});

function AtlasPage() {
  const { domain, q } = Route.useSearch();
  const nav = Route.useNavigate();
  const { data: domains } = useSuspenseQuery(domainsQO);
  const { data: assets } = useSuspenseQuery(assetsQO);

  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const favsFn = useServerFn(listMyFavorites);
  const toggleFn = useServerFn(toggleFavorite);
  const qc = useQueryClient();
  const favoritesQ = useQuery({
    queryKey: ["favorites"],
    queryFn: () => favsFn(),
    enabled: signedIn,
  });
  const favoritedIds = useMemo(
    () => new Set((favoritesQ.data ?? []).map((f) => f.asset_id)),
    [favoritesQ.data],
  );

  const toggle = useMutation({
    mutationFn: (assetId: string) => toggleFn({ data: { assetId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["favorites"] }),
  });

  const filtered = useMemo(() => {
    const term = (q ?? "").toLowerCase().trim();
    return assets.filter((a) => {
      if (domain && a.domains?.slug !== domain) return false;
      if (!term) return true;
      return (
        a.title.toLowerCase().includes(term) ||
        a.summary.toLowerCase().includes(term) ||
        a.tags.some((t) => t.toLowerCase().includes(term))
      );
    });
  }, [assets, domain, q]);

  return (
    <div className="min-h-screen bg-[#070b16] text-white">
      <SiteHeader />
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-teal-300/80">The Atlas</div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">Patterns, blueprints and references</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/55">Filter by Fabric domain or search across the catalog. Sign in to bookmark anything for later.</p>
          </div>
          <div className="relative w-full md:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <Input
              defaultValue={q ?? ""}
              onChange={(e) => nav({ search: (prev: z.infer<typeof SearchSchema>) => ({ ...prev, q: e.target.value || undefined }) })}
              placeholder="Search the atlas…"
              className="border-white/10 bg-white/[0.04] pl-9 text-white placeholder:text-white/40"
            />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Chip active={!domain} onClick={() => nav({ search: (p: z.infer<typeof SearchSchema>) => ({ ...p, domain: undefined }) })} label={`All (${assets.length})`} />
          {domains.map((d) => {
            const a = accent(d.accent);
            const count = assets.filter((x) => x.domains?.slug === d.slug).length;
            return (
              <Chip
                key={d.id}
                active={domain === d.slug}
                onClick={() => nav({ search: (p: z.infer<typeof SearchSchema>) => ({ ...p, domain: d.slug }) })}
                label={
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${a.dot}`} /> {d.name}
                    <span className="text-white/40">{count}</span>
                  </span>
                }
              />
            );
          })}
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((a) => (
            <AssetCard
              key={a.id}
              asset={a as any}
              favorited={favoritedIds.has(a.id)}
              pending={toggle.isPending}
              onToggle={signedIn ? () => toggle.mutate(a.id) : undefined}
            />
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full rounded-xl border border-dashed border-white/15 p-12 text-center text-white/50">
              No assets match your filters.
            </div>
          )}
        </div>

        {!signedIn && (
          <div className="mt-10 rounded-xl border border-white/10 bg-gradient-to-r from-teal-500/10 to-violet-500/10 p-5 text-sm text-white/75">
            <Link to="/auth" className="font-semibold text-white underline-offset-4 hover:underline">
              Sign in
            </Link>{" "}
            to bookmark assets and curate your own working set.
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        active ? "border-white/30 bg-white/10 text-white" : "border-white/10 bg-white/[0.02] text-white/65 hover:bg-white/[0.05]"
      }`}
    >
      {label}
    </button>
  );
}
