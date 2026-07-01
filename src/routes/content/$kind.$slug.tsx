import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/content/$kind/$slug")({
  loader: ({ params }) => {
    throw redirect({
      to: "/blogs/$kind/$slug",
      params: { kind: params.kind, slug: params.slug },
    });
  },
});
