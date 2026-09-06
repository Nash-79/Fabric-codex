import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { listHelp } from "@/lib/atlas.functions";
import { SiteHeader } from "@/components/SiteHeader";
import { BookOpen, ChevronRight } from "lucide-react";
import { slugifyHeading, textFromNode } from "@/lib/heading-utils";

const helpQO = queryOptions({ queryKey: ["help"], queryFn: () => listHelp() });

export const Route = createFileRoute("/help")({
  head: () => ({ meta: [{ title: "Help & Guidebooks — Fabric Codex" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(helpQO),
  errorComponent: ({ error, reset }) => (
    <div className="min-h-screen bg-background p-10 text-foreground">
      <SiteHeader />
      <p className="mt-6 text-rose-600 dark:text-rose-300">{error.message}</p>
      <button className="mt-3 underline" onClick={reset}>
        Retry
      </button>
    </div>
  ),
  notFoundComponent: () => <div className="p-10 text-foreground">Not found.</div>,
  component: HelpPage,
});

function HelpPage() {
  const { data: docs } = useSuspenseQuery(helpQO);
  const [activeSlug, setActiveSlug] = useState<string>("");

  useEffect(() => {
    if (!docs.length) return;
    const initialSlug = window.location.hash.replace(/^#/, "") || docs[0]?.slug;
    if (initialSlug) setActiveSlug(initialSlug);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSlug(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: "-80px 0px -60% 0px" },
    );

    for (const doc of docs) {
      const el = document.getElementById(doc.slug);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [docs]);

  const scrollToDoc = (slug: string) => {
    setActiveSlug(slug);
    const el = document.getElementById(slug);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState(null, "", `#${slug}`);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8">
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-teal-700/80 dark:text-teal-300/80">
            Guidebooks
          </div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight md:text-4xl">Platform Help</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Architecture, workflows, curation protocols, and operational guides for Fabric Codex.
          </p>
        </div>

        {/* Mobile quick-jump navigation */}
        {docs.length > 0 && (
          <div className="mb-8 lg:hidden">
            <label htmlFor="help-nav-select" className="text-xs font-medium text-muted-foreground">
              Jump to guidebook:
            </label>
            <select
              id="help-nav-select"
              value={activeSlug}
              onChange={(e) => scrollToDoc(e.target.value)}
              className="mt-1.5 block w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-teal-500 focus:outline-none"
            >
              {docs.map((d) => (
                <option key={d.slug} value={d.slug}>
                  {d.title}
                </option>
              ))}
            </select>
          </div>
        )}

        {docs.length === 0 && (
          <p className="mt-6 text-sm text-muted-foreground">
            Help content has not been bootstrapped yet.
          </p>
        )}
        <div className="flex gap-12">
          {/* Desktop sidebar navigation */}
          {docs.length > 0 && (
            <aside className="hidden lg:block w-72 shrink-0">
              <div className="sticky top-20 rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-2 px-2 pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border">
                  <BookOpen className="h-4 w-4 text-teal-500" />
                  Documentation
                </div>
                <nav className="mt-3 space-y-1" aria-label="Help guide navigation">
                  {docs.map((d) => {
                    const isActive = activeSlug === d.slug;
                    return (
                      <button
                        key={d.slug}
                        type="button"
                        onClick={() => scrollToDoc(d.slug)}
                        className={`group flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition ${
                          isActive
                            ? "bg-teal-500/10 font-semibold text-teal-700 dark:text-teal-300"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground"
                        }`}
                      >
                        <span className="truncate">{d.title}</span>
                        <ChevronRight
                          className={`h-3 w-3 shrink-0 transition-transform ${
                            isActive
                              ? "text-teal-600 dark:text-teal-300 translate-x-0.5"
                              : "opacity-0 group-hover:opacity-100 text-muted-foreground"
                          }`}
                        />
                      </button>
                    );
                  })}
                </nav>
              </div>
            </aside>
          )}

          {/* Reading column */}
          <main className="min-w-0 flex-1 max-w-3xl">
            <div className="space-y-16">
              {docs.map((d) => (
                <section
                  key={d.slug}
                  id={d.slug}
                  className="scroll-mt-24 border-b border-border/70 pb-16 last:border-0"
                >
                  <article className="prose dark:prose-invert max-w-none prose-headings:scroll-mt-24 prose-a:text-teal-600 dark:prose-a:text-teal-300 prose-pre:bg-card prose-pre:border prose-pre:border-border">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h1: ({ children, ...props }) => {
                          const text = textFromNode(children);
                          return (
                            <h1 id={slugifyHeading(text)} className="tracking-tight" {...props}>
                              {children}
                            </h1>
                          );
                        },
                        h2: ({ children, ...props }) => {
                          const text = textFromNode(children);
                          return (
                            <h2 id={slugifyHeading(text)} className="tracking-tight" {...props}>
                              {children}
                            </h2>
                          );
                        },
                        h3: ({ children, ...props }) => {
                          const text = textFromNode(children);
                          return (
                            <h3 id={slugifyHeading(text)} className="tracking-tight" {...props}>
                              {children}
                            </h3>
                          );
                        },
                      }}
                    >
                      {d.body_md}
                    </ReactMarkdown>
                  </article>
                </section>
              ))}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
