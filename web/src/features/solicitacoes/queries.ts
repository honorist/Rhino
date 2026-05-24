import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';
import type { SolItem } from '../../types/domain';

/**
 * Ações de fluxo da Solicitação de Compra que vão além do CRUD da fábrica
 * `createResource` (avaliar, aprovar, rejeitar, cancelar, comprar, receber).
 * O CRUD básico vem de `features/resources.ts`.
 */

/** Payload do registro de compra. */
export interface ComprarInput {
  numeroPedido: string;
  dataPrevistaEntrega: string;
  fornecedorId: string;
  dataVencimento: string;
}

/** Payload da confirmação de recebimento. */
export interface ReceberInput {
  dataRecebimento: string;
  nfRecebimento: string;
  obsRecebimento: string;
}

function useSolAction<TVars>(
  buildRequest: (vars: TVars) => Promise<unknown>,
  alsoInvalidate: readonly (readonly string[])[] = [],
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: buildRequest,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.solicitacoesCompra });
      for (const key of alsoInvalidate) {
        void qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}

/** Equipe de compras avalia/precifica — POST .../:id/avaliar. */
export function useAvaliarSolicitacao() {
  return useSolAction(({ id, itens }: { id: string; itens: SolItem[] }) =>
    api.post(`/api/solicitacoes-compra/${id}/avaliar`, { itens }),
  );
}

/** Gerente aprova — POST .../:id/aprovar. */
export function useAprovarSolicitacao() {
  return useSolAction((id: string) =>
    api.post(`/api/solicitacoes-compra/${id}/aprovar`, {}),
  );
}

/** Gerente rejeita — POST .../:id/rejeitar. */
export function useRejeitarSolicitacao() {
  return useSolAction(({ id, motivo }: { id: string; motivo: string }) =>
    api.post(`/api/solicitacoes-compra/${id}/rejeitar`, { motivo }),
  );
}

/** Cancela a solicitação — POST .../:id/cancelar. */
export function useCancelarSolicitacao() {
  return useSolAction(({ id, motivo }: { id: string; motivo: string }) =>
    api.post(`/api/solicitacoes-compra/${id}/cancelar`, { motivo }),
  );
}

/** Registra a compra (gera Conta a Pagar) — POST .../:id/comprar. */
export function useComprarSolicitacao() {
  return useSolAction(
    ({ id, input }: { id: string; input: ComprarInput }) =>
      api.post(`/api/solicitacoes-compra/${id}/comprar`, input),
    [queryKeys.contasPagar],
  );
}

/** Confirma o recebimento (gera entrada de estoque) — POST .../:id/receber. */
export function useReceberSolicitacao() {
  return useSolAction(
    ({ id, input }: { id: string; input: ReceberInput }) =>
      api.post(`/api/solicitacoes-compra/${id}/receber`, input),
  );
}
