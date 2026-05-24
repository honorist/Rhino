import { describe, expect, it } from 'vitest';
import type { Contract } from './types';
import { computeCurvaS, linhasSaidas, orcadoPorTipo } from './financeiro';

const NOW = new Date('2026-02-15T10:00:00');

const CONTRACT: Contract = {
  id: 'c1',
  name: 'Obra Alfa',
  client: 'Cliente X',
  status: 'ativo',
  value: 120_000,
  startDate: '2026-01-01',
  endDate: '2026-03-31',
};

describe('computeCurvaS', () => {
  it('devolve vazio sem datas ou valor', () => {
    expect(computeCurvaS({ ...CONTRACT, value: 0 }, EMPTY, NOW)).toEqual([]);
    expect(
      computeCurvaS({ ...CONTRACT, startDate: undefined }, EMPTY, NOW),
    ).toEqual([]);
  });

  const serie = computeCurvaS(
    CONTRACT,
    {
      notasFiscais: [
        { contractId: 'c1', dataLimite: '2026-01-20', valor: 30_000 },
      ],
      saidas: [{ contractId: 'c1', date: '2026-01-10', value: 10_000 }],
      caixa: [],
    },
    NOW,
  );

  it('gera um ponto por mês do contrato', () => {
    expect(serie).toHaveLength(3);
  });

  it('distribui o planejado linearmente', () => {
    expect(serie[0].planejado).toBe(40_000);
    expect(serie[2].planejado).toBe(120_000);
  });

  it('acumula medido e custo até o mês atual', () => {
    expect(serie[0].medido).toBe(30_000);
    expect(serie[1].custo).toBe(10_000);
  });

  it('deixa medido/custo nulos em meses futuros', () => {
    expect(serie[2].medido).toBeNull();
    expect(serie[2].custo).toBeNull();
  });
});

describe('orcadoPorTipo', () => {
  it('agrupa o orçamento por categoria', () => {
    const r = orcadoPorTipo({
      ...CONTRACT,
      budget: [
        { type: 'material', value: 5_000 },
        { type: 'material', value: 3_000 },
        { type: 'mao_de_obra', value: 2_000 },
      ],
    });
    expect(r).toEqual({ material: 8_000, mao_de_obra: 2_000 });
  });
});

const EMPTY = { notasFiscais: [], saidas: [], caixa: [] };

describe('linhasSaidas', () => {
  const linhas = linhasSaidas('c1', {
    saidas: [
      { id: 's1', contractId: 'c1', date: '2026-02-01', type: 'material', value: 100 },
      { id: 's2', contractId: 'c2', date: '2026-02-02', type: 'material', value: 999 },
    ],
    base: [
      {
        id: 'b1',
        description: 'Base A',
        allocations: [{ id: 'al1', contractId: 'c1', date: '2026-01-15', value: 50 }],
      },
    ],
    caixa: [
      {
        id: 'cx1',
        contractId: 'c1',
        type: 'saida',
        category: 'passagem',
        date: '2026-03-01',
        value: 30,
      },
    ],
  });

  it('agrega saídas, BASE e caixa, ignorando outros contratos', () => {
    expect(linhas).toHaveLength(3);
    expect(linhas.some((l) => l.value === 999)).toBe(false);
  });

  it('classifica passagem como transporte/kind passagem', () => {
    const p = linhas.find((l) => l.id === 'cx1');
    expect(p?.kind).toBe('passagem');
    expect(p?.type).toBe('transporte');
  });

  it('ordena por data decrescente', () => {
    expect(linhas[0].id).toBe('cx1');
    expect(linhas[linhas.length - 1].id).toBe('al1');
  });
});
