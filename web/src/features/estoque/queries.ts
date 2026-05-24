import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';
import type {
  ItemInput,
  Movimentacao,
  MovTipo,
  VisaoGeralResponse,
} from './types';

/** Visão geral do estoque — almoxarifados + itens com saldos. */
export function useVisaoGeral() {
  return useQuery({
    queryKey: queryKeys.estoqueVisao,
    queryFn: () => api.get<VisaoGeralResponse>('/api/estoque/visao-geral'),
  });
}

interface MovsResponse {
  movimentacoes: Movimentacao[];
}

/** Histórico de movimentações (últimas 200). */
export function useMovimentacoes() {
  return useQuery({
    queryKey: queryKeys.estoqueMovs,
    queryFn: () =>
      api.get<MovsResponse>('/api/estoque/movimentacoes?limit=200'),
    select: (data) => data.movimentacoes ?? [],
  });
}

function useEstoqueMutation<TVars>(
  buildRequest: (vars: TVars) => Promise<unknown>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: buildRequest,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.estoqueVisao });
      void qc.invalidateQueries({ queryKey: queryKeys.estoqueMovs });
    },
  });
}

/** Cria item — POST /api/estoque/itens. */
export function useCriarItem() {
  return useEstoqueMutation((input: ItemInput) =>
    api.post('/api/estoque/itens', input),
  );
}

/** Edita item — PUT /api/estoque/itens/:id. */
export function useEditarItem() {
  return useEstoqueMutation(({ id, input }: { id: string; input: ItemInput }) =>
    api.put(`/api/estoque/itens/${id}`, input),
  );
}

/** Inativa item — DELETE /api/estoque/itens/:id. */
export function useInativarItem() {
  return useEstoqueMutation((id: string) =>
    api.delete(`/api/estoque/itens/${id}`),
  );
}

/** Corpo de uma movimentação de estoque. */
export interface MovimentacaoInput {
  tipo: MovTipo;
  itemId: string;
  quantidade: number;
  data: string;
  almoxarifadoOrigemId?: string;
  almoxarifadoDestinoId?: string;
  custoUnit?: number;
  contractId?: string;
  sinal?: '+' | '-';
  documento?: string;
  notas?: string | null;
}

/** Registra uma movimentação — POST /api/estoque/movimentacoes. */
export function useCriarMovimentacao() {
  return useEstoqueMutation((input: MovimentacaoInput) =>
    api.post('/api/estoque/movimentacoes', input),
  );
}

/** Reverte uma movimentação — DELETE /api/estoque/movimentacoes/:id. */
export function useReverterMovimentacao() {
  return useEstoqueMutation((id: string) =>
    api.delete(`/api/estoque/movimentacoes/${id}`),
  );
}
