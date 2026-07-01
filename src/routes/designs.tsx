import { createFileRoute, redirect } from "@tanstack/react-router";

// Redirect wrapper — the old /designs listing now lives at /content?kind=design (the unified
// content listing route). Kept so existing bookmarks/links keep working.
export const Route = createFileRoute("/designs")({
  loader: () => {
    throw redirect({ to: "/content", search: { kind: "design" } });
  },
});
