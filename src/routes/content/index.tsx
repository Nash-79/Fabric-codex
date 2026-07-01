import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/content/")({
  loader: () => {
    throw redirect({ to: "/blogs" });
  },
});
