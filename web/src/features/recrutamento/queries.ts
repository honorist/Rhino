import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type {
  AntecedentesStatus,
  Candidato,
  CandidatoStatus,
  DocumentoAnexo,
  Solicitacao,
  SolicitacaoInput,
  TipoDocumento,
} from './types';

const KEY = ['recrutamento'] as const;
const KEY_SOL = (id: string) => [...KEY, 'solicitacao', id] as const;
const KEY_NOTIF = ['notificacoes'] as const;

// ─── Solicitações ───
interface ListResponse {
  solicitacoes: Solicitacao[];
}
interface SingleResponse {
  solicitacao: Solicitacao;
}

export function useSolicitacoes(filtroStatus?: string) {
  return useQuery({
    queryKey: [...KEY, 'lista', filtroStatus ?? 'todas'] as const,
    queryFn: () => {
      const q = filtroStatus ? `?status=${filtroStatus}` : '';
      return api.get<ListResponse>(`/api/recrutamento/solicitacoes${q}`);
    },
  });
}

export function useSolicitacao(id: string | undefined) {
  return useQuery({
    queryKey: id ? KEY_SOL(id) : ([...KEY, 'noop'] as const),
    queryFn: () => api.get<SingleResponse>(`/api/recrutamento/solicitacoes/${id}`),
    enabled: !!id,
  });
}

export function useCriarSolicitacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SolicitacaoInput) =>
      api.post<SingleResponse>('/api/recrutamento/solicitacoes', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useCancelarSolicitacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<SingleResponse>(`/api/recrutamento/solicitacoes/${id}/cancelar`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

// ─── Candidatos ───
interface CandidatoResponse {
  candidato: Candidato;
}

export function useAdicionarCandidato(solicitacaoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      vagaId,
      input,
    }: {
      vagaId: string;
      input: Pick<Candidato, 'nome'> & Partial<Pick<Candidato, 'cpf' | 'telefone' | 'email' | 'observacoes' | 'status'>>;
    }) =>
      api.post<CandidatoResponse>(
        `/api/recrutamento/vagas/${vagaId}/candidatos`,
        input,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY_SOL(solicitacaoId) }),
  });
}

export function useAtualizarTriagem(solicitacaoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      candidatoId,
      status,
      observacoes,
    }: {
      candidatoId: string;
      status: CandidatoStatus;
      observacoes?: string;
    }) =>
      // PATCH não está exposto em api.ts — usa fetch direto
      fetch(`/api/recrutamento/candidatos/${candidatoId}/triagem`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, observacoes }),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.text()) || 'HTTP ' + r.status);
        return r.json() as Promise<CandidatoResponse>;
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY_SOL(solicitacaoId) }),
  });
}

export function useAtualizarAntecedentes(solicitacaoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      candidatoId,
      resultado,
      documento,
    }: {
      candidatoId: string;
      resultado: AntecedentesStatus;
      documento?: DocumentoAnexo;
    }) =>
      fetch(`/api/recrutamento/candidatos/${candidatoId}/antecedentes`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resultado, documento }),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.text()) || 'HTTP ' + r.status);
        return r.json() as Promise<CandidatoResponse>;
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY_SOL(solicitacaoId) }),
  });
}

export function useAnexarDocumento(solicitacaoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      candidatoId,
      tipo,
      documento,
    }: {
      candidatoId: string;
      tipo: TipoDocumento;
      documento: { filename: string; storagePath: string; mimeType?: string; size?: number };
    }) =>
      api.post<CandidatoResponse>(
        `/api/recrutamento/candidatos/${candidatoId}/documentos/${tipo}`,
        documento,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY_SOL(solicitacaoId) }),
  });
}

export function useAprovarCandidato(solicitacaoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (candidatoId: string) =>
      api.post<{ candidato: Candidato; recurso: { id: string } }>(
        `/api/recrutamento/candidatos/${candidatoId}/aprovar`,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY_SOL(solicitacaoId) });
      qc.invalidateQueries({ queryKey: ['recursos'] });
    },
  });
}

// ─── Notificações ───
export interface Notificacao {
  id: string;
  destinatario: string;
  tipo: string;
  titulo: string;
  mensagem?: string | null;
  link?: string | null;
  lida: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
  readAt?: string | null;
}

export function useNotificacoes() {
  return useQuery({
    queryKey: KEY_NOTIF,
    queryFn: () =>
      api.get<{ notificacoes: Notificacao[] }>('/api/notificacoes'),
    refetchInterval: 60_000,
  });
}

export function useMarcarLida() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ notificacao: Notificacao }>(`/api/notificacoes/${id}/marcar-lida`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY_NOTIF }),
  });
}
