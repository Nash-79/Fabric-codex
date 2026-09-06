import { createFileRoute, redirect } from "@tanstack/react-router";

// Folded into the Knowledge Hub as the "Lessons" chip. Lessons are content_items like anything
// else; the tiering that makes them distinct lives on the item, not on a separate browse surface.
export const Route = createFileRoute("/learn")({
  beforeLoad: () => {
    throw redirect({ to: "/knowledge", search: { kind: "lesson" } });
  },
});
