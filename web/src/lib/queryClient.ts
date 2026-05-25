import { QueryClient } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

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

/**
 * Persister em localStorage — combina com o `offlineQueue.ts` para dar
 * cache real durante navegação offline. O usuário pode abrir uma rota,
 * cair offline, e ainda ver dados em cache da última sessão.
 *
 * Chave isolada por versão do app para invalidar o cache em deploys
 * que mudam o schema das respostas.
 */
export const persister = createSyncStoragePersister({
  storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  key: 'rhino-query-cache-v1',
  throttleTime: 1000,
});
