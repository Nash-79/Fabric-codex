import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import {
  BookOpen,
  Clock,
  Layers,
  ExternalLink,
  ArrowRight,
  Sparkles,
  FileText,
  Search,
} from "lucide-react";
import { REFERENCE_DOCS } from "@/lib/reference-docs";
import { SiteHeader } from "@/components/SiteHeader";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/docs/")({
  head: () => ({
    meta: [
      { title: "Reference Docs — Fabric Codex" },
      {
        name: "description",
        content:
          "Authoritative, self-contained Microsoft Fabric practitioner deep-dive whitepapers and engine internals reference docs.",
      },
    ],
  }),
  component: ReferenceDocsHubPage,
});

function ReferenceDocsHubPage() {
  const [q, setQ] = useState("");
  const [selectedCap, setSelectedCap] = useState<string | null>(null);

  const capabilities = useMemo(() => {
    const caps = new Set<string>();
    REFERENCE_DOCS.forEach((d) => d.capabilities.forEach((c) => caps.add(c)));
    return Array.from(caps).sort();
  }, []);

  const filteredDocs = useMemo(() => {
    const term = q.trim().toLowerCase();
    return REFERENCE_DOCS.filter((doc) => {
      if (selectedCap && !doc.capabilities.includes(selectedCap)) return false;
      if (!term) return true;
      return (
        doc.title.toLowerCase().includes(term) ||
        doc.subtitle.toLowerCase().includes(term) ||
        doc.summary.toLowerCase().includes(term) ||
        doc.highlightPoints.some((h) => h.toLowerCase().includes(term))
      );
    });
  }, [q, selectedCap]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Hero Header */}
        <div className="border-b border-border/60 pb-8">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-teal-600 dark:text-teal-400">
            <Sparkles className="h-4 w-4" />
            First-Party Deep Dives &amp; Engine Internals
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Reference Documentation &amp; Whitepapers
          </h1>
          <p className="mt-3 max-w-3xl text-base text-muted-foreground">
            Self-contained, production-grade technical whitepapers covering Apache Spark execution
            internals, Remote Shuffle Manager lifecycles, Runtime 2.0 migration recipes, and Polaris
            distributed SQL architecture.
          </p>

          {/* Search and Filters */}
          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search deep dive topics, engines, keywords..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-9 bg-card border-border"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedCap(null)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  selectedCap === null
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted"
                }`}
              >
                All Capabilities
              </button>
              {capabilities.map((cap) => (
                <button
                  key={cap}
                  type="button"
                  onClick={() => setSelectedCap(selectedCap === cap ? null : cap)}
                  className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
                    selectedCap === cap
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {cap.replace("-", " ")}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Document Grid */}
        <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredDocs.map((doc) => (
            <div
              key={doc.slug}
              className="group flex flex-col justify-between rounded-xl border border-border/80 bg-card p-6 shadow-sm transition-all hover:border-primary/50 hover:shadow-md"
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
                    {doc.capabilities.map((c) => (
                      <Badge key={c} variant="secondary" className="text-[11px] capitalize">
                        {c.replace("-", " ")}
                      </Badge>
                    ))}
                    {doc.version && doc.version > 1 && (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        v{doc.version}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                    <Clock className="h-3.5 w-3.5" />
                    <span>~{doc.readingTimeMinutes} min</span>
                  </div>
                </div>

                <h2 className="mt-4 text-xl font-semibold tracking-tight text-card-foreground group-hover:text-primary transition-colors">
                  {doc.title}
                </h2>
                <p className="mt-1 text-xs font-medium text-muted-foreground line-clamp-1">
                  {doc.subtitle}
                </p>
                <p className="mt-3 text-sm text-muted-foreground line-clamp-3">{doc.summary}</p>

                {/* Key Highlights */}
                <div className="mt-4 border-t border-border/40 pt-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                    Core Insights
                  </span>
                  <ul className="mt-2 space-y-1 text-xs text-foreground/80">
                    {doc.highlightPoints.slice(0, 3).map((pt, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-teal-500 font-bold">•</span>
                        <span className="line-clamp-1">{pt}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-border/60 pt-4">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1" title="Hand-authored SVGs">
                    <Layers className="h-3.5 w-3.5 text-teal-500" />
                    {doc.svgCount} SVGs
                  </span>
                  <span className="flex items-center gap-1" title="Subsections">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    {doc.sectionsCount} Sec
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={doc.staticPath}
                    target="_blank"
                    rel="noreferrer"
                    title="Open raw document in new window"
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                  <Link
                    to="/docs/$slug"
                    params={{ slug: doc.slug }}
                    className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
                  >
                    <span>Read In Atlas</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredDocs.length === 0 && (
          <div className="mt-12 rounded-xl border border-dashed border-border p-12 text-center">
            <BookOpen className="mx-auto h-10 w-10 text-muted-foreground/60" />
            <p className="mt-4 text-base font-semibold">No reference docs match your search</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try searching with broader keywords or resetting the capability filters.
            </p>
            <button
              type="button"
              onClick={() => {
                setQ("");
                setSelectedCap(null);
              }}
              className="mt-4 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              Reset Filters
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
