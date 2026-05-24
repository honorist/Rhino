/**
 * Formatação e parsing de moeda (BRL) — porte dos helpers do store.js.
 * Funções puras: a máscara por perfil de permissão é aplicada na camada de
 * UI (hook), não aqui.
 */

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 1234.56 → "R$ 1.234,56" */
export function formatBRL(value: number): string {
  return brlFormatter.format(Number.isFinite(value) ? value : 0);
}

/** Abreviado para KPIs: 1234567 → "R$ 1,23M" · 12345 → "R$ 12k" */
export function formatBRLk(value: number): string {
  const v = Number(value) || 0;
  const sign = v < 0 ? '−' : '';
  const abs = Math.abs(v);
  const fmt = (n: number, decimals: number): string =>
    n.toLocaleString('pt-BR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });

  if (abs >= 1_000_000_000) return `${sign}R$ ${fmt(abs / 1_000_000_000, 2)}B`;
  if (abs >= 1_000_000) return `${sign}R$ ${fmt(abs / 1_000_000, 2)}M`;
  if (abs >= 10_000) return `${sign}R$ ${fmt(abs / 1_000, 0)}k`;
  if (abs >= 1_000) return `${sign}R$ ${fmt(abs / 1_000, 1)}k`;
  return `${sign}R$ ${fmt(abs, 2)}`;
}

/** "R$ 1.234,56" / "1234,56" / "1234.56" → 1234.56 (NaN-safe → 0) */
export function parseBRL(input: string | number): number {
  if (typeof input === 'number') return Number.isFinite(input) ? input : 0;
  if (!input) return 0;

  const cleaned = input
    .replace(/[^\d,.-]/g, '') // remove "R$", espaços, etc.
    .replace(/\.(?=\d{3}(\D|$))/g, '') // remove separador de milhar
    .replace(',', '.'); // vírgula decimal → ponto

  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : 0;
}
