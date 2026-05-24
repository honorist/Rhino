import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';

/** Textos globais da apresentação da empresa (usados em todas as propostas). */
export interface ApresentacaoTextos {
  apresentacao: string;
  casesSucesso: string;
  segurancaSaude: string;
}

/** Logo de cliente exibida na seção de Cases. */
export interface CaseLogo {
  id: string;
  nome: string;
  ordem?: number;
  ativo?: boolean;
}

const VAZIO: ApresentacaoTextos = {
  apresentacao: '',
  casesSucesso: '',
  segurancaSaude: '',
};

/** Textos da apresentação — GET /api/app-settings/proposta_apresentacao. */
export function useApresentacao() {
  return useQuery({
    queryKey: queryKeys.apresentacao,
    queryFn: () =>
      api.get<{ apresentacao?: ApresentacaoTextos }>(
        '/api/app-settings/proposta_apresentacao',
      ),
    select: (data) => data.apresentacao ?? VAZIO,
  });
}

/** Logos de clientes — GET /api/case-logos. */
export function useCaseLogos() {
  return useQuery({
    queryKey: queryKeys.caseLogos,
    queryFn: () => api.get<{ logos?: CaseLogo[] }>('/api/case-logos'),
    select: (data) => data.logos ?? [],
  });
}

/** Salva os textos da apresentação — PUT. */
export function useSaveApresentacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ApresentacaoTextos) =>
      api.put('/api/app-settings/proposta_apresentacao', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.apresentacao });
    },
  });
}

/** Edita uma logo — PUT /api/case-logos/:id. */
export function useUpdateCaseLogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<CaseLogo> }) =>
      api.put(`/api/case-logos/${id}`, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.caseLogos });
    },
  });
}

/** Exclui uma logo — DELETE /api/case-logos/:id. */
export function useDeleteCaseLogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/case-logos/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.caseLogos });
    },
  });
}
