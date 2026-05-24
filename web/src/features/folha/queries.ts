import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';
import type { FolhaItemTipo, FolhaParcela, FolhaResponse } from './types';

/**
 * Hooks de dados da Folha de Pagamento.
 *
 * A folha não é um recurso CRUD padrão: é parametrizada por competência e tem
 * ações próprias (gerar, limpar, pagar, estornar, lançamentos). Gerar/pagar/
 * estornar mexem em contas a pagar, caixa e BASE — por isso toda mutação
 * invalida essas quatro slices.
 */

export interface GerarFolhaResult {
  criadas: number;
}

export interface LimparFolhaResult {
  removidas: number;
  mantidas?: number;
}

/** Folha de uma competência — GET /api/folha-pagamento?competencia=YYYY-MM. */
export function useFolha(competencia: string) {
  return useQuery({
    queryKey: queryKeys.folha(competencia),
    queryFn: () =>
      api.get<FolhaResponse>(
        `/api/folha-pagamento?competencia=${encodeURIComponent(competencia)}`,
      ),
    select: (data) => data.folha ?? [],
  });
}

/** Invalida folha + as slices contábeis afetadas por uma mutação de folha. */
function useFolhaInvalidation() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['folha'] });
    void qc.invalidateQueries({ queryKey: queryKeys.contasPagar });
    void qc.invalidateQueries({ queryKey: queryKeys.caixa });
    void qc.invalidateQueries({ queryKey: queryKeys.base });
  };
}

/** Gera a folha do mês — POST /api/folha-pagamento/gerar. */
export function useGerarFolha() {
  const invalidate = useFolhaInvalidation();
  return useMutation({
    mutationFn: (competencia: string) =>
      api.post<GerarFolhaResult>('/api/folha-pagamento/gerar', { competencia }),
    onSuccess: invalidate,
  });
}

/** Limpa registros não pagos da folha — POST /api/folha-pagamento/limpar. */
export function useLimparFolha() {
  const invalidate = useFolhaInvalidation();
  return useMutation({
    mutationFn: (competencia: string) =>
      api.post<LimparFolhaResult>('/api/folha-pagamento/limpar', { competencia }),
    onSuccess: invalidate,
  });
}

export interface PagarParcelaInput {
  id: string;
  parcela: FolhaParcela;
  dataPagamento: string;
  formaPagamento: string | null;
}

/** Paga uma parcela (vale/saldo) — POST /api/folha-pagamento/:id/pagar. */
export function usePagarParcela() {
  const invalidate = useFolhaInvalidation();
  return useMutation({
    mutationFn: ({ id, parcela, dataPagamento, formaPagamento }: PagarParcelaInput) =>
      api.post(`/api/folha-pagamento/${id}/pagar`, {
        parcela,
        dataPagamento,
        formaPagamento,
      }),
    onSuccess: invalidate,
  });
}

/** Estorna uma parcela — POST /api/folha-pagamento/:id/estornar. */
export function useEstornarParcela() {
  const invalidate = useFolhaInvalidation();
  return useMutation({
    mutationFn: ({ id, parcela }: { id: string; parcela: FolhaParcela }) =>
      api.post(`/api/folha-pagamento/${id}/estornar`, { parcela }),
    onSuccess: invalidate,
  });
}

export interface AddFolhaItemInput {
  folhaId: string;
  tipo: FolhaItemTipo;
  descricao: string;
  valor: number;
}

/** Adiciona um lançamento — POST /api/folha-pagamento/:id/itens. */
export function useAddFolhaItem() {
  const invalidate = useFolhaInvalidation();
  return useMutation({
    mutationFn: ({ folhaId, tipo, descricao, valor }: AddFolhaItemInput) =>
      api.post(`/api/folha-pagamento/${folhaId}/itens`, { tipo, descricao, valor }),
    onSuccess: invalidate,
  });
}

/** Remove um lançamento — DELETE /api/folha-pagamento/:id/itens/:itemId. */
export function useRemoveFolhaItem() {
  const invalidate = useFolhaInvalidation();
  return useMutation({
    mutationFn: ({ folhaId, itemId }: { folhaId: string; itemId: string }) =>
      api.delete(`/api/folha-pagamento/${folhaId}/itens/${itemId}`),
    onSuccess: invalidate,
  });
}

/** Atualiza o valor de um lançamento — PUT /api/folha-pagamento/:id/itens/:itemId. */
export function useUpdateFolhaItem() {
  const invalidate = useFolhaInvalidation();
  return useMutation({
    mutationFn: ({
      folhaId,
      itemId,
      valor,
    }: {
      folhaId: string;
      itemId: string;
      valor: number;
    }) => api.put(`/api/folha-pagamento/${folhaId}/itens/${itemId}`, { valor }),
    onSuccess: invalidate,
  });
}
