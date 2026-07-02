import { useEffect, useMemo, useState } from "react";
import { slugifyHeading, stripMarkdownInline } from "@/lib/heading-utils";

export type TocHeading = { title: string; id: string };

export function useTocHeadings(bodyMd: string): TocHeading[] {
  return useMemo(
    () =>
      [...bodyMd.matchAll(/^##\s+(.+)$/gm)].map((match) => {
        // Strip inline markdown first so the slug matches the one the article renderer
        // derives from the rendered DOM text (links/code/emphasis markers don't render).
        const title = stripMarkdownInline(match[1]);
        return { title, id: slugifyHeading(title) };
      }),
    [bodyMd],
  );
}

// In-page "Contents" nav — extracted from the blog detail page's left column so articles,
// designs, and lessons all get it on the unified content route (designs/lessons didn't have
// one before).
export function ContentTocSidebar({ headings }: { headings: TocHeading[] }) {
  const activeId = useActiveHeading(headings);
  if (!headings.length) return null;
  return (
    <nav className="rounded-md border border-border bg-card p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Contents
      </div>
      <div className="mt-2 space-y-0.5 border-l border-border">
        {headings.map((heading) => {
          const active = heading.id === activeId;
          return (
            <a
              key={heading.id}
              href={`#${heading.id}`}
              className={`-ml-px block border-l-2 py-1 pl-3 text-xs transition ${
                active
                  ? "border-teal-300 font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
              }`}
            >
              {heading.title}
            </a>
          );
        })}
      </div>
    </nav>
  );
}

function useActiveHeading(headings: TocHeading[]): string | null {
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
