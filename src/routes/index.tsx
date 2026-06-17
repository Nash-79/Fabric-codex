import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQueries, queryOptions } from "@tanstack/react-query";
import { Bot, BookOpen, Database, FileText, Filter, Network, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { DepthBadge, TierBadge } from "@/components/Badges";
import { FabricMark } from "@/components/FabricMark";
import { SiteHeader } from "@/components/SiteHeader";
import {
  listBlogs,
  listCapabilities,
  listClaimsByCapability,
  listSources,
  listTopics,
} from "@/lib/atlas.functions";
import { accent } from "@/lib/fabric-theme";

const topicsQO = queryOptions({ queryKey: ["home-topics"], queryFn: () => listTopics() });
const blogsQO = queryOptions({ queryKey: ["home-blogs"], queryFn: () => listBlogs() });
const sourcesQO = queryOptions({ queryKey: ["home-sources"], queryFn: () => listSources() });
const capabilitiesQO = queryOptions({
  queryKey: ["home-capabilities"],
  queryFn: () => listCapabilities(),
});
const claimsQO = queryOptions({
  queryKey: ["home-claims"],
  queryFn: () => listClaimsByCapability({ data: {} }),
});

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Fabric Atlas — Interactive Microsoft Fabric knowledge atlas" },
      {
        name: "description",
        content:
          "Explore Microsoft Fabric capabilities through cited claims, source-backed articles, diagrams, and a grounded Advisor.",
      },
      { property: "og:title", content: "Fabric Atlas" },
      {
        property: "og:description",
        content: "Interactive Microsoft Fabric atlas with cited claims and grounded architecture.",
      },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(topicsQO),
      context.queryClient.ensureQueryData(blogsQO),
      context.queryClient.ensureQueryData(sourcesQO),
      context.queryClient.ensureQueryData(capabilitiesQO),
      context.queryClient.ensureQueryData(claimsQO),
    ]),
  component: Landing,
});

