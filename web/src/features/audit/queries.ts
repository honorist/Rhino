import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';
import type { AuditFilters, AuditResponse } from './types';

/**
 * Busca de eventos de auditoria — `GET /api/audit` com filtros e paginação.
 * `keepPreviousData` evita o flicker de "carregando" ao paginar/filtrar.
 */
export function useAudit(
  filters: AuditFilters,
  page: number,
  pageSize: number,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  params.set('limit', String(pageSize));
  params.set('offset', String(page * pageSize));
  const qs = params.toString();

  return useQuery({
    queryKey: queryKeys.audit({ ...filters, page: String(page) }),
    queryFn: () => api.get<AuditResponse>(`/api/audit?${qs}`),
    placeholderData: keepPreviousData,
  });
}
