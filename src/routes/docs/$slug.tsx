import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowLeft,
  ExternalLink,
  Maximize2,
  Minimize2,
  Clock,
  Layers,
  BookOpen,
} from "lucide-react";
import { getReferenceDocBySlug } from "@/lib/reference-docs";
import { SiteHeader } from "@/components/SiteHeader";

export const Route = createFileRoute("/docs/$slug")({
  head: ({ params }) => {
    const doc = getReferenceDocBySlug(params.slug);
    return {
      meta: [
        {
          title: doc
            ? `${doc.title} — Reference Docs — Fabric Atlas`
            : "Reference Docs — Fabric Atlas",
        },
        {
          name: "description",
          content: doc?.summary ?? "Fabric Atlas Technical Reference Document",
        },
      ],
    };
  },
  component: ReferenceDocReaderPage,
});

function ReferenceDocReaderPage() {
  const { slug } = Route.useParams();
  const doc = getReferenceDocBySlug(slug);
  if (!doc) throw notFound();
  const [fullscreen, setFullscreen] = useState(false);

  return (
    <div
      className={`min-h-screen bg-background text-foreground flex flex-col ${
        fullscreen ? "fixed inset-0 z-50 overflow-hidden" : ""
      }`}
    >
      {!fullscreen && <SiteHeader />}

      {/* Reader Toolbar */}
      <header className="border-b border-border/80 bg-card/70 backdrop-blur-md px-4 py-2.5 sm:px-6 sticky top-0 z-20">
        <div className="mx-auto max-w-7xl flex flex-wrap items-center justify-between gap-3">
          {/* Breadcrumb & Title */}
          <div className="flex items-center gap-3 min-w-0">
            <Link
              to="/docs"
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>All Docs</span>
            </Link>
            <div className="h-4 w-px bg-border/80" />
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-foreground truncate flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-teal-500 shrink-0" />
                <span className="truncate">{doc.title}</span>
              </h1>
            </div>
          </div>

          {/* Actions & Meta */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden sm:flex items-center gap-2 mr-2">
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />~{doc.readingTimeMinutes} min
              </span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Layers className="h-3.5 w-3.5 text-teal-500" />
                {doc.svgCount} SVGs
              </span>
            </div>

            <a
              href={doc.staticPath}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="Open raw document directly in new tab"
            >
              <span>Full Page</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>

            <button
              type="button"
              onClick={() => setFullscreen(!fullscreen)}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title={fullscreen ? "Exit Fullscreen" : "Fullscreen Reader"}
            >
              {fullscreen ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">{fullscreen ? "Exit" : "Expand"}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Document Frame */}
      <main className="flex-1 w-full bg-slate-950">
        <iframe
          src={doc.staticPath}
          title={doc.title}
          className="w-full h-full min-h-[calc(100vh-7rem)] border-0"
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-downloads"
        />
      </main>
    </div>
  );
}
