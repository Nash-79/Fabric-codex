import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { amIAdmin } from "@/lib/atlas.functions";
import { getCmsData, getSettingsOverview, getDiagramCoverage } from "@/lib/settings.functions";
import { SiteHeader } from "@/components/SiteHeader";
import { Badge } from "@/components/ui/badge";
import { Activity, Database, FileText, ImageIcon, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/author")({
  head: () => ({
    meta: [
      { title: "Author — Fabric Atlas" },
      {
        name: "description",
        content:
          "How authoring works in the Fabric Atlas: local agents extract cited claims and publish to the atlas.",
      },
      { property: "og:title", content: "Author — Fabric Atlas" },
      {
        property: "og:description",
        content: "Local-first, git-tracked, cited authoring workflow for the Fabric Atlas.",
      },
    ],
  }),
  component: AuthorPage,
});

function AuthorPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loadingAdmin, setLoadingAdmin] = useState(true);
  const [activeTab, setActiveTab] = useState<"dashboard" | "guide">("dashboard");

  useEffect(() => {
    async function checkAdmin() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          setIsAdmin(false);
          setLoadingAdmin(false);
          return;
        }
        const res = await amIAdmin();
        setIsAdmin(!!res?.admin);
      } catch {
        setIsAdmin(false);
      } finally {
        setLoadingAdmin(false);
      }
    }
    checkAdmin();
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, session) => {
      if (!session) {
        setIsAdmin(false);
        setLoadingAdmin(false);
      } else {
        try {
          const res = await amIAdmin();
          setIsAdmin(!!res?.admin);
        } catch {
          setIsAdmin(false);
        } finally {
          setLoadingAdmin(false);
        }
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const overviewFn = useServerFn(getSettingsOverview);
  const cmsFn = useServerFn(getCmsData);
  const diagFn = useServerFn(getDiagramCoverage);

  const overview = useQuery({
    queryKey: ["author-overview"],
    queryFn: () => overviewFn(),
    enabled: isAdmin,
    refetchInterval: 30_000,
  });

  const cms = useQuery({
    queryKey: ["author-cms"],
    queryFn: () => cmsFn(),
    enabled: isAdmin,
  });

  const diag = useQuery({
    queryKey: ["author-diag"],
    queryFn: () => diagFn(),
    enabled: isAdmin,
  });

  const showDashboard = isAdmin && !loadingAdmin;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-teal-300/80">
              Workflow &amp; Status
            </div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Authoring the atlas</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Authoring is <strong>local-first</strong>. LLM work runs in the IDE on your
              subscription via Claude Code / Codex agents — not on the server.
            </p>
          </div>

          {showDashboard && (
            <div className="flex gap-1 rounded-md border border-border bg-card p-1 shrink-0 self-start md:self-end">
              <button
                type="button"
                onClick={() => setActiveTab("dashboard")}
                className={`rounded px-3 py-1.5 text-xs font-medium transition ${
                  activeTab === "dashboard"
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Dashboard
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("guide")}
                className={`rounded px-3 py-1.5 text-xs font-medium transition ${
                  activeTab === "guide"
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Workflow Guide
              </button>
            </div>
          )}
        </div>

        <div className="mt-8">
          {showDashboard && activeTab === "dashboard" ? (
            <Dashboard overview={overview} cms={cms} diag={diag} />
          ) : (
            <WorkflowGuide />
          )}
        </div>
      </main>
    </div>
  );
}

function Dashboard({ overview, cms, diag }: { overview: any; cms: any; diag: any }) {
  const loading = overview.isLoading || cms.isLoading || diag.isLoading;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-border bg-card">
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Loading workspace metrics...
        </div>
      </div>
    );
  }

  const queueItems = cms.data?.queue ?? [];
  const pendingQueue = queueItems.filter(
    (q: any) => q.status === "queued" || q.status === "claimed",
  );
  const claims = cms.data?.claims ?? [];
  const pendingClaims = claims.filter((c: any) => c.status === "pending");
  const coverage = diag.data?.coverage ?? [];
  const diagramGaps = coverage.filter((r: any) => !r.has_diagram);
  const audit = overview.data?.audit ?? [];

  return (
    <div className="space-y-6">
      {/* KPI Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={FileText}
          label="Ingestion Queue"
          value={`${pendingQueue.length} pending`}
          subtext={`${queueItems.length} total items`}
        />
        <KpiCard
          icon={Database}
          label="Claims Pending"
          value={`${pendingClaims.length} claims`}
          subtext={`${claims.length} total claims`}
        />
        <KpiCard
          icon={ImageIcon}
          label="Diagram Gaps"
          value={`${diagramGaps.length} topics`}
          subtext={`${coverage.length - diagramGaps.length}/${coverage.length} topics covered`}
        />
        <KpiCard
          icon={Activity}
          label="Workspace Health"
          value="Healthy"
          subtext="Validation rules active"
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Ingestion Queue Section */}
        <section className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h3 className="text-sm font-semibold text-foreground">Ingestion Queue</h3>
            <Link to="/settings" className="text-xs text-teal-300 hover:underline">
              Manage Queue →
            </Link>
          </div>
          <div className="mt-3 space-y-2">
            {pendingQueue.slice(0, 5).map((q: any) => (
              <div
                key={q.id}
                className="flex flex-col gap-1 rounded border border-border/60 bg-muted/20 p-2 text-xs"
              >
                <a
                  href={q.url}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate font-medium text-teal-200 hover:underline"
                >
                  {q.title || q.url}
                </a>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Tier T{q.tier}</span>
                  <Badge
                    variant="outline"
                    className="h-4 border-amber-500/30 bg-amber-500/10 px-1 py-0 text-[9px] text-amber-200"
                  >
                    {q.status}
                  </Badge>
                </div>
              </div>
            ))}
            {pendingQueue.length === 0 && (
              <div className="py-6 text-center text-xs text-muted-foreground">
                No pending ingestion items.
              </div>
            )}
          </div>
        </section>

        {/* Diagram Gaps Section */}
        <section className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h3 className="text-sm font-semibold text-foreground">Diagram Gaps</h3>
            <Link to="/settings" className="text-xs text-teal-300 hover:underline">
              Commission Diagrams →
            </Link>
          </div>
          <div className="mt-3 space-y-2">
            {diagramGaps.slice(0, 5).map((g: any) => (
              <div
                key={g.slug}
                className="flex items-center justify-between rounded border border-border/60 bg-muted/20 p-2 text-xs"
              >
                <span className="font-medium text-foreground truncate">{g.name}</span>
                <span className="text-[10px] text-muted-foreground">{g.slug}</span>
              </div>
            ))}
            {diagramGaps.length === 0 && (
              <div className="py-6 text-center text-xs text-muted-foreground">
                All topics have diagram coverage.
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Recent Activity Logs */}
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h3 className="text-sm font-semibold text-foreground">Recent Audit Events</h3>
          <Link to="/settings" className="text-xs text-teal-300 hover:underline">
            All Logs →
          </Link>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs text-muted-foreground">
            <thead>
              <tr className="border-b border-border/60 pb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="py-2 font-medium">Actor</th>
                <th className="py-2 font-medium">Action</th>
                <th className="py-2 font-medium">Target</th>
                <th className="py-2 font-medium text-right">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {audit.slice(0, 5).map((e: any) => (
                <tr key={e.id} className="hover:bg-accent/40">
                  <td className="py-2.5 font-medium text-foreground max-w-44 truncate">
                    {e.actor_email || "System"}
                  </td>
                  <td className="py-2.5">{e.action}</td>
                  <td className="py-2.5 max-w-44 truncate">
                    {e.target_type} ({e.target_id})
                  </td>
                  <td className="py-2.5 text-right">{new Date(e.created_at).toLocaleString()}</td>
                </tr>
              ))}
              {audit.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-xs text-muted-foreground">
                    No recent audit events.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  subtext,
}: {
  icon: any;
  label: string;
  value: string;
  subtext: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
        <Icon className="h-4 w-4 text-teal-300/85" />
      </div>
      <div className="mt-2 text-xl font-semibold text-foreground">{value}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{subtext}</div>
    </div>
  );
}

function WorkflowGuide() {
  return (
    <section className="space-y-4 text-sm leading-relaxed text-muted-foreground">
      <h2 className="text-lg font-semibold text-foreground">Flow</h2>
      <ol className="list-decimal space-y-2 pl-5">
        <li>
          An agent reads an approved source and writes{" "}
          <code className="text-teal-300 font-mono">content/sources/&lt;slug&gt;.json</code> with
          atomic, cited claims.
        </li>
        <li>
          The diagram-author writes original Mermaid/SVG to{" "}
          <code className="text-teal-300 font-mono">content/diagrams/</code>. Source images are
          referenced, never re-hosted.
        </li>
        <li>
          The solution-architect writes{" "}
          <code className="text-teal-300 font-mono">content/designs/&lt;slug&gt;.md</code> from
          verified claims only.
        </li>
        <li>
          Commit the files. Publish with{" "}
          <code className="text-teal-300 font-mono">python scripts/import_content.py</code>.
        </li>
        <li>
          The server runs deterministic validation: citation, freshness, versioning, diagram
          coverage.
        </li>
        <li>
          After UI or workflow changes, refresh Help with Claude{" "}
          <code className="text-teal-300 font-mono">/docs-sync</code> or Codex{" "}
          <code className="text-teal-300 font-mono">/prompts:fa-docs-sync</code>.
        </li>
      </ol>

      <h2 className="mt-6 text-lg font-semibold text-foreground">Domain rules</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Every factual claim cites a source. No source, no claim.</li>
        <li>
          Claims are append-only and versioned (
          <code className="text-teal-300 font-mono">supersedes_id</code>).
        </li>
        <li>
          Trust tiers, best→worst: T1 Microsoft Learn · T2 Fabric blog · T3 MS GitHub samples · T4
          MVP · T5 vendor · T6 unknown.
        </li>
        <li>
          Depth levels: L1 conceptual · L2 practitioner · L3 architect · L4 performance · L5
          internals.
        </li>
        <li>
          Label inference vs verified fact. Never invent product limits, quotas, or roadmap claims.
        </li>
        <li>Paraphrase fully; quotes &lt; 15 words, attributed.</li>
      </ul>

      <h2 className="mt-6 text-lg font-semibold text-foreground">Submit a source</h2>
      <p>
        Admins queue a source URL from{" "}
        <a href="/settings" className="text-teal-300 hover:underline">
          Settings → Queue
        </a>
        . Submissions land in the curator's queue (<code>kind=source</code>) and are extracted into
        cited claims by <code>/ingest-batch</code> before anything enters the atlas.
      </p>

      <h2 className="mt-6 text-lg font-semibold text-foreground">Admin and docs upkeep</h2>
      <p>
        Admins use{" "}
        <a href="/settings" className="text-teal-300 hover:underline">
          Settings
        </a>{" "}
        to manage users, queue items, content metadata, claim moderation, blog versions, and audit
        logs. The Help section is generated from the current code and prompt files; keep it current
        with the documentation generator whenever those workflows change.
      </p>
    </section>
  );
}
