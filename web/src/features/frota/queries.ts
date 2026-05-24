import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';

/**
 * Mutações dos sub-recursos do veículo — planos de manutenção e histórico de
 * manutenções. O CRUD do veículo em si vem de `features/resources.ts`
 * (useVeiculos / useCreateVeiculo / ...).
 */

/** Payload de um plano de manutenção. */
export interface PlanoInput {
  descricao: string;
  intervaloKm: number | null;
  intervaloMeses: number | null;
  ultimoKm: number | null;
  ultimaData: string | null;
}

/** Payload de uma manutenção registrada. */
export interface ManutencaoInput {
  data: string;
  tipo: string;
  planoId: string | null;
  descricao: string;
  observacoes: string;
  km: number | null;
  custo: number;
  fornecedorId: string | null;
}

function useVeiculoMutation<TVars>(
  buildRequest: (vars: TVars) => Promise<unknown>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: buildRequest,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.veiculos });
    },
  });
}

/** Cria um plano — POST /api/veiculos/:id/planos. */
export function useCriarPlano() {
  return useVeiculoMutation(
    ({ veiculoId, input }: { veiculoId: string; input: PlanoInput }) =>
      api.post(`/api/veiculos/${veiculoId}/planos`, input),
  );
}

/** Edita um plano — PUT /api/veiculos/:id/planos/:planoId. */
export function useEditarPlano() {
  return useVeiculoMutation(
    ({
      veiculoId,
      planoId,
      input,
    }: {
      veiculoId: string;
      planoId: string;
      input: PlanoInput;
    }) => api.put(`/api/veiculos/${veiculoId}/planos/${planoId}`, input),
  );
}

/** Remove um plano — DELETE /api/veiculos/:id/planos/:planoId. */
export function useDeletarPlano() {
  return useVeiculoMutation(
    ({ veiculoId, planoId }: { veiculoId: string; planoId: string }) =>
      api.delete(`/api/veiculos/${veiculoId}/planos/${planoId}`),
  );
}

/** Registra uma manutenção — POST /api/veiculos/:id/manutencoes. */
export function useCriarManutencaoVeiculo() {
  return useVeiculoMutation(
    ({ veiculoId, input }: { veiculoId: string; input: ManutencaoInput }) =>
      api.post(`/api/veiculos/${veiculoId}/manutencoes`, input),
  );
}

/** Remove uma manutenção — DELETE /api/veiculos/:id/manutencoes/:manutId. */
export function useDeletarManutencaoVeiculo() {
  return useVeiculoMutation(
    ({ veiculoId, manutId }: { veiculoId: string; manutId: string }) =>
      api.delete(`/api/veiculos/${veiculoId}/manutencoes/${manutId}`),
  );
}
