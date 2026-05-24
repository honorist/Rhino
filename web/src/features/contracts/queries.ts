import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';
import type {
  Atividade,
  Contract,
  ContractInput,
  Saida,
  SaidaInput,
} from './types';

/**
 * Domínio Contratos — caso especial: o endpoint `/api/contracts` devolve
 * contratos E saídas numa só resposta, e as mutações também afetam notas
 * fiscais. Por isso não usa a fábrica `createResource`.
 */

interface ContractsResponse {
  contracts: Contract[];
  saidas: Saida[];
  notas_fiscais?: unknown[];
}

const fetchContracts = (): Promise<ContractsResponse> =>
  api.get<ContractsResponse>('/api/contracts');

/** Query crua — `{ contracts, saidas }` numa só chamada (como no store.js). */
export function useContractsData() {
  return useQuery({ queryKey: queryKeys.contracts, queryFn: fetchContracts });
}

/** Apenas a lista de contratos. */
export function useContracts() {
  return useQuery({
    queryKey: queryKeys.contracts,
    queryFn: fetchContracts,
    select: (data) => data.contracts ?? [],
  });
}

/** Apenas as saídas (despesas) de todos os contratos. */
export function useSaidas() {
  return useQuery({
    queryKey: queryKeys.contracts,
    queryFn: fetchContracts,
    select: (data) => data.saidas ?? [],
  });
}

/** Base comum das mutações de contrato: invalida contratos + notas fiscais. */
function useContractsMutation<TVars>(mutationFn: (vars: TVars) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.contracts });
      void qc.invalidateQueries({ queryKey: queryKeys.notasFiscais });
    },
  });
}

export function useCreateContract() {
  return useContractsMutation((input: ContractInput) =>
    api.post('/api/contracts', input),
  );
}

export function useUpdateContract() {
  return useContractsMutation(({ id, input }: { id: string; input: ContractInput }) =>
    api.put(`/api/contracts/${id}`, input),
  );
}

export function useDeleteContract() {
  return useContractsMutation((id: string) => api.delete(`/api/contracts/${id}`));
}

export function useCreateSaida() {
  return useContractsMutation(
    ({ contractId, input }: { contractId: string; input: SaidaInput }) =>
      api.post(`/api/contracts/${contractId}/saidas`, input),
  );
}

export function useUpdateSaida() {
  return useContractsMutation(({ id, input }: { id: string; input: SaidaInput }) =>
    api.put(`/api/saidas/${id}`, input),
  );
}

export function useDeleteSaida() {
  return useContractsMutation((id: string) => api.delete(`/api/saidas/${id}`));
}

/** Payload de um item de orçamento. */
export interface BudgetItemInput {
  description: string;
  type: string;
  value: number;
  notes: string;
}

/** Cria item de orçamento — POST /api/contracts/:id/budget. */
export function useCreateBudgetItem() {
  return useContractsMutation(
    ({ contractId, input }: { contractId: string; input: BudgetItemInput }) =>
      api.post(`/api/contracts/${contractId}/budget`, input),
  );
}

/** Edita item de orçamento — PUT /api/contracts/:id/budget/:budgetId. */
export function useUpdateBudgetItem() {
  return useContractsMutation(
    ({
      contractId,
      budgetId,
      input,
    }: {
      contractId: string;
      budgetId: string;
      input: BudgetItemInput;
    }) => api.put(`/api/contracts/${contractId}/budget/${budgetId}`, input),
  );
}

/** Exclui item de orçamento — DELETE /api/contracts/:id/budget/:budgetId. */
export function useDeleteBudgetItem() {
  return useContractsMutation(
    ({ contractId, budgetId }: { contractId: string; budgetId: string }) =>
      api.delete(`/api/contracts/${contractId}/budget/${budgetId}`),
  );
}

// ── Aditivos / Marcos / Ocorrências (aninhados no contrato) ──

/** Cria um sub-recurso do contrato — POST /api/contracts/:id/<path>. */
function useCriarSub<TInput>(path: string) {
  return useContractsMutation(
    ({ contractId, input }: { contractId: string; input: TInput }) =>
      api.post(`/api/contracts/${contractId}/${path}`, input),
  );
}
/** Edita um sub-recurso — PUT /api/contracts/:id/<path>/:itemId. */
function useEditarSub<TInput>(path: string) {
  return useContractsMutation(
    ({
      contractId,
      itemId,
      input,
    }: {
      contractId: string;
      itemId: string;
      input: TInput;
    }) => api.put(`/api/contracts/${contractId}/${path}/${itemId}`, input),
  );
}
/** Exclui um sub-recurso — DELETE /api/contracts/:id/<path>/:itemId. */
function useExcluirSub(path: string) {
  return useContractsMutation(
    ({ contractId, itemId }: { contractId: string; itemId: string }) =>
      api.delete(`/api/contracts/${contractId}/${path}/${itemId}`),
  );
}

/** Payload de aditivo. */
export interface AditivoInput {
  numero: string;
  tipo: string;
  descricao: string;
  valorDelta: number;
  diasDelta: number;
  data: string;
  aprovado: boolean;
}
export const useCreateAditivo = () => useCriarSub<AditivoInput>('aditivos');
export const useUpdateAditivo = () => useEditarSub<AditivoInput>('aditivos');
export const useDeleteAditivo = () => useExcluirSub('aditivos');

