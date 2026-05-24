import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';

/**
 * Alocação de item da BASE a um contrato — POST /api/base/:id/allocate.
 * Afeta base, caixa e contratos; invalida as três queries.
 */
export function useAllocateBase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      contractId,
      value,
    }: {
      id: string;
      contractId: string;
      value: number;
    }) => api.post(`/api/base/${id}/allocate`, { contractId, value }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.base });
      void qc.invalidateQueries({ queryKey: queryKeys.caixa });
      void qc.invalidateQueries({ queryKey: queryKeys.contracts });
    },
  });
}
