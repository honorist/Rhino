/**
 * Recorrência virtual — porte puro de js/lib/recurrence.js.
 *
 * Expande itens da BASE com `metadata.recurrence` em ocorrências dentro de um
 * intervalo, sem materializar no banco. As ocorrências viram lançamentos
 * "virtuais" no caixa; o usuário pode materializá-las num caixa real.
 */
import type { BaseItem, CaixaEntry } from '../types/domain';

export type RecurrenceFrequency =
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'yearly';

export interface VirtualOccurrence {
  date: string;
  value: number;
  sourceId: string;
  sourceType: 'base_item';
  sourceDescription: string;
  sourceTypeKey: string | null;
  frequency: string;
  virtual: true;
}

/** Limite rígido contra loop infinito na expansão. */
const MAX_OCCURRENCES = 1000;

/** Soma `n` unidades de `freq` a uma data, retornando nova Date. */
function addUnits(date: Date, n: number, freq: string): Date {
  const d = new Date(date);
  if (freq === 'weekly') d.setDate(d.getDate() + 7 * n);
  else if (freq === 'quarterly') d.setMonth(d.getMonth() + 3 * n);
  else if (freq === 'yearly') d.setFullYear(d.getFullYear() + n);
  else d.setMonth(d.getMonth() + n); // monthly (padrão)
  return d;
}

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** Expande a recorrência de um item da BASE no intervalo [fromISO, toISO]. */
export function expandRecurrence(
  item: BaseItem,
  fromISO: string,
  toISO_: string,
): VirtualOccurrence[] {
  const rec = item.metadata?.recurrence;
  if (!rec || !rec.active || !rec.startDate) return [];

  const fromD = fromISO ? new Date(`${fromISO}T12:00:00`) : null;
  const toD = toISO_ ? new Date(`${toISO_}T12:00:00`) : null;
  const startD = new Date(`${rec.startDate}T12:00:00`);
  const endD = rec.endDate ? new Date(`${rec.endDate}T12:00:00`) : null;

  const out: VirtualOccurrence[] = [];
  for (let i = 0; i < MAX_OCCURRENCES; i++) {
    const d = addUnits(startD, i, rec.frequency ?? 'monthly');
    if (endD && d > endD) break;
    if (toD && d > toD) break;
    if (!fromD || d >= fromD) {
      out.push({
        date: toISO(d),
        value: Number(item.value) || 0,
        sourceId: item.id,
        sourceType: 'base_item',
        sourceDescription: item.description ?? '',
        sourceTypeKey: item.type ?? null,
        frequency: rec.frequency ?? 'monthly',
        virtual: true,
      });
    }
  }
  return out;
}

/** Expande todos os itens recorrentes da BASE no intervalo. */
export function expandAll(
  items: BaseItem[],
  fromISO: string,
  toISO_: string,
): VirtualOccurrence[] {
  const all: VirtualOccurrence[] = [];
  items.forEach((item) => {
    if (item.metadata?.recurrence?.active) {
      all.push(...expandRecurrence(item, fromISO, toISO_));
    }
  });
  return all;
}

/** Uma ocorrência virtual já virou caixa real? (mesmo baseItemId + data). */
export function isMaterialized(
  occ: VirtualOccurrence,
  caixa: CaixaEntry[],
): boolean {
  return caixa.some(
    (e) => e.baseItemId === occ.sourceId && e.date === occ.date,
  );
}

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: 'semanal',
  monthly: 'mensal',
  quarterly: 'trimestral',
  yearly: 'anual',
};

export function frequencyLabel(freq: string): string {
  return FREQUENCY_LABELS[freq] ?? freq;
}
