/**
 * Construção da timeline do contrato — núcleo testável.
 * Agrega eventos de início/fim, aditivos, marcos, ocorrências, RDOs e
 * medições numa lista ordenada por data. Porte de `renderTimelineSection`.
 */
import type { Aditivo, Contract, Marco, Ocorrencia, Rdo } from './types';

type Registro = Record<string, unknown>;
const n = (v: unknown): number => Number(v) || 0;

/** Um evento da timeline do contrato. */
export interface TimelineEvent {
  date: string;
  tipo: 'contrato' | 'aditivo' | 'marco' | 'ocorrencia' | 'rdo' | 'medicao';
  icon: string;
  label: string;
  desc: string | null;
}

/** Cor por tipo de evento da timeline. */
export const TIMELINE_COR: Record<TimelineEvent['tipo'], string> = {
  contrato: 'var(--color-primary)',
  aditivo: '#8B5CF6',
  marco: '#059669',
  ocorrencia: '#DC2626',
  rdo: '#6B7280',
  medicao: '#D97706',
};

/** Monta a timeline do contrato, ordenada por data crescente. */
export function buildTimeline(
  contract: Contract,
  notasFiscais: readonly unknown[],
): TimelineEvent[] {
  const ev: TimelineEvent[] = [];

  if (contract.startDate) {
    ev.push({
      date: contract.startDate,
      tipo: 'contrato',
      icon: '📋',
      label: 'Início do contrato',
      desc: contract.name,
    });
  }
  if (contract.endDate) {
    ev.push({
      date: contract.endDate,
      tipo: 'contrato',
      icon: '🏁',
      label: 'Fim do contrato',
      desc: contract.name,
    });
  }

  for (const a of (contract.aditivos as Aditivo[] | undefined) ?? []) {
    if (a.data) {
      ev.push({
        date: a.data,
        tipo: 'aditivo',
        icon: '➕',
        label: `Aditivo${a.numero ? ` #${a.numero}` : ''}`,
        desc: a.descricao ?? null,
      });
    }
  }

  for (const m of (contract.marcos as Marco[] | undefined) ?? []) {
    if (m.prazo) {
      ev.push({
        date: m.prazo,
        tipo: 'marco',
        icon: m.concluido ? '✅' : '🎯',
        label: `Marco: ${m.titulo}`,
        desc: m.concluido ? 'Concluído' : 'Pendente',
      });
    }
  }

  for (const o of (contract.ocorrencias as Ocorrencia[] | undefined) ?? []) {
    if (o.data) {
      const sev =
        o.severidade === 'alta' || o.severidade === 'critica'
          ? '🔴'
          : o.severidade === 'media'
            ? '🟡'
            : '🟢';
      ev.push({
        date: o.data,
        tipo: 'ocorrencia',
        icon: sev,
        label: `Ocorrência${o.encerrada ? ' (encerrada)' : ''}`,
        desc: o.descricao ?? null,
      });
    }
  }

  for (const r of (contract.rdos as Rdo[] | undefined) ?? []) {
    const data = r.data ?? (r as Registro).date;
    if (data) {
      ev.push({
        date: String(data),
        tipo: 'rdo',
        icon: '📝',
        label: `RDO #${r.numero ?? ''}`,
        desc: null,
      });
    }
  }

  for (const raw of notasFiscais) {
    const nf = raw as Registro;
    if (nf.contractId !== contract.id) continue;
    const d = nf.dataEmissao ?? nf.dataPrevista ?? nf.createdAt;
    if (!d) continue;
    const valor = n(nf.valor);
    ev.push({
      date: String(d).slice(0, 10),
      tipo: 'medicao',
      icon: '💰',
      label: `Medição${nf.numero ? ` #${nf.numero}` : ''}${nf.emitida ? ' ✓' : ''}`,
      desc: valor ? `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : null,
    });
  }

  return ev.sort((a, b) => a.date.localeCompare(b.date));
}
