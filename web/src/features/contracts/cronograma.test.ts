import { describe, expect, it } from 'vitest';
import { resumoCronograma } from './cronograma';

describe('resumoCronograma', () => {
  it('soma pesos e custos e calcula o avanço ponderado', () => {
    const r = resumoCronograma([
      { id: 'a', nome: 'Eng', pesoPct: 40, execPct: 50, custoPlan: 1_000 },
      { id: 'b', nome: 'Mont', pesoPct: 60, execPct: 100, custoPlan: 2_000 },
    ]);
    expect(r.totalEtapas).toBe(2);
    expect(r.totalPeso).toBe(100);
    expect(r.totalCusto).toBe(3_000);
    // (40·50% + 60·100%) / 100 = 80%
    expect(r.execGeral).toBeCloseTo(80);
  });

  it('devolve zeros para um cronograma vazio', () => {
    const r = resumoCronograma([]);
    expect(r).toEqual({
      totalEtapas: 0,
      totalPeso: 0,
      totalCusto: 0,
      execGeral: 0,
    });
  });
});
