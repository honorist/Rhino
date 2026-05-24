import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';
import type { AiUsageStats, CobrancaHistorico, CobrancaMes } from './types';

/**
 * Hooks de dados de Cobrança Mensal — três endpoints somente-leitura.
 * A tela é exibida apenas para administradores (filtro de aba no backend).
 */

/** Histórico de meses fechados — GET /api/cobranca-mensal/historico. */
export function useCobrancaHistorico() {
  return useQuery({
    queryKey: queryKeys.cobrancaHistorico,
    queryFn: () => api.get<CobrancaHistorico>('/api/cobranca-mensal/historico'),
    select: (data) => data.meses ?? [],
  });
}

/** Projeção parcial do mês corrente — GET /api/cobranca-mensal/projecao-atual. */
export function useCobrancaProjecao() {
  return useQuery({
    queryKey: queryKeys.cobrancaProjecao,
    queryFn: () =>
      api.get<CobrancaMes | null>('/api/cobranca-mensal/projecao-atual'),
  });
}

/**
 * Uso da API Claude — GET /api/ai-usage/stats. Indisponibilidade é tolerada
 * (a tela apenas omite o card), então não retenta em caso de falha.
 */
export function useAiUsage() {
  return useQuery({
    queryKey: queryKeys.aiUsage,
    queryFn: () => api.get<AiUsageStats | null>('/api/ai-usage/stats'),
    retry: false,
  });
}
