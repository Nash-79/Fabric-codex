import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/content/")({
  loader: ({ search }) => {
    throw redirect({
      to: "/blogs",
      search,
    });
  },
});
