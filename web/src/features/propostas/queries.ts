import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';
import type { Proposta } from '../../types/domain';
import type { CustoCategoria, PropostaDetalhe, PropostaPatch } from './types';
import { normalizeProposta } from './types';

/**
 * Hooks de dados do domínio Propostas. Criar/aceitar mexem em contratos
 * (contrato em prospecção vinculado), então invalidam as duas slices.
 */

interface PropostaResponse {
  proposta: Proposta;
}

/** Detalhe de uma proposta — GET /api/propostas/:id. */
export function useProposta(id: string | undefined) {
  return useQuery({
    queryKey: [...queryKeys.propostas, id],
    queryFn: () => api.get<PropostaResponse>(`/api/propostas/${id}`),
    select: (data): PropostaDetalhe => normalizeProposta(data.proposta),
    enabled: Boolean(id),
  });
}

function useInvalidatePropostas() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: queryKeys.propostas });
  };
}

export interface CriarPropostaInput {
  clienteId: string;
  titulo: string;
  referencia: string | null;
  tipo: string;
}

/** Cria proposta + contrato em prospecção — POST /api/propostas. */
export function useCriarProposta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CriarPropostaInput) =>
      api.post<PropostaResponse>('/api/propostas', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.propostas });
      void qc.invalidateQueries({ queryKey: queryKeys.contracts });
    },
  });
}

/** Nova revisão — POST /api/propostas/:id/duplicar. */
export function useDuplicarProposta() {
  const invalidate = useInvalidatePropostas();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<PropostaResponse>(`/api/propostas/${id}/duplicar`),
    onSuccess: invalidate,
  });
}

/** Exclui a proposta — DELETE /api/propostas/:id. */
export function useDeletarProposta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/propostas/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.propostas });
      void qc.invalidateQueries({ queryKey: queryKeys.contracts });
    },
  });
}

/** Atualiza campos da proposta — PUT /api/propostas/:id. */
export function useUpdateProposta() {
  const invalidate = useInvalidatePropostas();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<Proposta> }) =>
      api.put<PropostaResponse>(`/api/propostas/${id}`, input),
    onSuccess: invalidate,
  });
}

/**
 * Autosave do editor — PUT /api/propostas/:id sem invalidar o detalhe.
 *
 * O estado local do editor é a fonte da verdade enquanto a aba está aberta;
 * refazer o GET a cada salvamento sobrescreveria edições não-flushadas. Por
 * isso invalidamos apenas a query de LISTA (`exact: true`), para que voltar
 * à tela de Propostas mostre valor/título atualizados.
 */
export function useAutosaveProposta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: PropostaPatch }) =>
      api.put<PropostaResponse>(`/api/propostas/${id}`, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.propostas, exact: true });
    },
  });
}

/** Marca a proposta como enviada — POST /api/propostas/:id/enviar. */
export function useEnviarProposta() {
  const invalidate = useInvalidatePropostas();
  return useMutation({
    mutationFn: (id: string) => api.post(`/api/propostas/${id}/enviar`),
    onSuccess: invalidate,
  });
}

/** Aceita a proposta — POST /api/propostas/:id/aceitar. */
export function useAceitarProposta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/api/propostas/${id}/aceitar`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.propostas });
      void qc.invalidateQueries({ queryKey: queryKeys.contracts });
    },
  });
}

/** Rejeita a proposta — POST /api/propostas/:id/rejeitar. */
export function useRejeitarProposta() {
  const invalidate = useInvalidatePropostas();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) =>
      api.post(`/api/propostas/${id}/rejeitar`, { motivo }),
    onSuccess: invalidate,
  });
}

// ── Custos internos (privados) ──
// Os endpoints de custo devolvem a proposta inteira atualizada; o editor
// aplica `proposta.custos` no estado local sem passar pelo autosave.

export interface CustoInput {
  categoria?: CustoCategoria;
  descricao?: string;
  valor?: number;
  percentual?: number | null;
}

/** Cria item de custo — POST /api/propostas/:id/custos. */
export function useCriarCusto() {
  return useMutation({
    mutationFn: ({ propostaId, input }: { propostaId: string; input: CustoInput }) =>
      api.post<PropostaResponse>(`/api/propostas/${propostaId}/custos`, input),
  });
}

/** Atualiza item de custo — PUT /api/propostas/:id/custos/:custoId. */
export function useAtualizarCusto() {
  return useMutation({
    mutationFn: ({
      propostaId,
      custoId,
      input,
    }: {
      propostaId: string;
      custoId: string;
      input: CustoInput;
    }) =>
      api.put<PropostaResponse>(
        `/api/propostas/${propostaId}/custos/${custoId}`,
        input,
      ),
  });
}

/** Remove item de custo — DELETE /api/propostas/:id/custos/:custoId. */
export function useDeletarCusto() {
  return useMutation({
    mutationFn: ({ propostaId, custoId }: { propostaId: string; custoId: string }) =>
      api.delete<PropostaResponse>(
        `/api/propostas/${propostaId}/custos/${custoId}`,
      ),
  });
}

// ── Anexos ──

/** Atualiza a legenda de um anexo — PUT /api/propostas/:id/anexos/:anexoId. */
export function useAtualizarAnexo() {
  return useMutation({
    mutationFn: ({
      propostaId,
      anexoId,
      legenda,
    }: {
      propostaId: string;
      anexoId: string;
      legenda: string;
    }) =>
      api.put<PropostaResponse>(
        `/api/propostas/${propostaId}/anexos/${anexoId}`,
        { legenda },
      ),
  });
}

/** Remove um anexo — DELETE /api/propostas/:id/anexos/:anexoId. */
export function useDeletarAnexo() {
  return useMutation({
    mutationFn: ({ propostaId, anexoId }: { propostaId: string; anexoId: string }) =>
      api.delete<PropostaResponse>(
        `/api/propostas/${propostaId}/anexos/${anexoId}`,
      ),
  });
}
