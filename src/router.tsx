import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        refetchOnWindowFocus: false,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Hover/focus a link → loader data is prefetched, so the click feels instant.
    defaultPreload: "intent",
    // Let TanStack Query own freshness (its staleTime is 5 min above).
    defaultPreloadStaleTime: 0,
  });

  return router;
};
