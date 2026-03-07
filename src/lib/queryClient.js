import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,        // 1 min: cached data shown instantly on remount
      gcTime: 5 * 60 * 1000,       // 5 min: keep unused cache alive
      refetchOnWindowFocus: false,  // don't refetch on every alt-tab
      retry: 1,
    },
  },
});
