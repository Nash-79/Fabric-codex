import { createFileRoute, redirect } from "@tanstack/react-router";

// Redirect wrapper — the old /blog/$slug route now lives at /content/article/$slug (the unified
// article/design/lesson detail route). Kept so existing bookmarks/links keep working.
export const Route = createFileRoute("/blog/$slug")({
  loader: ({ params }) => {
    throw redirect({ to: "/content/$kind/$slug", params: { kind: "article", slug: params.slug } });
  },
});
