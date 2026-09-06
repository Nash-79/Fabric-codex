import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQueries, queryOptions } from "@tanstack/react-query";
import {
  ArrowRight,
  Bot,
  BookOpen,
  Clock,
  Database,
  ExternalLink,
  FileCode,
  FileText,
  Layers,
  Milestone,
  Network,
  Sparkles,
} from "lucide-react";
import { useMemo } from "react";
import { FabricMark } from "@/components/FabricMark";
import { SiteHeader } from "@/components/SiteHeader";
import { UpdatesMarquee } from "@/components/UpdatesMarquee";
import { Badge } from "@/components/ui/badge";
import {
  listCapabilities,
  listClaimCountsByCapability,
  listDiagrams,
  listSources,
  listTopics,
  listContentItems,
  listRoadmapItems,
  getContentCounts,
} from "@/lib/atlas.functions";
import { REFERENCE_DOCS } from "@/lib/reference-docs";
import { accent } from "@/lib/fabric-theme";
import { presentationProfileSchema } from "@/lib/content-presentation";

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
  queryKey: ["home-content-items", { limit: 40 }],
  // Home only needs recent items for the feed; exact counts come from contentCountsQO.
  queryFn: () => listContentItems({ data: { limit: 40 } }),
});
const contentCountsQO = queryOptions({
  queryKey: ["home-content-counts"],
  queryFn: () => getContentCounts(),
});
const roadmapQO = queryOptions({
  queryKey: ["home-roadmap"],
  queryFn: () => listRoadmapItems(),
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
    to: "/docs" as const,
    icon: FileCode,
    label: "Reference Docs",
    description: "Authoritative deep dives, engine internals whitepapers, and interactive traces.",
  },
  {
    to: "/advisor" as const,
    icon: Bot,
    label: "Advisor",
    description: "Ask a question, get an answer grounded only in verified claims.",
  },
  {
    to: "/sources" as const,
    icon: Database,
    label: "Sources",
    description: "Every approved source, graded by trust tier, searchable and filterable.",
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
};

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): HomeSearch => ({
    capability: typeof search.capability === "string" ? search.capability : undefined,
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
    // All seven feed useSuspenseQueries below, so keep them awaited in parallel. The real
    // wins are (a) the paginated contentItemsQO (limit: 40) that used to fetch every row,
    // and (b) defaultPreload:"intent" on the router prefetching on hover.
    Promise.all([
      context.queryClient.ensureQueryData(topicsQO),
      context.queryClient.ensureQueryData(sourcesQO),
      context.queryClient.ensureQueryData(capabilitiesQO),
      context.queryClient.ensureQueryData(claimCountsQO),
      context.queryClient.ensureQueryData(diagramsQO),
      context.queryClient.ensureQueryData(contentItemsQO),
      context.queryClient.ensureQueryData(contentCountsQO),
      context.queryClient.ensureQueryData(roadmapQO),
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
    { data: contentCounts },
    { data: roadmap },
  ] = useSuspenseQueries({
    queries: [
      topicsQO,
      sourcesQO,
      capabilitiesQO,
      claimCountsQO,
      diagramsQO,
      contentItemsQO,
      contentCountsQO,
      roadmapQO,
    ],
  });
  const navigate = useNavigate({ from: "/" });
  const search = Route.useSearch();
  const selectedCapability = search.capability ?? "direct-lake";
  const setSelectedCapability = (capability: string) =>
    navigate({ search: { ...search, capability } });

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

  // Featured slot: most-recently-updated content item with a featured diagram set, falling back
  // to the most recent item regardless (contentItems is already ordered updated_at desc).
  const featured = useMemo(() => {
    const withDiagram = feedItems.find((item: any) => {
      const parsed = presentationProfileSchema.safeParse(item.presentation_profile);
      return parsed.success && parsed.data.featured_diagram;
    });
    return withDiagram ?? feedItems[0] ?? null;
  }, [feedItems]);
  const featuredDiagram = useMemo(() => {
    if (!featured) return null;
    const parsed = presentationProfileSchema.safeParse((featured as any).presentation_profile);
    return parsed.success ? (parsed.data.featured_diagram ?? null) : null;
  }, [featured]);

  const a = accent(selected?.accent);
  const diagramPath =
    (diagrams as any[]).find((diagram) => diagram.capability_id === selectedCapability)?.path ??
    capabilityDiagramPath[selectedCapability] ??
    (diagrams as any[]).find((diagram) => diagram.topic_slug === selectedTopic?.slug)?.path ??
    null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <UpdatesMarquee
        articles={(contentItems ?? []).filter((i: any) => i.kind !== "lesson") as any}
        sources={sources as any}
        roadmap={(roadmap ?? []) as any}
      />
      <main>
        <section
          className="border-b border-border bg-card"
          style={{ backgroundImage: "var(--gradient-hero)" }}
        >
          {/* Was `lg:grid-cols-[360px_minmax(0,1fr)]`, which pinned the intro to 360px and left the
              capability map in a column that then nested ANOTHER `[1fr_280px]` split inside it.
              At 1280px that left the 21-capability grid 544px -- ~181px per card at xl:grid-cols-3,
              which is why descriptions arrived as truncated fragments. The hero now spans the full
              width and the map sits below it with room to breathe. */}
          <div className="mx-auto max-w-7xl px-6 py-10">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-teal-700/80 dark:text-teal-300/80">
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
              <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                <MetricLink to="/topics" icon={Network} label="Topics" value={childTopics.length} />
                <MetricLink
                  to="/knowledge"
                  icon={BookOpen}
                  label="Articles"
                  value={contentCounts.articles}
                />
                <MetricLink
                  to="/docs"
                  icon={FileCode}
                  label="Ref Docs"
                  value={REFERENCE_DOCS.length}
                />
                <MetricLink to="/sources" icon={Database} label="Sources" value={sources.length} />
                <MetricLink
                  to="/roadmap"
                  icon={Milestone}
                  label="Roadmap"
                  value={(roadmap ?? []).length}
                />
              </div>
            </div>

            <div className="mt-10 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
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
                {/* Column counts now reflect the space actually available (~900px at 1280,
                    full width below lg) rather than the 544px the old nesting left. */}
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
                  <Stat label="Claims" value={claimCounts[selectedCapability] ?? 0} />
                  <Stat label="Content items" value={selectedFeed.length} />
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
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            {OFFERINGS.map((offering) => (
              <Link
                key={offering.to}
                to={offering.to}
                className="group rounded-md border border-border bg-card p-4 transition hover:border-teal-400/40 hover:bg-accent"
              >
                <offering.icon className="h-5 w-5 text-teal-600 dark:text-teal-300" />
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

        {/* First-Party Deep Dives & Reference Docs Showcase */}
        <section className="mx-auto max-w-7xl px-6 py-8 border-t border-border/60">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-teal-600 dark:text-teal-400">
                <Sparkles className="h-4 w-4" />
                First-Party Deep Dives &amp; Engine Internals
              </div>
              <h2 className="mt-1 text-2xl font-bold tracking-tight">
                Reference Documentation &amp; Whitepapers
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Self-contained, production-grade technical whitepapers covering Apache Spark
                execution internals, Remote Shuffle Manager, Runtime 2.0, and Polaris.
              </p>
            </div>
            <Link
              to="/docs"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3.5 py-2 text-xs font-medium text-foreground hover:bg-accent shrink-0 transition"
            >
              <span>View all {REFERENCE_DOCS.length} reference docs</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {REFERENCE_DOCS.slice(0, 3).map((doc) => (
              <div
                key={doc.slug}
                className="group flex flex-col justify-between rounded-xl border border-border/80 bg-card p-5 shadow-sm transition hover:border-primary/50 hover:shadow-md"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {doc.isInteractive && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-teal-500/10 px-2 py-0.5 text-[10px] font-semibold text-teal-600 dark:text-teal-400 border border-teal-500/20">
                          <Sparkles className="h-3 w-3" />
                          Interactive
                        </span>
                      )}
                      {doc.capabilities.slice(0, 2).map((c) => (
                        <Badge key={c} variant="secondary" className="text-[11px] capitalize">
                          {c.replace("-", " ")}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                      <Clock className="h-3.5 w-3.5" />
                      <span>~{doc.readingTimeMinutes} min</span>
                    </div>
                  </div>

                  <h3 className="mt-3 text-lg font-semibold tracking-tight text-card-foreground group-hover:text-primary transition-colors">
                    {doc.title}
                  </h3>
                  <p className="mt-1 text-xs font-medium text-muted-foreground line-clamp-1">
                    {doc.subtitle}
                  </p>
                  <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground line-clamp-2">
                    {doc.summary}
                  </p>

                  <div className="mt-3 border-t border-border/40 pt-2.5">
                    <ul className="space-y-1 text-xs text-foreground/80">
                      {doc.highlightPoints.slice(0, 2).map((pt, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-[11px]">
                          <span className="text-teal-500 font-bold">•</span>
                          <span className="line-clamp-1">{pt}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Layers className="h-3.5 w-3.5 text-teal-500" />
                      {doc.svgCount} SVGs
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={doc.staticPath}
                      target="_blank"
                      rel="noreferrer"
                      title="Open raw document in new window"
                      className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    <Link
                      to="/docs/$slug"
                      params={{ slug: doc.slug }}
                      className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
                    >
                      <span>Read Doc</span>
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-6 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            {featured && (
              <Link
                to="/blogs/$kind/$slug"
                params={{ kind: (featured as any).kind ?? "article", slug: (featured as any).slug }}
                search={{ from: "home" }}
                className="block rounded-md border border-border bg-card p-6 transition hover:border-teal-500/40"
              >
                <div className="text-[10px] font-semibold uppercase tracking-wider text-teal-600 dark:text-teal-300">
                  Featured
                </div>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                  {(featured as any).title}
                </h2>
                {(featured as any).summary && (
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {(featured as any).summary}
                  </p>
                )}
                {featuredDiagram && (
                  <img
                    src={`/diagrams/${featuredDiagram}.svg`}
                    alt=""
                    aria-hidden="true"
                    className="mt-4 h-48 w-full rounded-md border border-border object-contain bg-muted p-2"
                  />
                )}
              </Link>
            )}
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
                className="mt-4 inline-flex text-xs font-medium text-teal-600 dark:text-teal-300 hover:underline"
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

function MetricLink({
  to,
  icon: Icon,
  label,
  value,
}: {
  to: string;
  icon: any;
  label: string;
  value: number;
}) {
  return (
    <Link
      to={to as any}
      aria-label={`${value} ${label} — view all`}
      className="card-interactive group block rounded-md border border-border bg-card p-3"
    >
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <Icon className="h-4 w-4" />
          {label}
        </span>
        <ArrowRight className="h-3.5 w-3.5 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
      </div>
      {/* Thousands separators: claims is already 3,052 and climbing, and an unformatted "3052"
          reads as a version string at a glance. */}
      <div className="mt-2 text-2xl font-semibold text-foreground">{value.toLocaleString()}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wider text-teal-700/70 dark:text-teal-300/70">
        View all
      </div>
    </Link>
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
