/**
 * Núcleo testável da aba Financeiro do contrato — série da Curva S e
 * orçado por categoria. Porte de contrato/charts.js (renderCurvaS) e do
 * cálculo de orçamento inline de ContratoDetail.js.
 */
import type { Contract } from './types';

type Registro = Record<string, unknown>;
const n = (v: unknown): number => Number(v) || 0;

/** Ponto mensal da Curva S (acumulado). */
export interface MesCurvaS {
  /** Rótulo curto do mês, ex.: "abr/26". */
  label: string;
  /** Valor planejado acumulado (distribuição linear). */
  planejado: number;
  /** Medido acumulado (BMs); `null` em meses futuros. */
  medido: number | null;
  /** Custo realizado acumulado; `null` em meses futuros. */
  custo: number | null;
}

function mesKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Série acumulada mês a mês: planejado (linear), medido (BMs) e custo
 * realizado (saídas + caixa). Devolve `[]` se o contrato não tem datas/valor.
 */
export function computeCurvaS(
  contract: Contract,
  input: { notasFiscais: readonly unknown[]; saidas: readonly unknown[]; caixa: readonly unknown[] },
  now: Date = new Date(),
): MesCurvaS[] {
  const valor = n(contract.value);
  if (!contract.startDate || !contract.endDate || valor <= 0) return [];
  const start = new Date(`${contract.startDate}T12:00:00`);
  const end = new Date(`${contract.endDate}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return [];
  }

  const meses: { ym: string; label: string; date: Date }[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const fim = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor <= fim) {
    meses.push({
      ym: mesKey(cursor),
      label: cursor
        .toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
        .replace('.', ''),
      date: new Date(cursor),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  if (meses.length === 0) return [];

  const hoje = new Date(now);
  hoje.setHours(0, 0, 0, 0);
  const id = contract.id;

  // Medido: NFs do contrato por mês de dataLimite.
  const medidoPorMes = new Map<string, number>();
  for (const raw of input.notasFiscais) {
    const nf = raw as Registro;
    if (nf.contractId !== id || !nf.dataLimite) continue;
    const d = new Date(`${String(nf.dataLimite)}T12:00:00`);
    if (Number.isNaN(d.getTime())) continue;
    const k = mesKey(d);
    medidoPorMes.set(k, (medidoPorMes.get(k) ?? 0) + n(nf.valor));
  }

  // Custo: saídas do contrato + caixa (saídas vinculadas) por mês.
  const custoPorMes = new Map<string, number>();
  const addCusto = (dataStr: unknown, value: unknown) => {
    if (!dataStr) return;
    const d = new Date(`${String(dataStr)}T12:00:00`);
    if (Number.isNaN(d.getTime())) return;
    const k = mesKey(d);
    custoPorMes.set(k, (custoPorMes.get(k) ?? 0) + n(value));
  };
  for (const raw of input.saidas) {
    const s = raw as Registro;
    if (s.contractId === id) addCusto(s.date, s.value);
  }
  for (const raw of input.caixa) {
    const e = raw as Registro;
    if (e.contractId === id && e.type === 'saida') addCusto(e.date, e.value);
  }

  let acMedido = 0;
  let acCusto = 0;
  return meses.map((m, i) => {
    acMedido += medidoPorMes.get(m.ym) ?? 0;
    acCusto += custoPorMes.get(m.ym) ?? 0;
    const futuro = m.date > hoje;
    return {
      label: m.label,
      planejado: (valor * (i + 1)) / meses.length,
      medido: futuro ? null : acMedido,
      custo: futuro ? null : acCusto,
    };
  });
}

/** Orçado agrupado por categoria, a partir do orçamento do contrato. */
export function orcadoPorTipo(contract: Contract): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of contract.budget ?? []) {
    const tipo = String(b.type ?? 'outros');
    out[tipo] = (out[tipo] ?? 0) + n(b.value);
  }
  return out;
}

/** Linha agregada da tabela de Saídas Classificadas. */
export interface LinhaSaida {
  id: string;
  kind: 'saida' | 'base' | 'passagem' | 'compra';
  date: string;
  description: string;
  type: string;
  value: number;
  origem: string;
}

/**
 * Agrega as saídas de um contrato: saídas diretas + rateio BASE +
 * passagens + compras (caixa). Ordenadas por data decrescente.
 */
export function linhasSaidas(
  contractId: string,
  input: {
    saidas: readonly unknown[];
    base: readonly unknown[];
    caixa: readonly unknown[];
  },
): LinhaSaida[] {
  const out: LinhaSaida[] = [];
  for (const raw of input.saidas) {
    const s = raw as Registro;
    if (s.contractId !== contractId) continue;
    out.push({
      id: String(s.id),
      kind: 'saida',
      date: String(s.date ?? ''),
      description: String(s.description ?? '—'),
      type: String(s.type ?? 'outros'),
      value: n(s.value),
      origem: 'Saída direta',
    });
  }
  for (const raw of input.base) {
    const item = raw as Registro;
    const allocs = Array.isArray(item.allocations)
      ? (item.allocations as Registro[])
      : [];
    for (const a of allocs.filter((x) => x.contractId === contractId)) {
      out.push({
        id: String(a.id ?? `${item.id}-${a.contractId}`),
        kind: 'base',
        date: String(a.date ?? ''),
        description: String(item.description ?? 'Rateio BASE'),
        type: 'base',
        value: n(a.value),
        origem: 'Rateio BASE',
      });
    }
  }
  for (const raw of input.caixa) {
    const e = raw as Registro;
    if (e.contractId !== contractId || e.type !== 'saida') continue;
    const passagem = e.category === 'passagem';
    out.push({
      id: String(e.id),
      kind: passagem ? 'passagem' : 'compra',
      date: String(e.date ?? ''),
      description: String(e.description ?? '—'),
      type: passagem ? 'transporte' : String(e.category ?? 'outros'),
      value: n(e.value),
      origem: passagem ? 'Passagem' : 'Compra (Caixa)',
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}
