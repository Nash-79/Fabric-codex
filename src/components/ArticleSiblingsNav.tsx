import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Sibling = { slug: string; title: string } | null;

export function ArticleSiblingsNav({
  kind,
  prev,
  next,
}: {
  kind: "article" | "design" | "lesson";
  prev: Sibling;
  next: Sibling;
}) {
  if (!prev && !next) return null;
  return (
    <nav
      aria-label="Article navigation"
      className="mt-16 grid gap-3 border-t border-border pt-8 sm:grid-cols-2"
    >
      {prev ? (
        <Link
          to="/blogs/$kind/$slug"
          params={{ kind, slug: prev.slug }}
          className="group flex flex-col rounded-lg border border-border bg-card p-4 transition hover:border-teal-500/50"
        >
          <span className="inline-flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
            <ChevronLeft className="h-3 w-3" aria-hidden />
            Previous
          </span>
          <span className="mt-1 text-sm font-medium text-foreground line-clamp-2 group-hover:text-teal-600 dark:group-hover:text-teal-300">
            {prev.title}
          </span>
        </Link>
      ) : (
        <div aria-hidden />
      )}
      {next ? (
        <Link
          to="/blogs/$kind/$slug"
          params={{ kind, slug: next.slug }}
          className="group flex flex-col rounded-lg border border-border bg-card p-4 text-right transition hover:border-teal-500/50 sm:text-right"
        >
          <span className="inline-flex items-center justify-end gap-1 text-xs uppercase tracking-wide text-muted-foreground">
            Next
            <ChevronRight className="h-3 w-3" aria-hidden />
          </span>
          <span className="mt-1 text-sm font-medium text-foreground line-clamp-2 group-hover:text-teal-600 dark:group-hover:text-teal-300">
            {next.title}
          </span>
        </Link>
      ) : (
        <div aria-hidden />
      )}
    </nav>
  );
}
