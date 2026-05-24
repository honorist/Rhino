import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';
import type { RdosResponse } from './types';

/**
 * Visão global de RDOs — `GET /api/rdos` devolve `{ rdos, stats }` numa só
 * resposta (lista flat + estatísticas de aderência). Read-only: a criação/
 * edição de RDOs vive no subsistema de Contratos (Onda E).
 */
export function useRdos() {
  return useQuery({
    queryKey: queryKeys.rdos,
    queryFn: () => api.get<RdosResponse>('/api/rdos'),
  });
}
