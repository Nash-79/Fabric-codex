import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQueries, useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import {
  Bot,
  BookOpen,
  Database,
  FileText,
  Filter,
  GraduationCap,
  Milestone,
  Network,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useMemo } from "react";
import { DepthBadge, TierBadge } from "@/components/Badges";
import { FabricMark } from "@/components/FabricMark";
import { SiteHeader } from "@/components/SiteHeader";
import {
  listCapabilities,
  listClaimCountsByCapability,
  listClaimsByCapability,
  listDiagrams,
  listSources,
  listTopics,
  listContentItems,
} from "@/lib/atlas.functions";
import { accent } from "@/lib/fabric-theme";

const topicsQO = queryOptions({ queryKey: ["home-topics"], queryFn: () => listTopics() });
const sourcesQO = queryOptions({ queryKey: ["home-sources"], queryFn: () => listSources() });
const capabilitiesQO = queryOptions({
  queryKey: ["home-capabilities"],
  queryFn: () => listCapabilities(),
});
const claimCountsQO = queryOptions({
  queryKey: ["home-claim-counts"],
  queryFn: () => listClaimCountsByCapability(),
});
const diagramsQO = queryOptions({
  queryKey: ["home-diagrams"],
  queryFn: () => listDiagrams(),
});
const contentItemsQO = queryOptions({
  queryKey: ["home-content-items"],
  queryFn: () => listContentItems({ data: {} }),
});
const claimsQO = (
  capabilityId: string,
  depth: number | "all" = "all",
  tier: number | "all" = "all",
  q = "",
) =>
  queryOptions({
    queryKey: ["home-claims", capabilityId, depth, tier, q],
    queryFn: () =>
      listClaimsByCapability({
        data: {
          capabilityId,
          limit: 8,
          depth: depth === "all" ? undefined : depth,
          tier: tier === "all" ? undefined : tier,
          q: q.trim() || undefined,
        },
      }),
  });

// Short cards summarizing what each area offers — copy kept in step with
// content/help/01-getting-started.md's "The pages" list, the single source of truth for page
// descriptions; this is the first-time-visitor front door those pages don't otherwise get from
// the header dropdowns alone.
const OFFERINGS = [
  {
    to: "/topics" as const,
    icon: Network,
    label: "Topics",
    description: "The reading portal — a topic tree gathering every article, design, and lesson.",
  },
  {
    to: "/learn" as const,
    icon: GraduationCap,
    label: "Learn",
    description: "Tiered lessons: Beginner, Intermediate, and Expert.",
  },
  {
    to: "/advisor" as const,
    icon: Bot,
    label: "Advisor",
    description: "Ask a question, get an answer grounded only in verified claims.",
  },
  {
    to: "/registry" as const,
    icon: ShieldCheck,
    label: "Capability Registry",
    description: "The spine — every tracked capability with live claim and diagram coverage.",
  },
  {
    to: "/sources" as const,
    icon: Database,
    label: "Sources",
    description: "Every approved source, graded by trust tier, searchable and filterable.",
  },
  {
    to: "/search" as const,
    icon: Search,
    label: "Search",
    description: "One search box across topics, content, claims, and sources.",
  },
  {
    to: "/roadmap" as const,
    icon: Milestone,
    label: "Roadmap",
    description: "What's coming to Microsoft Fabric, tracked against the registry.",
  },
] satisfies Array<{ to: string; icon: any; label: string; description: string }>;

const capabilityDiagramPath: Record<string, string> = {
  capacity: "/diagrams/capacity-throttling.svg",
  "data-factory": "/diagrams/data-factory-pipelines.svg",
  "dataflow-gen2": "/diagrams/dataflow-gen2.svg",
  "direct-lake": "/diagrams/direct-lake-query-path.svg",
  "eventhouse-kql": "/diagrams/eventhouse-kql.svg",
  "fabric-platform": "/diagrams/fabric-platform-overview.svg",
  lakehouse: "/diagrams/lakehouse-architecture.svg",
  mirroring: "/diagrams/mirroring-flow.svg",
  onelake: "/diagrams/onelake-architecture.svg",
  polaris: "/diagrams/polaris-engine.svg",
  "power-bi": "/diagrams/power-bi-consumption.svg",
  purview: "/diagrams/governance-layers.svg",
  rti: "/diagrams/rti-flow.svg",
  "semantic-model": "/diagrams/semantic-model-storage-modes.svg",
  "sql-database": "/diagrams/sql-database-translytical.svg",
  spark: "/diagrams/spark-engineering.svg",
  warehouse: "/diagrams/warehouse-architecture.svg",
};

