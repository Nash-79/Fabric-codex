import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

// Origin context passed on the article link's `search` prop so returning from an article lands
// back on the exact list state the reader came from (filters/query included), not just "back to
// /blogs". Kept as a flat search-param shape (not history state) so it survives a full reload,
// a shared link, and browser back/forward alike.
export type ArticleOrigin =
  | { from: "search"; q: string }
  | { from: "topic"; slug: string; name?: string }
  | { from: "home"; capability?: string }
  | { from: "learn" };

export function originSearch(origin?: ArticleOrigin): Record<string, string> | undefined {
  if (!origin) return undefined;
  if (origin.from === "search") return { from: "search", q: origin.q };
  if (origin.from === "topic") return { from: "topic", fromSlug: origin.slug };
  if (origin.from === "home") return { from: "home", fromSlug: origin.capability ?? "" };
  return { from: "learn" };
}

export function ArticleBreadcrumb({
  from,
  fromSlug,
  q,
  topicName,
}: {
  from?: string;
  fromSlug?: string;
  q?: string;
  topicName?: string;
}) {
  if (from === "search" && q) {
    return (
      <Link
        to="/search"
        search={{ q }}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to search results for "{q}"
      </Link>
    );
  }
  if (from === "topic" && fromSlug) {
    return (
      <Link
        to="/topics/$slug"
        params={{ slug: fromSlug }}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to {topicName ?? fromSlug}
      </Link>
    );
  }
  if (from === "home") {
    return (
      <Link
        to="/"
        search={fromSlug ? { capability: fromSlug } : undefined}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to Overview
      </Link>
    );
  }
  if (from === "learn") {
    return (
      <Link
        to="/knowledge"
        search={{ kind: "lesson" }}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to Lessons
      </Link>
    );
  }
  return (
    <Link
      to="/knowledge"
      search={{ kind: "article" }}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
    >
      <ChevronLeft className="h-3.5 w-3.5" />
      All articles
    </Link>
  );
}
