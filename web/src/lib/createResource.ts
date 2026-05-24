import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { api } from './api';

/** Identidade mínima de qualquer registro de domínio. */
export interface Identifiable {
  id: string;
}

export interface ResourceConfig {
  /** Query key — proveniente de queryKeys. */
  key: QueryKey;
  /** Caminho REST base, ex.: '/api/socios'. */
  path: string;
  /** Nome do array no envelope de resposta, ex.: 'socios' em `{ socios: [...] }`. */
  envelope: string;
}

export interface ResourceHooks<T, TInput> {
  /** GET lista — desembrulha o envelope de resposta. */
  useList: () => UseQueryResult<T[]>;
  /** POST — cria e refaz o fetch da lista. */
  useCreate: () => UseMutationResult<unknown, Error, TInput>;
  /** PUT /:id — edita e refaz o fetch da lista. */
  useUpdate: () => UseMutationResult<unknown, Error, { id: string; input: TInput }>;
  /** DELETE /:id — remove e refaz o fetch da lista. */
  useRemove: () => UseMutationResult<unknown, Error, string>;
}

/**
 * Gera os 4 hooks CRUD de um recurso REST do Rhino.
 *
 * Todos os endpoints de coleção do Rhino seguem o mesmo contrato:
 *  - GET `/api/<recurso>`        → `{ <envelope>: T[] }`
 *  - POST/PUT/DELETE             → confirmados; aqui disparam refetch via
 *                                  invalidateQueries (sempre consistente).
 *
 * Versão DRY do padrão explícito documentado em `features/clientes/queries.ts`.
 */
export function createResource<
  T extends Identifiable,
  TInput = Partial<Omit<T, 'id'>>,
>(config: ResourceConfig): ResourceHooks<T, TInput> {
  const { key, path, envelope } = config;

  function useList(): UseQueryResult<T[]> {
    return useQuery({
      queryKey: key,
      queryFn: () => api.get<Record<string, T[]>>(path),
      select: (data) => data[envelope] ?? [],
    });
  }

  function useCreate(): UseMutationResult<unknown, Error, TInput> {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (input: TInput) => api.post<unknown>(path, input),
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: key });
      },
    });
  }

  function useUpdate(): UseMutationResult<unknown, Error, { id: string; input: TInput }> {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: ({ id, input }: { id: string; input: TInput }) =>
        api.put<unknown>(`${path}/${id}`, input),
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: key });
      },
    });
  }

  function useRemove(): UseMutationResult<unknown, Error, string> {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (id: string) => api.delete<unknown>(`${path}/${id}`),
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: key });
      },
    });
  }

  return { useList, useCreate, useUpdate, useRemove };
}
