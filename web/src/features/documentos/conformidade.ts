/**
 * Cálculo de status e conformidade documental — núcleo testável da tela de
 * Documentação. Porte de `_statusDoc` / `_diasRestantes` / `_conformidade`.
 */
import type { Documento } from '../../types/domain';

export type DocStatus = 'vigente' | 'vencendo' | 'vencido' | 'pendente';
export type ConformidadeStatus = 'ok' | 'atencao' | 'critico' | 'sem_docs';

const DIA_MS = 86_400_000;

/** Dias até o vencimento (negativo = vencido). `null` se sem data. */
export function diasRestantes(
  doc: Documento,
  now: Date = new Date(),
): number | null {
  if (!doc.dataVencimento) return null;
  const hoje = new Date(now);
  hoje.setHours(0, 0, 0, 0);
  const venc = new Date(`${doc.dataVencimento}T12:00:00`);
  return Math.ceil((venc.getTime() - hoje.getTime()) / DIA_MS);
}

/** Situação de um documento conforme a data de vencimento. */
export function statusDoc(doc: Documento, now: Date = new Date()): DocStatus {
  const dias = diasRestantes(doc, now);
  if (dias === null) return 'pendente';
  if (dias < 0) return 'vencido';
  if (dias <= 30) return 'vencendo';
  return 'vigente';
}

/** Conformidade documental agregada de um colaborador. */
export interface Conformidade {
  score: number;
  vigentes: number;
  total: number;
  status: ConformidadeStatus;
}

/** Calcula a conformidade a partir da lista de documentos. */
export function conformidade(
  docs: Documento[],
  now: Date = new Date(),
): Conformidade {
  if (docs.length === 0) {
    return { score: 0, vigentes: 0, total: 0, status: 'sem_docs' };
  }
  const vigentes = docs.filter((d) => statusDoc(d, now) === 'vigente').length;
  const vencidos = docs.filter((d) => statusDoc(d, now) === 'vencido').length;
  const score = Math.round((vigentes / docs.length) * 100);
  const status: ConformidadeStatus =
    vencidos > 0 ? 'critico' : score < 100 ? 'atencao' : 'ok';
  return { score, vigentes, total: docs.length, status };
}