type HomeSearch = {
  capability?: string;
  depth?: number | "all";
  tier?: number | "all";
  q?: string;
};

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): HomeSearch => ({
    capability: typeof search.capability === "string" ? search.capability : undefined,
    depth:
      search.depth === "all"
        ? "all"
        : typeof search.depth === "number" && [1, 2, 3, 4, 5].includes(search.depth)
          ? search.depth
          : undefined,
    tier:
      search.tier === "all"
        ? "all"
        : typeof search.tier === "number" && [1, 2, 3, 4, 5, 6].includes(search.tier)
          ? search.tier
          : undefined,
    q: typeof search.q === "string" ? search.q.slice(0, 200) : undefined,
  }),
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
      context.queryClient.ensureQueryData(sourcesQO),
      context.queryClient.ensureQueryData(capabilitiesQO),
      context.queryClient.ensureQueryData(claimCountsQO),
      context.queryClient.ensureQueryData(diagramsQO),
      context.queryClient.ensureQueryData(contentItemsQO),
      context.queryClient.ensureQueryData(claimsQO("direct-lake")),
    ]),
  component: Landing,
});

function Landing() {
  const [
    { data: topics },
    { data: sources },
    { data: capabilities },
    { data: claimCounts },
    { data: diagrams },
    { data: contentItems },
  ] = useSuspenseQueries({
    queries: [topicsQO, sourcesQO, capabilitiesQO, claimCountsQO, diagramsQO, contentItemsQO],
  });
  const navigate = useNavigate({ from: "/" });
  const search = Route.useSearch();
  const selectedCapability = search.capability ?? "direct-lake";
  const depth = search.depth ?? "all";
  const tier = search.tier ?? "all";
  const query = search.q ?? "";
  const setSelectedCapability = (capability: string) =>
    navigate({ search: (prev) => ({ ...prev, capability }) });
  const setDepth = (value: number | "all") =>
    navigate({ search: (prev) => ({ ...prev, depth: value }) });
  const setTier = (value: number | "all") =>
    navigate({ search: (prev) => ({ ...prev, tier: value }) });
  const setQuery = (value: string) =>
    navigate({ search: (prev) => ({ ...prev, q: value || undefined }) });
  const { data: claims } = useSuspenseQuery(claimsQO(selectedCapability, depth, tier, query));

  const childTopics = useMemo(() => topics.filter((topic) => topic.parent_slug), [topics]);
  const selected = capabilities.find((capability) => capability.id === selectedCapability);
  const selectedTopic =
    childTopics.find((topic: any) => topic.capability_ids?.includes(selectedCapability)) ??
    childTopics.find((topic) => topic.slug === selectedCapability);
  const feedItems = useMemo(
    () => (contentItems ?? []).filter((item: any) => item.kind !== "lesson"),
    [contentItems],
  );
  const selectedFeed = useMemo(
    () => feedItems.filter((item: any) => item.topic_slug === selectedTopic?.slug),
    [feedItems, selectedTopic],
  );

  const visibleClaims = claims;

  const sourceCount = new Set(
    claims
      .filter((claim) => claim.capability_id === selectedCapability)
      .map((claim: any) => claim.sources?.slug)
      .filter(Boolean),
  ).size;

  const a = accent(selected?.accent);
  const diagramPath =
    (diagrams as any[]).find((diagram) => diagram.capability_id === selectedCapability)?.path ??
    capabilityDiagramPath[selectedCapability] ??
    (diagrams as any[]).find((diagram) => diagram.topic_slug === selectedTopic?.slug)?.path ??
    null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main>
        <section className="border-b border-border bg-card">
          <div className="mx-auto grid max-w-7xl gap-8 px-6 py-10 lg:grid-cols-[360px_minmax(0,1fr)]">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-teal-300/80">
                <FabricMark className="h-4 w-4" />
                Interactive atlas
              </div>
              <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
                Fabric Atlas
              </h1>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                Browse Microsoft Fabric by capability, inspect cited claims, open source-backed
                articles, and jump into Advisor prompts grounded in the same registry.
              </p>
              <div className="mt-6 grid grid-cols-3 gap-2">
                <Metric icon={Network} label="Topics" value={childTopics.length} />
                <Metric
                  icon={BookOpen}
                  label="Articles"
                  value={(contentItems ?? []).filter((i: any) => i.kind === "article").length}
                />
                <Metric icon={Database} label="Sources" value={sources.length} />
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
              <section className="rounded-md border border-border bg-card p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Capability map
                    </div>
                    <h2 className="mt-1 text-lg font-semibold">Explore the registry spine</h2>
                  </div>
                  <Link
                    to="/registry"
                    className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
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
                    const count = claimCounts[capability.id] ?? 0;
                    return (
                      <button
                        key={capability.id}
                        type="button"
                        onClick={() => setSelectedCapability(capability.id)}
                        className={`min-h-24 rounded-md border p-3 text-left transition ${
                          active
                            ? `border-border bg-card ring-2 ${capAccent.ring}`
                            : "border-border bg-card hover:border-border hover:bg-accent"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`h-2 w-2 rounded-full ${capAccent.dot}`}
                            aria-hidden="true"
                          />
                          <span className="text-[10px] text-muted-foreground">{count} claims</span>
                        </div>
                        <div className="mt-2 text-sm font-semibold text-foreground">
                          {capability.name}
                        </div>
                        <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                          {topic?.description ?? capability.description}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              <aside className="rounded-md border border-border bg-card p-4">
                <div className={`inline-flex rounded-full border px-2 py-1 text-xs ${a.chip}`}>
                  <span className={`mr-1.5 mt-1 h-1.5 w-1.5 rounded-full ${a.dot}`} />
                  {selected?.name ?? selectedCapability}
                </div>
                <h2 className="mt-4 text-xl font-semibold tracking-tight">
                  {selectedTopic?.name ?? selected?.name}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {selectedTopic?.description ?? selected?.description}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <Stat label="Claims" value={visibleClaims.length} />
                  <Stat label="Sources" value={sourceCount} />
                </div>
                {diagramPath && (
                  <div className="mt-4 overflow-hidden rounded-md border border-border bg-muted">
                    <img
                      src={diagramPath}
                      alt={`${selected?.name ?? selectedCapability} diagram`}
                      className="aspect-[4/3] w-full object-contain p-3"
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                      }}
                    />
                  </div>
                )}
                <Link
                  to="/advisor"
                  className="mt-4 flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  <Bot className="h-4 w-4" />
                  Ask Advisor
                </Link>
              </aside>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-8">
          <div className="mb-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              What Fabric Atlas offers
            </div>
            <h2 className="mt-1 text-lg font-semibold">Jump straight to what you need</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {OFFERINGS.map((offering) => (
              <Link
                key={offering.to}
                to={offering.to}
                className="group rounded-md border border-border bg-card p-4 transition hover:border-teal-400/40 hover:bg-accent"
              >
                <offering.icon className="h-5 w-5 text-teal-300" />
                <div className="mt-2 text-sm font-semibold text-foreground group-hover:text-teal-200">
                  {offering.label}
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {offering.description}
                </p>
              </Link>
            ))}
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-6 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <section className="rounded-md border border-border bg-card">
              <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                    <Filter className="h-4 w-4" />
                    Claim workbench
                  </div>
                  <h2 className="mt-1 text-lg font-semibold">Source-grounded facts</h2>
                </div>
                <div className="flex w-full flex-wrap gap-2 md:w-auto">
                  <select
                    value={depth}
                    aria-label="Filter by depth level"
                    onChange={(event) =>
                      setDepth(event.target.value === "all" ? "all" : Number(event.target.value))
                    }
                    className="min-h-10 flex-1 rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground md:flex-none"
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
                    aria-label="Filter by trust tier"
                    onChange={(event) =>
                      setTier(event.target.value === "all" ? "all" : Number(event.target.value))
                    }
                    className="min-h-10 flex-1 rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground md:flex-none"
                  >
                    <option value="all">All tiers</option>
                    {[1, 2, 3, 4, 5, 6].map((t) => (
                      <option key={t} value={t}>
                        T{t}
                      </option>
                    ))}
                  </select>
                  <div className="relative w-full md:w-44">
                    <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Filter claims"
                      className="min-h-10 w-full rounded-md border border-border bg-card py-1.5 pl-7 pr-2 text-xs text-foreground placeholder:text-muted-foreground"
                    />
                  </div>
                </div>
              </div>
              <div className="divide-y divide-border">
                {visibleClaims.map((claim: any) => (
                  <div key={claim.id} className="p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <DepthBadge depth={claim.depth} />
                      {claim.sources?.tier && <TierBadge tier={claim.sources.tier} />}
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {claim.type}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {claim.text}
                    </p>
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
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    No claims match the current filters.
                  </div>
                )}
              </div>
            </section>
          </div>

          <aside className="space-y-6">
            <section className="rounded-md border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                <FileText className="h-4 w-4" />
                {selectedFeed.length ? "Article hub" : "Recently published"}
              </div>
              <div className="mt-3 space-y-3">
                {(selectedFeed.length ? selectedFeed : feedItems.slice(0, 5)).map((item: any) => (
                  <Link
                    key={`${item.kind ?? "article"}-${item.slug}`}
                    to="/blogs/$kind/$slug"
                    params={{ kind: (item.kind ?? "article") as string, slug: item.slug }}
                    search={{ from: "home", fromSlug: selectedCapability }}
                    className="block rounded-md border border-border bg-card p-3 hover:bg-accent"
                  >
                    <div className="text-sm font-semibold text-foreground">{item.title}</div>
                    <div className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                      {item.summary}
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

            <section className="rounded-md border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
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
                    search={{ prompt }}
                    className="block rounded-md border border-border bg-card p-3 text-muted-foreground hover:bg-accent hover:text-foreground"
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
    <div className="rounded-md border border-border bg-card p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}
