import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';
import type { ContaPagar } from '../../types/domain';

/**
 * Mutações de Contas a Pagar — caso especial: pagar/estornar/excluir mexem no
 * Caixa (saída automática), então invalidam as duas slices. A listagem usa o
 * `useContasPagar` padrão da fábrica (features/resources.ts).
 */

export type ContaPagarInput = Partial<Omit<ContaPagar, 'id'>>;

/** Invalida contas a pagar + caixa (afetados em conjunto por pagamento). */
function useContaInvalidation() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: queryKeys.contasPagar });
    void qc.invalidateQueries({ queryKey: queryKeys.caixa });
  };
}

/** Criação — POST /api/contas-pagar. */
export function useCreateContaPagar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ContaPagarInput) =>
      api.post('/api/contas-pagar', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.contasPagar });
    },
  });
}

/** Edição — PUT /api/contas-pagar/:id. */
export function useUpdateContaPagar() {
  const invalidate = useContaInvalidation();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ContaPagarInput }) =>
      api.put(`/api/contas-pagar/${id}`, input),
    onSuccess: invalidate,
  });
}

/** Exclusão — DELETE /api/contas-pagar/:id (remove a saída no caixa se paga). */
export function useDeleteContaPagar() {
  const invalidate = useContaInvalidation();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/contas-pagar/${id}`),
    onSuccess: invalidate,
  });
}

export interface PagarContaInput {
  id: string;
  dataPagamento: string;
  valorPago: number;
  formaPagamento: string;
}

/** Registra pagamento — POST /api/contas-pagar/:id/pagar. */
export function usePagarConta() {
  const invalidate = useContaInvalidation();
  return useMutation({
    mutationFn: ({ id, dataPagamento, valorPago, formaPagamento }: PagarContaInput) =>
      api.post(`/api/contas-pagar/${id}/pagar`, {
        dataPagamento,
        valorPago,
        formaPagamento,
      }),
    onSuccess: invalidate,
  });
}

/** Estorna pagamento — POST /api/contas-pagar/:id/estornar. */
export function useEstornarConta() {
  const invalidate = useContaInvalidation();
  return useMutation({
    mutationFn: (id: string) => api.post(`/api/contas-pagar/${id}/estornar`),
    onSuccess: invalidate,
  });
}

/** Processa contas recorrentes — POST /api/contas-pagar/processar-recorrencias. */
export function useProcessarRecorrencias() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/api/contas-pagar/processar-recorrencias'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.contasPagar });
    },
  });
}

export interface ClassifyExpenseInput {
  descricao: string;
  valor: number;
  fornecedor: string;
}

export interface ClassifyExpenseResult {
  category?: string;
  contractId?: string;
  confidence?: number;
}

/** Classificação de despesa por IA — POST /api/ai/classify-expense. */
export function useClassifyExpense() {
  return useMutation({
    mutationFn: (input: ClassifyExpenseInput) =>
      api.post<ClassifyExpenseResult>('/api/ai/classify-expense', input),
  });
}
