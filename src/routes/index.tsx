import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { listDomains, listAssets } from "@/lib/atlas.functions";
import { SiteHeader } from "@/components/SiteHeader";
import { FabricMark } from "@/components/FabricMark";
import { accent } from "@/lib/fabric-theme";
import { ArrowRight, ShieldCheck, Network, Sparkles } from "lucide-react";

const domainsQO = queryOptions({ queryKey: ["domains"], queryFn: () => listDomains() });
const assetsQO = queryOptions({ queryKey: ["assets"], queryFn: () => listAssets() });

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Fabric Atlas — Governed knowledge for Microsoft Fabric" },
      { name: "description", content: "Governed knowledge → grounded architecture. A curated atlas of patterns, blueprints and references for Microsoft Fabric." },
      { property: "og:title", content: "Fabric Atlas — for Microsoft Fabric" },
      { property: "og:description", content: "Governed knowledge → grounded architecture." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/" },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(domainsQO),
      context.queryClient.ensureQueryData(assetsQO),
    ]);
  },
  component: Landing,
});

function Landing() {
  const { data: domains } = useSuspenseQuery(domainsQO);
  const { data: assets } = useSuspenseQuery(assetsQO);

  return (
    <div className="min-h-screen bg-[#070b16] text-white">
      <BackgroundGrid />
      <SiteHeader />

      {/* Hero */}
      <section className="relative mx-auto max-w-7xl px-6 pb-20 pt-20 md:pt-28">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-white/70">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-400" />
            Curated for Microsoft Fabric · OneLake-first
          </div>
          <h1 className="mt-6 text-balance text-5xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
            Fabric Atlas
            <span className="block bg-gradient-to-r from-teal-300 via-sky-300 to-violet-300 bg-clip-text text-transparent">
              Governed knowledge → grounded architecture
            </span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/65">
            A living atlas of patterns, blueprints and references for teams building on Microsoft Fabric.
            Reduce ambiguity, anchor decisions to lineage, and ship architectures your platform team already trusts.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/atlas" className="inline-flex items-center gap-2 rounded-md bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-white/90">
              Explore the atlas <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/auth" className="inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/[0.03] px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.06]">
              Create an account
            </Link>
          </div>

          <dl className="mt-12 grid grid-cols-3 gap-6 border-t border-white/10 pt-8 text-sm">
            <Stat n={String(domains.length)} l="Fabric domains" />
            <Stat n={String(assets.length)} l="Knowledge assets" />
            <Stat n="100%" l="Lineage-aware" />
          </dl>
        </div>

        <div className="pointer-events-none absolute right-0 top-20 hidden h-[420px] w-[420px] rounded-full bg-gradient-to-br from-teal-500/20 via-sky-500/10 to-transparent blur-3xl lg:block" />
      </section>

      {/* Domains grid */}
      <section className="relative mx-auto max-w-7xl px-6 pb-24">
        <SectionHeader
          eyebrow="Domains"
          title="Every layer of the Fabric stack, organized."
          desc="Each domain bundles vetted patterns, reference architectures and decision aids so your team stops re-deriving them."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {domains.map((d) => {
            const a = accent(d.accent);
            return (
              <Link
                key={d.id}
                to="/atlas"
                search={{ domain: d.slug }}
                className={`group relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br ${a.grad} from-[5%] to-white/[0.02] p-6 transition hover:border-white/20`}
              >
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-white/55">
                  <span className={`h-1.5 w-1.5 rounded-full ${a.dot}`} />
                  {d.tagline}
                </div>
                <h3 className="mt-3 text-lg font-semibold text-white">{d.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/65">{d.description}</p>
                <div className="mt-5 inline-flex items-center gap-1.5 text-xs font-medium text-white/70 group-hover:text-white">
                  Browse domain <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Value props */}
      <section className="relative mx-auto max-w-7xl px-6 pb-24">
        <SectionHeader eyebrow="Why an atlas" title="Architecture you can defend in review." />
        <div className="grid gap-5 md:grid-cols-3">
          <Pillar icon={<ShieldCheck className="h-5 w-5" />} title="Governed by design"
            text="Patterns reference Purview labels, workspace topology and OneLake security so they hold up to audit." />
          <Pillar icon={<Network className="h-5 w-5" />} title="Lineage-aware"
            text="Each asset traces upstream sources and downstream artifacts — no orphaned blueprints." />
          <Pillar icon={<Sparkles className="h-5 w-5" />} title="Decision aids, not slideware"
            text="Scoring rubrics, checklists and code-ready snippets you can drop into a Fabric notebook." />
        </div>
      </section>

      {/* Featured assets */}
      <section className="relative mx-auto max-w-7xl px-6 pb-32">
        <SectionHeader eyebrow="Featured" title="Latest blueprints in the atlas." />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {assets.slice(0, 6).map((a) => {
            const ac = accent(a.domains?.accent);
            return (
              <Link key={a.id} to="/atlas/$slug" params={{ slug: a.slug }} className={`group rounded-xl border border-white/10 bg-white/[0.02] p-5 transition hover:border-white/20 hover:bg-white/[0.04]`}>
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/50">
                  <span className={`h-1.5 w-1.5 rounded-full ${ac.dot}`} />
                  {a.domains?.name} · {a.asset_type}
                </div>
                <h4 className="mt-2 text-base font-semibold text-white">{a.title}</h4>
                <p className="mt-2 line-clamp-3 text-sm text-white/60">{a.summary}</p>
              </Link>
            );
          })}
        </div>
      </section>

      <footer className="border-t border-white/5 py-10 text-center text-xs text-white/40">
        <div className="mx-auto flex max-w-7xl items-center justify-center gap-2">
          <FabricMark className="h-4 w-4" />
          Fabric Atlas — independent reference for Microsoft Fabric teams.
        </div>
      </footer>
    </div>
  );
}

function BackgroundGrid() {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[600px] opacity-[0.35]"
      style={{
        backgroundImage:
          "linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)",
        backgroundSize: "44px 44px",
        maskImage: "radial-gradient(ellipse at top, black 40%, transparent 75%)",
      }}
    />
  );
}

function Stat({ n, l }: { n: string; l: string }) {
  return (
    <div>
      <div className="text-3xl font-semibold text-white">{n}</div>
      <div className="mt-1 text-xs uppercase tracking-wider text-white/50">{l}</div>
    </div>
  );
}

function SectionHeader({ eyebrow, title, desc }: { eyebrow: string; title: string; desc?: string }) {
  return (
    <div className="mb-8 max-w-2xl">
      <div className="text-xs font-medium uppercase tracking-[0.18em] text-teal-300/80">{eyebrow}</div>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white md:text-4xl">{title}</h2>
      {desc && <p className="mt-3 text-sm leading-relaxed text-white/60">{desc}</p>}
    </div>
  );
}

function Pillar({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
      <div className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-gradient-to-br from-teal-400/20 to-sky-500/20 text-teal-200">
        {icon}
      </div>
      <h3 className="mt-4 text-base font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-white/60">{text}</p>
    </div>
  );
}
