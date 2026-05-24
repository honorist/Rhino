import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';
import type { DocTemplate, DocumentoValidacao } from '../../types/domain';

/**
 * Dados da tela de Documentação. Os documentos vivem aninhados em `recursos`;
 * as mutações de documento devolvem a coleção `recursos` inteira, então
 * invalidamos `queryKeys.recursos`.
 */

interface DocTemplatesResponse {
  templates: DocTemplate[];
}

/** Templates de documento — GET /api/doc-templates. */
export function useDocTemplates() {
  return useQuery({
    queryKey: queryKeys.docTemplates,
    queryFn: () => api.get<DocTemplatesResponse>('/api/doc-templates'),
    select: (data) => data.templates ?? [],
  });
}

/** Payload de criação/edição de documento. */
export interface DocumentoInput {
  tipo: string;
  tipoLabel: string;
  templateId?: string;
  dataEmissao: string;
  dataVencimento: string;
  responsavel: string;
  resultado: string;
  observacoes: string;
}

interface RecursosResponse {
  recursos: { id: string; documentos?: { id: string }[] }[];
}

function useRecursosMutation<TVars, TData>(
  buildRequest: (vars: TVars) => Promise<TData>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: buildRequest,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.recursos });
    },
  });
}

/** Cria documento — POST /api/recursos/:id/documentos. */
export function useAddDocumento() {
  return useRecursosMutation(
    ({ recursoId, input }: { recursoId: string; input: DocumentoInput }) =>
      api.post<RecursosResponse>(
        `/api/recursos/${recursoId}/documentos`,
        input,
      ),
  );
}

/** Edita documento — PUT /api/recursos/:id/documentos/:docId. */
export function useUpdateDocumento() {
  return useRecursosMutation(
    ({
      recursoId,
      docId,
      input,
    }: {
      recursoId: string;
      docId: string;
      input: DocumentoInput;
    }) =>
      api.put<RecursosResponse>(
        `/api/recursos/${recursoId}/documentos/${docId}`,
        input,
      ),
  );
}

/** Exclui documento — DELETE /api/recursos/:id/documentos/:docId. */
export function useDeleteDocumento() {
  return useRecursosMutation(
    ({ recursoId, docId }: { recursoId: string; docId: string }) =>
      api.delete(`/api/recursos/${recursoId}/documentos/${docId}`),
  );
}

/** Remove o arquivo anexado — DELETE .../documentos/:docId/arquivo. */
export function useRemoverArquivoDoc() {
  return useRecursosMutation(
    ({ recursoId, docId }: { recursoId: string; docId: string }) =>
      api.delete(`/api/recursos/${recursoId}/documentos/${docId}/arquivo`),
  );
}

interface ValidacaoResponse {
  validacao: DocumentoValidacao;
}

/** Valida o documento via IA — POST .../documentos/:docId/validar. */
export function useValidarDocumento() {
  return useRecursosMutation(
    ({ recursoId, docId }: { recursoId: string; docId: string }) =>
      api.post<ValidacaoResponse>(
        `/api/recursos/${recursoId}/documentos/${docId}/validar`,
        {},
      ),
  );
}
