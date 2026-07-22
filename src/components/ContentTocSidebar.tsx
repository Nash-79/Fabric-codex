import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronUp, ChevronDown, Hash, Image as ImageIcon } from "lucide-react";
import { slugifyHeading, stripMarkdownInline } from "@/lib/heading-utils";

export type TocEntry = {
  id: string;
  title: string;
  kind: "heading" | "subheading" | "figure";
};

export type TocHeading = TocEntry; // legacy alias

// Extract `## headings`, `### subheadings`, and image references in document order. The sidebar
// navigator and scroll-spy only care about top-level `heading`s + `figure`s (subheadings would
// clutter the ToC); callers that need finer-grained anchors — e.g. attributing feedback to a
// specific subsection like "### How it works internally" — filter for `kind === "subheading"` too.
export function useTocHeadings(bodyMd: string): TocEntry[] {
  return useMemo(() => {
    const entries: TocEntry[] = [];
    let figureIndex = 0;
    const re = /^(##|###)\s+(.+)$|!\[([^\]]*)\]\(([^)\s]+)\)/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(bodyMd)) !== null) {
      if (m[1]) {
        const title = stripMarkdownInline(m[2]);
        entries.push({
          id: slugifyHeading(title),
          title,
          kind: m[1] === "##" ? "heading" : "subheading",
        });
      } else {
        figureIndex += 1;
        const alt = stripMarkdownInline(m[3] ?? "").trim();
        entries.push({
          id: `figure-${figureIndex}`,
          title: alt ? `Figure ${figureIndex} — ${alt}` : `Figure ${figureIndex}`,
          kind: "figure",
        });
      }
    }
    return entries;
  }, [bodyMd]);
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  history.replaceState(null, "", `#${id}`);
}

export function ContentTocSidebar({ headings: allEntries }: { headings: TocEntry[] }) {
  const headings = useMemo(() => allEntries.filter((h) => h.kind !== "subheading"), [allEntries]);
  const activeId = useActiveHeading(headings);

  const goRelative = useCallback(
    (delta: number) => {
      if (!headings.length) return;
      const idx = headings.findIndex((h) => h.id === activeId);
      const nextIdx = Math.max(0, Math.min(headings.length - 1, (idx < 0 ? 0 : idx) + delta));
      scrollToId(headings[nextIdx].id);
    },
    [headings, activeId],
  );

  // Keyboard shortcuts: J = next, K = previous (skip when typing).
  useEffect(() => {
    if (!headings.length) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      if (t?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        goRelative(1);
      } else if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        goRelative(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [headings, goRelative]);

  if (!headings.length) return null;

  const idx = headings.findIndex((h) => h.id === activeId);
  const atStart = idx <= 0;
  const atEnd = idx === headings.length - 1;

  return (
    <nav aria-label="Article contents" className="rounded-md border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Contents
        </div>
        <div className="flex items-center gap-0.5" role="group" aria-label="Jump between sections">
          <button
            type="button"
            onClick={() => goRelative(-1)}
            disabled={atStart}
            aria-label="Previous section"
            title="Previous section (K)"
            className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronUp className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => goRelative(1)}
            disabled={atEnd}
            aria-label="Next section"
            title="Next section (J)"
            className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronDown className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
      <ul className="mt-2 space-y-0.5 border-l border-border">
        {headings.map((h) => {
          const active = h.id === activeId;
          const Icon = h.kind === "figure" ? ImageIcon : Hash;
          return (
            <li key={h.id}>
              <a
                href={`#${h.id}`}
                aria-current={active ? "location" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  scrollToId(h.id);
                }}
                className={`-ml-px flex items-start gap-1.5 border-l-2 py-1 pl-3 pr-1 text-xs transition ${
                  active
                    ? "border-teal-400 font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                } ${h.kind === "figure" ? "italic" : ""}`}
              >
                <Icon
                  className={`mt-0.5 h-3 w-3 shrink-0 ${
                    h.kind === "figure" ? "text-teal-500" : "opacity-60"
                  }`}
                  aria-hidden
                />
                <span className="line-clamp-2">{h.title}</span>
              </a>
            </li>
          );
        })}
      </ul>
      <div className="sr-only" aria-live="polite">
        {activeId
          ? `Current section: ${headings[idx]?.title ?? ""}`
          : "No section currently in view"}
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground/70">
        Tip: press <kbd className="rounded bg-muted px-1">J</kbd> /{" "}
        <kbd className="rounded bg-muted px-1">K</kbd> to move between sections
      </p>
    </nav>
  );
}

export function useActiveHeading(headings: TocEntry[]): string | null {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (!headings.length) return;
    const elements = headings
      .map((h) => document.getElementById(h.id))
      .filter((el): el is HTMLElement => el !== null);
    if (!elements.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-96px 0px -70% 0px", threshold: 0 },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [headings]);

  return activeId;
}
