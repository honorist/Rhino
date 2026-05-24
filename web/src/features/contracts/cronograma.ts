/**
 * Resumo do cronograma físico-financeiro — núcleo testável.
 * Porte do cálculo de `_renderAtividades` de contrato/cronograma.js.
 */
import type { Atividade } from './types';

const n = (v: unknown): number => Number(v) || 0;

/** Totais agregados das etapas do cronograma. */
export interface ResumoCronograma {
  totalEtapas: number;
  totalPeso: number;
  totalCusto: number;
  /** Avanço físico geral — média do %executado ponderada pelo peso. */
  execGeral: number;
}

/** Calcula o resumo do cronograma a partir das etapas. */
export function resumoCronograma(atividades: Atividade[]): ResumoCronograma {
  const totalPeso = atividades.reduce((s, a) => s + n(a.pesoPct), 0);
  const totalCusto = atividades.reduce((s, a) => s + n(a.custoPlan), 0);
  const execGeral =
    totalPeso > 0
      ? (atividades.reduce(
          (s, a) => s + (n(a.pesoPct) * n(a.execPct)) / 100,
          0,
        ) /
          totalPeso) *
        100
      : 0;
  return {
    totalEtapas: atividades.length,
    totalPeso,
    totalCusto,
    execGeral,
  };
}
