import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';

/**
 * Mutações de folgas e passagens — sub-recursos do colaborador. O CRUD do
 * recurso em si vem de `features/resources.ts`.
 */

/** Payload de registro de folga. */
export interface FolgaInput {
  dataInicio: string;
  dataFim: string;
  observacoes: string;
}

/** Payload de compra de passagem. */
export interface PassagemInput {
  tipo: 'ida' | 'volta';
  companhia: string;
  numeroVoo: string;
  origem: string;
  destino: string;
  dataVoo: string;
  horario: string;
  valor: number;
  dataCompra: string;
  financiadoPor: 'caixa' | 'contrato';
  contractIdPagador: string | null;
  tipoLancamento: 'caixa_direto' | 'conta_pagar';
}

function useRecursosMutation<TVars>(
  buildRequest: (vars: TVars) => Promise<unknown>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: buildRequest,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.recursos });
    },
  });
}

/** Registra uma folga — POST /api/recursos/:id/folgas. */
export function useAddFolga() {
  return useRecursosMutation(
    ({ recursoId, input }: { recursoId: string; input: FolgaInput }) =>
      api.post(`/api/recursos/${recursoId}/folgas`, input),
  );
}

/** Remove uma folga — DELETE /api/recursos/:id/folgas/:folgaId. */
export function useDeleteFolga() {
  return useRecursosMutation(
    ({ recursoId, folgaId }: { recursoId: string; folgaId: string }) =>
      api.delete(`/api/recursos/${recursoId}/folgas/${folgaId}`),
  );
}

/** Compra a passagem de uma folga — POST .../folgas/:folgaId/passagem. */
export function useComprarPassagem() {
  return useRecursosMutation(
    ({
      recursoId,
      folgaId,
      input,
    }: {
      recursoId: string;
      folgaId: string;
      input: PassagemInput;
    }) =>
      api.post(
        `/api/recursos/${recursoId}/folgas/${folgaId}/passagem`,
        input,
      ),
  );
}
