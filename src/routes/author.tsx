import { createFileRoute, redirect } from "@tanstack/react-router";

// Retired to /help. This was static developer README content on a public route: it documented
// local slash-commands that mean nothing to a reader, and linked to /settings four times, which
// is a dead end for anyone signed out. Help is where self-documentation belongs.
export const Route = createFileRoute("/author")({
  beforeLoad: () => {
    throw redirect({ to: "/help" });
  },
});
