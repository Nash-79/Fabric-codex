import { createFileRoute, redirect } from "@tanstack/react-router";

// Folded into the Knowledge Hub as the "Articles" chip. /blogs, /designs and /learn were three
// views of content_items differing only by `kind`, each carrying prose explaining it was not the
// other two.
//
// Only the LISTING moves. The reader route /blogs/$kind/$slug is untouched, so every published
// URL still resolves — this file is the index, not the article pages beneath it.
export const Route = createFileRoute("/blogs/")({
  // /blogs?kind=design was the original designs listing, before /designs existed. That URL has
  // been redirected once already; keep honouring it rather than breaking it a second time.
  beforeLoad: ({ search }: { search: { kind?: string } }) => {
    throw redirect({
      to: "/knowledge",
      search: { kind: search.kind === "design" ? "design" : "article" },
    });
  },
});
