import { createFileRoute, redirect } from "@tanstack/react-router";

// Redirect wrapper — the old /design/$slug route now lives at /blogs/design/$slug (the unified
// article/design/lesson detail route). Kept so existing bookmarks/links keep working.
export const Route = createFileRoute("/design/$slug")({
  loader: ({ params }) => {
    throw redirect({ to: "/blogs/$kind/$slug", params: { kind: "design", slug: params.slug } });
  },
});
