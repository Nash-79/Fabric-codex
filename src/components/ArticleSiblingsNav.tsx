import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Sibling = { slug: string; title: string } | null;

export function ArticleSiblingsNav({
  kind,
  prev,
  next,
  pathSlug,
  pathTitle,
}: {
  kind: "article" | "design" | "lesson";
  prev: Sibling;
  next: Sibling;
  /** When set, prev/next follow a learning path's order rather than recency — carried in the
      link's ?path param so navigating along the chain keeps resolving the same path instead of
      falling back to auto-detection on every hop. */
  pathSlug?: string | null;
  pathTitle?: string;
}) {
  if (!prev && !next) return null;
  const search = pathSlug ? { path: pathSlug } : undefined;
  return (
    <nav aria-label="Article navigation" className="mt-16 border-t border-border pt-8">
      {pathSlug && pathTitle && (
        <div className="mb-3 text-xs uppercase tracking-wide text-muted-foreground">
          Part of <span className="text-foreground">{pathTitle}</span>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {prev ? (
          <Link
            to="/blogs/$kind/$slug"
            params={{ kind, slug: prev.slug }}
            search={search}
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
            search={search}
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
      </div>
    </nav>
  );
}
