import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  BookOpen,
  Database,
  FileText,
  Flag,
  Gauge,
  Image as ImageIcon,
  Lightbulb,
  ListChecks,
  Milestone,
  RefreshCw,
  Radar,
  ShieldCheck,
  Upload,
  UserCog,
  Workflow,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getCmsData, getSettingsOverview } from "@/lib/settings.functions";
import { Shell } from "@/components/settings/shared";
import { UsersPanel } from "@/components/settings/UsersPanel";
import { ContentPanel } from "@/components/settings/ContentPanel";
import { ClaimsPanel } from "@/components/settings/ClaimsPanel";
import { BlogsPanel } from "@/components/settings/BlogsPanel";
import { QueuePanel } from "@/components/settings/QueuePanel";
import { PublishPanel } from "@/components/settings/PublishPanel";
import { DiagramsPanel } from "@/components/settings/DiagramsPanel";
import { PipelineOverviewPanel } from "@/components/settings/PipelineOverviewPanel";
import { WatchersPanel } from "@/components/settings/WatchersPanel";
import { RoadmapPanel } from "@/components/settings/RoadmapPanel";
import { LogsPanel } from "@/components/settings/LogsPanel";
import { SystemPanel } from "@/components/settings/SystemPanel";
import { MigrationStatusPanel } from "@/components/settings/MigrationStatusPanel";
import { FeedbackPanel } from "@/components/settings/FeedbackPanel";
import { ArticleIdeasPanel } from "@/components/settings/ArticleIdeasPanel";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Fabric Atlas" }] }),
  component: SettingsPage,
});

// Eleven flat tabs were hard to scan — same panels, now grouped by what they manage:
// People, the knowledge base, published content, the ingest→publish pipeline, and system.
const navGroups = [
  { label: "People", items: [{ id: "users", label: "Users", icon: UserCog }] },
  {
    label: "Knowledge",
    items: [
      { id: "content", label: "Content", icon: Database },
      { id: "claims", label: "Claims", icon: ListChecks },
    ],
  },
  {
    label: "Published",
    items: [
      { id: "blogs", label: "Articles", icon: BookOpen },
      { id: "diagrams", label: "Diagrams", icon: ImageIcon },
      { id: "feedback", label: "Feedback", icon: Flag },
    ],
  },
  {
    label: "Pipeline",
    items: [
      { id: "pipeline", label: "Overview", icon: Workflow },
      { id: "ideas", label: "Article Ideas", icon: Lightbulb },
      { id: "rss", label: "Watchers", icon: Radar },
      { id: "queue", label: "Queue", icon: FileText },
      { id: "publish", label: "Publish", icon: Upload },
      { id: "roadmap", label: "Roadmap", icon: Milestone },
    ],
  },
  {
    label: "System",
    items: [
      { id: "logs", label: "Logs", icon: Activity },
      { id: "system", label: "System", icon: Gauge },
      { id: "migrations", label: "Migrations", icon: ShieldCheck },
    ],
  },
] as const;

