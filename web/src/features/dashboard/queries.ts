import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';
import type { RdosResponse } from '../rdos/types';

/**
 * Dados agregados do dashboard. A estrutura detalhada será tipada ao migrar
 * Dashboard.js na Fase 3.
 */
export type DashboardData = Record<string, unknown>;

/** GET /api/dashboard — aceita filtros opcionais (período, etc.) via querystring. */
export function useDashboard(params?: Record<string, string>) {
  const query = params ? `?${new URLSearchParams(params).toString()}` : '';
  return useQuery({
    queryKey: queryKeys.dashboard(params),
    queryFn: () => api.get<DashboardData>(`/api/dashboard${query}`),
  });
}

/**
 * GET /api/rdos — estatísticas de aderência (reuso do mesmo endpoint que
 * features/rdos/queries.ts usa, mas com chave própria para não conflitar
 * com pré-carregamento de outras telas).
 */
export function useRdosDashboard() {
  return useQuery({
    queryKey: ['rdos-dashboard'],
    queryFn: () => api.get<RdosResponse>('/api/rdos'),
    staleTime: 60_000,
  });
}
