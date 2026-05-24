import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';
import type { Cliente, ClienteInput } from './types';

/**
 * Hooks de dados do domínio Cliente — PADRÃO CANÔNICO da Fase 1.
 *
 * Cada uma das ~24 slices restantes do store.js segue exatamente esta forma:
 *   1. um `useXxx()`        → useQuery (GET, com `select` desembrulhando o envelope)
 *   2. `useCreateXxx()`     → useMutation (POST)  + invalidateQueries
 *   3. `useUpdateXxx()`     → useMutation (PUT)   + invalidateQueries
 *   4. `useDeleteXxx()`     → useMutation (DELETE)+ invalidateQueries
 *
 * Os endpoints do Rhino devolvem a coleção inteira após cada mutação; aqui
 * preferimos `invalidateQueries` (refetch) — simples e sempre consistente.
 */

/** Envelope de resposta dos endpoints /api/clientes. */
interface ClientesResponse {
  clientes: Cliente[];
}

/** Lista de clientes — GET /api/clientes. */
export function useClientes() {
  return useQuery({
    queryKey: queryKeys.clientes,
    queryFn: () => api.get<ClientesResponse>('/api/clientes'),
    select: (data) => data.clientes ?? [],
  });
}

/** Criação — POST /api/clientes. */
export function useCreateCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ClienteInput) =>
      api.post<ClientesResponse>('/api/clientes', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.clientes });
    },
  });
}

/** Edição — PUT /api/clientes/:id. */
export function useUpdateCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ClienteInput }) =>
      api.put<ClientesResponse>(`/api/clientes/${id}`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.clientes });
    },
  });
}

/** Exclusão — DELETE /api/clientes/:id. */
export function useDeleteCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<ClientesResponse>(`/api/clientes/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.clientes });
    },
  });
}
