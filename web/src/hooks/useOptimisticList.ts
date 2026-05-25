import { useOptimistic } from 'react';

type OptimisticAction<T> =
  | { type: 'add'; item: T }
  | { type: 'update'; id: string; patch: Partial<T> }
  | { type: 'remove'; id: string };

/**
 * Aplica updates otimistas em uma lista enquanto a mutation real roda.
 * Reverte sozinho se a Promise da mutation for rejeitada (ou quando o
 * server state real do React Query chega via invalidateQueries).
 *
 * Uso:
 *   const { useListSuspense, useCreate } = clientesResource;
 *   const { data } = useListSuspense();
 *   const [list, dispatch] = useOptimisticList(data);
 *   const create = useCreate();
 *
 *   async function add(novo: Cliente) {
 *     dispatch({ type: 'add', item: { ...novo, id: 'temp-' + Date.now() } });
 *     await create.mutateAsync(novo);
 *   }
 */
export function useOptimisticList<T extends { id: string }>(
  baseList: readonly T[],
): [readonly T[], (action: OptimisticAction<T>) => void] {
  return useOptimistic(baseList, (state, action: OptimisticAction<T>) => {
    switch (action.type) {
      case 'add':
        return [...state, action.item];
      case 'update':
        return state.map((item) =>
          item.id === action.id ? { ...item, ...action.patch } : item,
        );
      case 'remove':
        return state.filter((item) => item.id !== action.id);
    }
  });
}
