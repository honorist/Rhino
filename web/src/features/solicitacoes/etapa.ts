/**
 * Configuração de etapas e parsing de itens — apoio à tela de Solicitações
 * de Compra. Porte de `_etapaCfg` de SolicitacoesCompra.js.
 */
import type { SolItem } from '../../types/domain';

export interface EtapaCfg {
  bg: string;
  color: string;
  label: string;
}

export const ETAPA_CFG: Record<string, EtapaCfg> = {
  pendente_avaliacao: {
    bg: '#FEF3C7',
    color: '#92400E',
    label: '🟡 Aguardando equipe de compras',
  },
  pendente_aprovacao: {
    bg: '#FED7AA',
    color: '#9A3412',
    label: '🟠 Aguardando gerente',
  },
  aprovada: {
    bg: '#DBEAFE',
    color: '#1E40AF',
    label: '🔵 Aprovada · aguardando compra',
  },
  comprada: {
    bg: '#E0E7FF',
    color: '#3730A3',
    label: '📦 Comprada · aguardando entrega',
  },
  recebida: { bg: '#D1FAE5', color: '#065F46', label: '✅ Recebida' },
  rejeitada: { bg: '#FEE2E2', color: '#991B1B', label: '❌ Rejeitada' },
  cancelada: { bg: '#F3F4F6', color: '#6B7280', label: '🚫 Cancelada' },
};

/** Configuração visual de uma etapa. */
export function etapaCfg(status: string): EtapaCfg {
  return (
    ETAPA_CFG[status] ?? { bg: '#F3F4F6', color: '#6B7280', label: status || '—' }
  );
}

/** Data + hora curta em pt-BR (ex.: "22/05/2026 14:30"). */
export function fmtDataHora(value?: string): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString('pt-BR')} ${d
    .toLocaleTimeString('pt-BR')
    .slice(0, 5)}`;
}

/** Itens podem vir como array ou string JSON do backend — normaliza. */
export function parseItens(itens: unknown): SolItem[] {
  if (Array.isArray(itens)) return itens as SolItem[];
  if (typeof itens === 'string') {
    try {
      return JSON.parse(itens) as SolItem[];
    } catch {
      return [];
    }
  }
  return [];
}