/** Payload de marco. */
export interface MarcoInput {
  titulo?: string;
  descricao?: string;
  prazo?: string;
  ordem?: number;
  concluido?: boolean;
}
export const useCreateMarco = () => useCriarSub<MarcoInput>('marcos');
export const useUpdateMarco = () => useEditarSub<MarcoInput>('marcos');
export const useDeleteMarco = () => useExcluirSub('marcos');

/** Payload de ocorrência. */
export interface OcorrenciaInput {
  data: string;
  tipo: string;
  severidade: string;
  descricao: string;
  encerrada: boolean;
}
export const useCreateOcorrencia = () =>
  useCriarSub<OcorrenciaInput>('ocorrencias');
export const useUpdateOcorrencia = () =>
  useEditarSub<OcorrenciaInput>('ocorrencias');
export const useDeleteOcorrencia = () => useExcluirSub('ocorrencias');

// ── Organograma — membros da equipe do contrato ──

/** Payload de um membro do organograma. */
export interface MembroOrgInput {
  recursoId: string;
  nivel: string;
  cargo: string;
  supervisorId: string | null;
  area: string | null;
}

/** Cria membro do organograma — POST /api/contracts/:id/organograma. */
export function useCreateMembroOrg() {
  return useContractsMutation(
    ({ contractId, input }: { contractId: string; input: MembroOrgInput }) =>
      api.post(`/api/contracts/${contractId}/organograma`, input),
  );
}

/** Edita membro — PUT /api/contracts/:id/organograma/:membroId. */
export function useUpdateMembroOrg() {
  return useContractsMutation(
    ({
      contractId,
      membroId,
      input,
    }: {
      contractId: string;
      membroId: string;
      input: MembroOrgInput;
    }) =>
      api.put(`/api/contracts/${contractId}/organograma/${membroId}`, input),
  );
}

/** Exclui membro — DELETE /api/contracts/:id/organograma/:membroId. */
export function useDeleteMembroOrg() {
  return useContractsMutation(
    ({ contractId, membroId }: { contractId: string; membroId: string }) =>
      api.delete(`/api/contracts/${contractId}/organograma/${membroId}`),
  );
}

// ── RDO — Relatórios Diários de Obra (aninhados em Contract.rdos) ──

/** Cria um RDO — POST /api/contracts/:id/rdos. */
export function useCreateRdo() {
  return useContractsMutation(
    ({ contractId, input }: { contractId: string; input: unknown }) =>
      api.post(`/api/contracts/${contractId}/rdos`, input),
  );
}

/** Edita um RDO — PUT /api/contracts/:id/rdos/:rdoId. */
export function useUpdateRdo() {
  return useContractsMutation(
    ({
      contractId,
      rdoId,
      input,
    }: {
      contractId: string;
      rdoId: string;
      input: unknown;
    }) => api.put(`/api/contracts/${contractId}/rdos/${rdoId}`, input),
  );
}

/** Exclui um RDO — DELETE /api/contracts/:id/rdos/:rdoId. */
export function useDeleteRdo() {
  return useContractsMutation(
    ({ contractId, rdoId }: { contractId: string; rdoId: string }) =>
      api.delete(`/api/contracts/${contractId}/rdos/${rdoId}`),
  );
}

// ── Cronograma — etapas/atividades do contrato ──

interface AtividadesResponse {
  atividades: Atividade[];
}

/** Etapas do cronograma — GET /api/contracts/:id/atividades. */
export function useAtividades(contractId: string) {
  return useQuery({
    queryKey: queryKeys.atividades(contractId),
    queryFn: () =>
      api.get<AtividadesResponse>(`/api/contracts/${contractId}/atividades`),
    select: (data) => data.atividades ?? [],
  });
}

/** Payload de uma etapa do cronograma. */
export interface AtividadeInput {
  nome: string;
  dataInicioPlan: string | null;
  dataFimPlan: string | null;
  pesoPct: number;
  execPct: number;
  custoPlan: number;
  notas: string;
}

function useAtividadeMutation<TVars>(
  contractId: string,
  buildRequest: (vars: TVars) => Promise<unknown>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: buildRequest,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.atividades(contractId) });
    },
  });
}

/** Cria etapa — POST /api/contracts/:id/atividades. */
export function useCreateAtividade(contractId: string) {
  return useAtividadeMutation(contractId, (input: AtividadeInput) =>
    api.post(`/api/contracts/${contractId}/atividades`, input),
  );
}

/** Edita etapa — PUT /api/contracts/:id/atividades/:atividadeId. */
export function useUpdateAtividade(contractId: string) {
  return useAtividadeMutation(
    contractId,
    ({ id, input }: { id: string; input: AtividadeInput }) =>
      api.put(`/api/contracts/${contractId}/atividades/${id}`, input),
  );
}

/** Exclui etapa — DELETE /api/contracts/:id/atividades/:atividadeId. */
export function useDeleteAtividade(contractId: string) {
  return useAtividadeMutation(contractId, (id: string) =>
    api.delete(`/api/contracts/${contractId}/atividades/${id}`),
  );
}
