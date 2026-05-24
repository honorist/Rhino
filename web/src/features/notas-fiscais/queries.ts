import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';
import type { NotaFiscal } from '../../types/domain';

/**
 * Mutações de Notas Fiscais (Contas a Receber). Emitir/cancelar/excluir mexem
 * no Caixa (entrada agendada), então invalidam as duas slices. A listagem usa
 * o `useNotasFiscais` padrão da fábrica (features/resources.ts).
 */

export type NotaFiscalInput = Partial<Omit<NotaFiscal, 'id'>>;

function useNFInvalidation() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: queryKeys.notasFiscais });
    void qc.invalidateQueries({ queryKey: queryKeys.caixa });
  };
}

/** Criação — POST /api/notas-fiscais. */
export function useCreateNotaFiscal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NotaFiscalInput) =>
      api.post('/api/notas-fiscais', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.notasFiscais });
    },
  });
}

/** Edição — PUT /api/notas-fiscais/:id. */
export function useUpdateNotaFiscal() {
  const invalidate = useNFInvalidation();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: NotaFiscalInput }) =>
      api.put(`/api/notas-fiscais/${id}`, input),
    onSuccess: invalidate,
  });
}

/** Exclusão — DELETE /api/notas-fiscais/:id (remove a entrada no caixa se emitida). */
export function useDeleteNotaFiscal() {
  const invalidate = useNFInvalidation();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/notas-fiscais/${id}`),
    onSuccess: invalidate,
  });
}

export interface EmitirResult {
  mensagem?: string;
}

/** Marca a NF como emitida — POST /api/notas-fiscais/:id/emitir. */
export function useEmitirNotaFiscal() {
  const invalidate = useNFInvalidation();
  return useMutation({
    mutationFn: ({
      id,
      dataEmissaoReal,
    }: {
      id: string;
      dataEmissaoReal: string;
    }) =>
      api.post<EmitirResult>(`/api/notas-fiscais/${id}/emitir`, {
        dataEmissaoReal,
      }),
    onSuccess: invalidate,
  });
}

/** Desfaz a emissão — POST /api/notas-fiscais/:id/cancelar-emissao. */
export function useCancelarEmissao() {
  const invalidate = useNFInvalidation();
  return useMutation({
    mutationFn: (id: string) =>
      api.post(`/api/notas-fiscais/${id}/cancelar-emissao`),
    onSuccess: invalidate,
  });
}
