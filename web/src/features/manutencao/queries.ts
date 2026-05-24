import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';

/**
 * Ações de fluxo da Manutenção que vão além do CRUD da fábrica `createResource`
 * (avaliar, aprovar, rejeitar, retorno, cancelar). O CRUD básico — listar,
 * criar, editar, excluir — vem de `features/resources.ts` (useManutencoes etc).
 *
 * Todos os endpoints devolvem a coleção atualizada; aqui usamos
 * `invalidateQueries` para refazer o fetch, como no resto da migração.
 */

/** Payload da etapa de avaliação (equipe de compras). */
export interface AvaliarInput {
  oficina: string;
  custoEstimado: number;
  dataEnvio: string | null;
  dataRetornoPrevista: string | null;
  observacoes: string;
}

/** Payload do registro de retorno do equipamento. */
export interface RetornoInput {
  dataRetorno: string;
  custo: number;
  observacoes: string;
}

function useManutencaoAction<TVars>(
  buildRequest: (vars: TVars) => Promise<unknown>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: buildRequest,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.manutencoes });
    },
  });
}

/** Equipe de compras avalia — POST /api/manutencoes/:id/avaliar. */
export function useAvaliarManutencao() {
  return useManutencaoAction(({ id, input }: { id: string; input: AvaliarInput }) =>
    api.post(`/api/manutencoes/${id}/avaliar`, input),
  );
}

/** Gerência aprova — POST /api/manutencoes/:id/aprovar. */
export function useAprovarManutencao() {
  return useManutencaoAction((id: string) =>
    api.post(`/api/manutencoes/${id}/aprovar`, {}),
  );
}

/** Gerência rejeita — POST /api/manutencoes/:id/rejeitar. */
export function useRejeitarManutencao() {
  return useManutencaoAction(({ id, motivo }: { id: string; motivo: string }) =>
    api.post(`/api/manutencoes/${id}/rejeitar`, { motivo }),
  );
}

/** Registra o retorno do equipamento — POST /api/manutencoes/:id/retorno. */
export function useRetornoManutencao() {
  return useManutencaoAction(({ id, input }: { id: string; input: RetornoInput }) =>
    api.post(`/api/manutencoes/${id}/retorno`, input),
  );
}

/** Cancela a manutenção — POST /api/manutencoes/:id/cancelar. */
export function useCancelarManutencao() {
  return useManutencaoAction((id: string) =>
    api.post(`/api/manutencoes/${id}/cancelar`, {}),
  );
}
