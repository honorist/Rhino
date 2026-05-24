/**
 * Núcleo do organograma da obra — rótulos, cores e dedução de nível.
 * Porte de helpers de contrato/organograma.js e ContratoDetail.js.
 */
import type { NivelOrg } from './types';

/** Rótulo legível de cada nível hierárquico. */
export const NIVEL_LABEL: Record<NivelOrg, string> = {
  encarregado: 'Encarregado',
  lider_area: 'Líder de Área',
  profissional: 'Profissional',
};

/** Cor de cada nível (paleta Akaunting). */
export const NIVEL_COR: Record<NivelOrg, string> = {
  encarregado: '#55588B',
  lider_area: '#6D9480',
  profissional: '#9CA3AF',
};

/** Ordem de exibição dos níveis (encarregado primeiro). */
export const NIVEL_ORDEM: Record<NivelOrg, number> = {
  encarregado: 0,
  lider_area: 1,
  profissional: 2,
};

/**
 * Deduz o nível hierárquico a partir da profissão cadastrada no recurso.
 * "encarregado" → Encarregado; "líder/supervisor/coordenador" → Líder de Área;
 * caso contrário → Profissional.
 */
export function inferirNivelOrganograma(profissao: unknown): NivelOrg {
  const p = String(profissao ?? '')
    .toLowerCase()
    .trim();
  if (!p) return 'profissional';
  if (p.includes('encarregado')) return 'encarregado';
  if (
    p.includes('líder') ||
    p.includes('lider') ||
    p.includes('supervisor') ||
    p.includes('coordenador')
  ) {
    return 'lider_area';
  }
  return 'profissional';
}

/** Iniciais (1-2 letras) de um nome, para o avatar. */
export function iniciais(nome: string): string {
  const parts = (nome || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
