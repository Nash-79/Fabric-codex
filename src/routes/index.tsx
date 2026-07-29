import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQueries, queryOptions } from "@tanstack/react-query";
import { ArrowRight, Bot, BookOpen, Database, FileText, Milestone, Network } from "lucide-react";
import { useMemo } from "react";
import { FabricMark } from "@/components/FabricMark";
import { SiteHeader } from "@/components/SiteHeader";
import { UpdatesMarquee } from "@/components/UpdatesMarquee";
import {
  listCapabilities,
  listClaimCountsByCapability,
  listDiagrams,
  listSources,
  listTopics,
  listContentItems,
  listRoadmapItems,
} from "@/lib/atlas.functions";
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
  queryKey: ["home-content-items"],
  queryFn: () => listContentItems({ data: {} }),
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
    Promise.all([
      context.queryClient.ensureQueryData(topicsQO),
      context.queryClient.ensureQueryData(sourcesQO),
      context.queryClient.ensureQueryData(capabilitiesQO),
      context.queryClient.ensureQueryData(claimCountsQO),
      context.queryClient.ensureQueryData(diagramsQO),
      context.queryClient.ensureQueryData(contentItemsQO),
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
    { data: roadmap },
  ] = useSuspenseQueries({
    queries: [topicsQO, sourcesQO, capabilitiesQO, claimCountsQO, diagramsQO, contentItemsQO, roadmapQO],
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
