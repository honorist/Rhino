/**
 * Cálculos puros do Boletim de Medição (BM).
 * Núcleo testável separado do PDF (exportBmPdf.ts).
 * Fiel ao js/bm.js antigo.
 */

export interface BmInputs {
  /** Valor total do contrato. */
  contractValue: number;
  /** Valor atribuído a esta medição (preferencialmente o da NF). */
  thisMedicaoValor: number;
  /** Soma das notas fiscais anteriores. */
  valorAnterior: number;
}

export interface BmTotals {
  /** Valor desta medição. */
  valor: number;
  /** Acumulado = anterior + atual. */
  valorAcumulado: number;
  /** Saldo restante (nunca negativo). */
  saldo: number;
  /** % de avanço antes desta medição. */
  pctAnterior: number;
  /** % de avanço desta medição. */
  pctMes: number;
  /** % de avanço total acumulado. */
  pctTotal: number;
}

/** Calcula todos os totais do BM. Idêntico ao bloco de cálculo do bm.js. */
export function calcBm(inp: BmInputs): BmTotals {
  const { contractValue, thisMedicaoValor: valor, valorAnterior } = inp;
  const valorAcumulado = valorAnterior + valor;
  const saldo = Math.max(0, contractValue - valorAcumulado);
  const pctAnterior = contractValue > 0 ? (valorAnterior / contractValue) * 100 : 0;
  const pctMes = contractValue > 0 ? (valor / contractValue) * 100 : 0;
  const pctTotal = contractValue > 0 ? (valorAcumulado / contractValue) * 100 : 0;
  return { valor, valorAcumulado, saldo, pctAnterior, pctMes, pctTotal };
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Formata número como BRL. Vazio/NaN viram R$ 0,00. */
export function fmtBRL(v: unknown): string {
  return brl.format(Number(v) || 0);
}

/** Formata porcentagem com 2 casas e vírgula. */
export function fmtPct(v: unknown): string {
  return (Number(v) || 0).toFixed(2).replace('.', ',') + '%';
}

/** Gera o nome do arquivo PDF. Sanitiza nome do contrato e usa data ISO. */
export function bmFileName(
  numBm: string,
  contractName: string | undefined,
  saidaDate: string | undefined,
): string {
  const nomeSafe = (contractName || 'contrato')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .slice(0, 40);
  const dataStr = (saidaDate || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  return `${numBm}_${nomeSafe}_${dataStr}.pdf`;
}
