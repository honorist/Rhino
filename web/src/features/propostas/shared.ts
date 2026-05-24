/**
 * Constantes e helpers do domínio Propostas compartilhados entre a lista
 * (Propostas.tsx) e o editor (PropostaDetail.tsx).
 */
import type { Proposta } from '../../types/domain';

export const STATUS_LABELS: Record<string, string> = {
  rascunho: 'Rascunho',
  enviada: 'Enviada',
  aceita: 'Aceita',
  rejeitada: 'Rejeitada',
  expirada: 'Expirada',
};

export interface StatusColor {
  bg: string;
  fg: string;
  border: string;
}

export const STATUS_COLORS: Record<string, StatusColor> = {
  rascunho: { bg: 'rgba(148,163,184,.18)', fg: '#64748b', border: 'rgba(148,163,184,.40)' },
  enviada: { bg: 'rgba(59,130,246,.18)', fg: '#3b82f6', border: 'rgba(59,130,246,.40)' },
  aceita: { bg: 'rgba(16,185,129,.18)', fg: '#10b981', border: 'rgba(16,185,129,.40)' },
  rejeitada: { bg: 'rgba(220,38,38,.18)', fg: '#dc2626', border: 'rgba(220,38,38,.40)' },
  expirada: { bg: 'rgba(245,158,11,.18)', fg: '#f59e0b', border: 'rgba(245,158,11,.40)' },
};

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Número formatado da proposta: PC_007-25 Rev.01. */
export function numeroCompleto(p: Proposta): string {
  const rev = (p.revisao ?? 0) > 0 ? ` Rev.${pad2(p.revisao ?? 0)}` : '';
  return `PC_${p.numero}-${pad2(p.ano)}${rev}`;
}