function Landing() {
  const [
    { data: topics },
    { data: blogs },
    { data: sources },
    { data: capabilities },
    { data: claims },
  ] = useSuspenseQueries({
    queries: [topicsQO, blogsQO, sourcesQO, capabilitiesQO, claimsQO],
  });
  const [selectedCapability, setSelectedCapability] = useState("direct-lake");
  const [depth, setDepth] = useState<number | "all">("all");
  const [tier, setTier] = useState<number | "all">("all");
  const [query, setQuery] = useState("");

  const childTopics = useMemo(() => topics.filter((topic) => topic.parent_slug), [topics]);
  const selected = capabilities.find((capability) => capability.id === selectedCapability);
  const selectedTopic =
    childTopics.find((topic: any) => topic.capability_ids?.includes(selectedCapability)) ??
    childTopics.find((topic) => topic.slug === selectedCapability);
  const selectedBlogs = blogs.filter((blog) => blog.topic_slug === selectedTopic?.slug);

  const visibleClaims = useMemo(() => {
    const q = query.trim().toLowerCase();
    return claims
      .filter((claim) => claim.capability_id === selectedCapability)
      .filter((claim) => depth === "all" || claim.depth === depth)
      .filter((claim: any) => tier === "all" || claim.sources?.tier === tier)
      .filter((claim) => !q || `${claim.text} ${claim.tags?.join(" ")}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [claims, depth, query, selectedCapability, tier]);

  const sourceCount = new Set(
    claims
      .filter((claim) => claim.capability_id === selectedCapability)
      .map((claim: any) => claim.sources?.slug)
      .filter(Boolean),
  ).size;

  const a = accent(selected?.accent);
  const diagramPath = `/diagrams/${selectedCapability}.svg`;

  return (
    <div className="min-h-screen bg-[#070b16] text-white">
      <SiteHeader />
      <main>
        <section className="border-b border-white/10 bg-[#090f1f]">
          <div className="mx-auto grid max-w-7xl gap-8 px-6 py-10 lg:grid-cols-[360px_minmax(0,1fr)]">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-teal-300/80">
                <FabricMark className="h-4 w-4" />
                Interactive atlas
              </div>
              <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
                Fabric Atlas
              </h1>
              <p className="mt-4 text-base leading-relaxed text-white/65">
                Browse Microsoft Fabric by capability, inspect cited claims, open source-backed
                articles, and jump into Advisor prompts grounded in the same registry.
              </p>
              <div className="mt-6 grid grid-cols-3 gap-2">
                <Metric icon={Network} label="Topics" value={childTopics.length} />
                <Metric icon={BookOpen} label="Articles" value={blogs.length} />
                <Metric icon={Database} label="Sources" value={sources.length} />
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
              <section className="rounded-md border border-white/10 bg-white/[0.025] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-white/45">
                      Capability map
                    </div>
                    <h2 className="mt-1 text-lg font-semibold">Explore the registry spine</h2>
                  </div>
                  <Link
                    to="/registry"
                    className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-white/65 hover:bg-white/5 hover:text-white"
                  >
                    Registry
                  </Link>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {capabilities.map((capability) => {
                    const active = capability.id === selectedCapability;
                    const capAccent = accent(capability.accent);
                    const topic = childTopics.find((t: any) =>
                      t.capability_ids?.includes(capability.id),
                    );
                    const count = claims.filter(
                      (claim) => claim.capability_id === capability.id,
                    ).length;
                    return (
                      <button
                        key={capability.id}
                        onClick={() => setSelectedCapability(capability.id)}
                        className={`min-h-24 rounded-md border p-3 text-left transition ${
                          active
                            ? `border-white/30 bg-white/[0.08] ring-2 ${capAccent.ring}`
                            : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`h-2 w-2 rounded-full ${capAccent.dot}`}
                            aria-hidden="true"
                          />
                          <span className="text-[10px] text-white/40">{count} claims</span>
                        </div>
                        <div className="mt-2 text-sm font-semibold text-white">
                          {capability.name}
                        </div>
                        <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-white/50">
                          {topic?.description ?? capability.description}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              <aside className="rounded-md border border-white/10 bg-white/[0.025] p-4">
                <div className={`inline-flex rounded-full border px-2 py-1 text-xs ${a.chip}`}>
                  <span className={`mr-1.5 mt-1 h-1.5 w-1.5 rounded-full ${a.dot}`} />
                  {selected?.name ?? selectedCapability}
                </div>
                <h2 className="mt-4 text-xl font-semibold tracking-tight">
                  {selectedTopic?.name ?? selected?.name}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-white/55">
                  {selectedTopic?.description ?? selected?.description}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <Stat label="Claims" value={visibleClaims.length} />
                  <Stat label="Sources" value={sourceCount} />
                </div>
                <div className="mt-4 overflow-hidden rounded-md border border-white/10 bg-[#050816]">
                  <img
                    src={diagramPath}
                    alt={`${selected?.name ?? selectedCapability} diagram`}
                    className="aspect-[4/3] w-full object-contain p-3"
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                    }}
                  />
                </div>
                <Link
                  to="/advisor"
                  className="mt-4 flex items-center justify-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-semibold text-[#070b16] hover:bg-white/90"
                >
                  <Bot className="h-4 w-4" />
                  Ask Advisor
                </Link>
              </aside>
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-6 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <section className="rounded-md border border-white/10 bg-white/[0.025]">
              <div className="flex flex-col gap-3 border-b border-white/10 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/45">
                    <Filter className="h-4 w-4" />
                    Claim workbench
                  </div>
                  <h2 className="mt-1 text-lg font-semibold">Source-grounded facts</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={depth}
                    onChange={(event) =>
                      setDepth(event.target.value === "all" ? "all" : Number(event.target.value))
                    }
                    className="rounded-md border border-white/10 bg-[#0b1124] px-2 py-1.5 text-xs text-white"
                  >
                    <option value="all">All depths</option>
                    {[1, 2, 3, 4, 5].map((d) => (
                      <option key={d} value={d}>
                        L{d}
                      </option>
                    ))}
                  </select>
                  <select
                    value={tier}
                    onChange={(event) =>
                      setTier(event.target.value === "all" ? "all" : Number(event.target.value))
                    }
                    className="rounded-md border border-white/10 bg-[#0b1124] px-2 py-1.5 text-xs text-white"
                  >
                    <option value="all">All tiers</option>
                    {[1, 2, 3, 4, 5, 6].map((t) => (
                      <option key={t} value={t}>
                        T{t}
                      </option>
                    ))}
                  </select>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-white/35" />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Filter claims"
                      className="w-44 rounded-md border border-white/10 bg-white/[0.04] py-1.5 pl-7 pr-2 text-xs text-white placeholder:text-white/35"
                    />
                  </div>
                </div>
              </div>
              <div className="divide-y divide-white/5">
                {visibleClaims.map((claim: any) => (
                  <div key={claim.id} className="p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <DepthBadge depth={claim.depth} />
                      {claim.sources?.tier && <TierBadge tier={claim.sources.tier} />}
                      <span className="text-[10px] uppercase tracking-wide text-white/35">
                        {claim.type}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-white/80">{claim.text}</p>
                    {claim.sources?.title && (
                      <a
                        href={claim.sources.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-block text-xs text-teal-300 hover:underline"
                      >
                        {claim.sources.title}
                      </a>
                    )}
                  </div>
                ))}
                {visibleClaims.length === 0 && (
                  <div className="p-8 text-center text-sm text-white/45">
                    No claims match the current filters.
                  </div>
                )}
              </div>
            </section>
          </div>

          <aside className="space-y-6">
            <section className="rounded-md border border-white/10 bg-white/[0.025] p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/45">
                <FileText className="h-4 w-4" />
                Article hub
              </div>
              <div className="mt-3 space-y-3">
                {(selectedBlogs.length ? selectedBlogs : blogs.slice(0, 5)).map((blog) => (
                  <Link
                    key={blog.slug}
                    to="/blog/$slug"
                    params={{ slug: blog.slug }}
                    className="block rounded-md border border-white/10 bg-white/[0.02] p-3 hover:bg-white/[0.05]"
                  >
                    <div className="text-sm font-semibold text-white">{blog.title}</div>
                    <div className="mt-1 line-clamp-3 text-xs leading-relaxed text-white/50">
                      {blog.summary}
                    </div>
                  </Link>
                ))}
              </div>
              <Link
                to="/topics"
                className="mt-4 inline-flex text-xs font-medium text-teal-300 hover:underline"
              >
                Browse all topics
              </Link>
            </section>

            <section className="rounded-md border border-white/10 bg-white/[0.025] p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/45">
                <Bot className="h-4 w-4" />
                Advisor prompts
              </div>
              <div className="mt-3 space-y-2 text-sm">
                {[
                  `Explain ${selected?.name ?? selectedCapability} for an architect.`,
                  `What are the main risks when using ${selected?.name ?? selectedCapability}?`,
                  `Which sources support ${selected?.name ?? selectedCapability} guidance?`,
                ].map((prompt) => (
                  <Link
                    key={prompt}
                    to="/advisor"
                    className="block rounded-md border border-white/10 bg-white/[0.02] p-3 text-white/70 hover:bg-white/[0.05] hover:text-white"
                  >
                    {prompt}
                  </Link>
                ))}
              </div>
            </section>
          </aside>
        </section>
      </main>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center gap-2 text-xs text-white/45">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
      <div className="text-white/45">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}
