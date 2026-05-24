import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';

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
