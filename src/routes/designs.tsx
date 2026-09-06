import { createFileRoute, redirect } from "@tanstack/react-router";

// Folded into the Knowledge Hub. This page was a near line-for-line copy of blogs/index.tsx
// differing only by `kind: "design"`, which is a filter rather than a separate destination.
// The reader route (/blogs/$kind/$slug) is unchanged, so every published architecture keeps its URL.
export const Route = createFileRoute("/designs")({
  beforeLoad: () => {
    throw redirect({ to: "/knowledge", search: { kind: "design" } });
  },
});