function SettingsPage() {
  const overviewFn = useServerFn(getSettingsOverview);
  const cmsFn = useServerFn(getCmsData);
  const queryClient = useQueryClient();
  // Controlled so the Pipeline overview's stage tiles can jump straight to their tab.
  const [tab, setTab] = useState("users");
  const overview = useQuery({
    queryKey: ["settings-overview"],
    queryFn: () => overviewFn(),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const cms = useQuery({
    queryKey: ["settings-cms"],
    queryFn: () => cmsFn(),
    enabled: !!overview.data,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["settings-overview"] });
    queryClient.invalidateQueries({ queryKey: ["settings-cms"] });
  };

  if (overview.error) {
    return (
      <Shell>
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          {(overview.error as Error).message === "Forbidden"
            ? "You do not have admin access."
            : (overview.error as Error).message}
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-teal-300/80">
            Administration
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Settings</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
            {/* Stable, meaningful headline metrics — not "whichever four keys came first". */}
            {(
              [
                ["sources", "Sources"],
                ["claims", "Claims"],
                ["articles", "Articles"],
                ["queue_items", "Queue"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="rounded-md border border-border bg-card px-3 py-2">
                <div className="text-muted-foreground">{label}</div>
                <div className="text-lg font-semibold">
                  {(overview.data?.stats as Record<string, number> | undefined)?.[key] ?? "—"}
                </div>
              </div>
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-9 border-border bg-card text-foreground"
            onClick={refresh}
            disabled={overview.isFetching}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${overview.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={setTab}
        className="mt-7 grid gap-5 md:grid-cols-[180px_minmax(0,1fr)]"
      >
        <TabsList className="flex h-auto flex-row justify-start gap-1 overflow-x-auto rounded-md border border-border bg-card p-1 md:flex-col md:items-stretch md:overflow-visible">
          {navGroups.map((group) => (
            <div key={group.label} className="flex flex-row gap-1 md:flex-col md:items-stretch">
              <div className="hidden px-2 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground md:block">
                {group.label}
              </div>
              {group.items.map((item) => (
                <TabsTrigger
                  key={item.id}
                  value={item.id}
                  className="justify-start gap-2 text-muted-foreground data-[state=active]:bg-accent data-[state=active]:text-foreground"
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </TabsTrigger>
              ))}
            </div>
          ))}
        </TabsList>

        <div className="min-w-0">
          <TabsContent value="users" className="mt-0">
            <UsersPanel data={overview.data} onDone={refresh} loading={overview.isLoading} />
          </TabsContent>
          <TabsContent value="content" className="mt-0">
            <ContentPanel data={cms.data} onDone={refresh} loading={cms.isLoading} />
          </TabsContent>
          <TabsContent value="claims" className="mt-0">
            <ClaimsPanel data={cms.data} onDone={refresh} loading={cms.isLoading} />
          </TabsContent>
          <TabsContent value="blogs" className="mt-0">
            <BlogsPanel data={cms.data} onDone={refresh} loading={cms.isLoading} />
          </TabsContent>
          <TabsContent value="queue" className="mt-0">
            <QueuePanel data={cms.data} onDone={refresh} loading={cms.isLoading} />
          </TabsContent>
          <TabsContent value="publish" className="mt-0">
            <PublishPanel onDone={refresh} />
          </TabsContent>
          <TabsContent value="diagrams" className="mt-0">
            <DiagramsPanel />
          </TabsContent>
          <TabsContent value="feedback" className="mt-0">
            <FeedbackPanel />
          </TabsContent>
          <TabsContent value="pipeline" className="mt-0">
            <PipelineOverviewPanel data={cms.data} loading={cms.isLoading} onNavigate={setTab} />
          </TabsContent>
          <TabsContent value="ideas" className="mt-0">
            <ArticleIdeasPanel data={cms.data} onDone={refresh} loading={cms.isLoading} />
          </TabsContent>
          <TabsContent value="rss" className="mt-0">
            <WatchersPanel />
          </TabsContent>
          <TabsContent value="roadmap" className="mt-0">
            <RoadmapPanel />
          </TabsContent>
          <TabsContent value="logs" className="mt-0">
            <LogsPanel
              audit={overview.data?.audit ?? cms.data?.audit ?? []}
              claimLog={overview.data?.claimLog ?? []}
              loading={overview.isLoading}
              updatedAt={overview.dataUpdatedAt}
            />
          </TabsContent>
          <TabsContent value="system" className="mt-0">
            <SystemPanel
              stats={overview.data?.stats ?? {}}
              loading={overview.isLoading}
              onDone={refresh}
            />
          </TabsContent>
          <TabsContent value="migrations" className="mt-0">
            <MigrationStatusPanel />
          </TabsContent>
        </div>
      </Tabs>
    </Shell>
  );
}
