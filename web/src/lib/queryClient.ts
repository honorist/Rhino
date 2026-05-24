import { QueryClient } from '@tanstack/react-query';

/**
 * QueryClient único da aplicação.
 * `staleTime: 60s` espelha o TTL de cache do store.js antigo
 * (LOAD_ALL_TTL_MS / SLICE_TTL_MS).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});
