import { describe, expect, it } from 'vitest';
import type { BaseItem, CaixaEntry } from '../types/domain';
import {
  expandRecurrence,
  frequencyLabel,
  isMaterialized,
} from './recurrence';

function baseItem(over: Partial<BaseItem> = {}): BaseItem {
  return {
    id: 'b1',
    description: 'Aluguel',
    type: 'fixo',
    value: 1000,
    allocations: [],
    ...over,
  };
}

describe('expandRecurrence', () => {
  it('retorna vazio quando não há recorrência ativa', () => {
    expect(expandRecurrence(baseItem(), '2026-01-01', '2026-12-31')).toEqual([]);
  });

  it('expande recorrência mensal dentro do intervalo', () => {
    const item = baseItem({
      metadata: {
        recurrence: {
          active: true,
          startDate: '2026-01-15',
          endDate: '2026-04-15',
          frequency: 'monthly',
        },
      },
    });
    const ocorrencias = expandRecurrence(item, '2026-01-01', '2026-12-31');
    expect(ocorrencias.map((o) => o.date)).toEqual([
      '2026-01-15',
      '2026-02-15',
      '2026-03-15',
      '2026-04-15',
    ]);
    expect(ocorrencias[0].value).toBe(1000);
    expect(ocorrencias[0].sourceId).toBe('b1');
  });

  it('respeita o limite inferior do intervalo', () => {
    const item = baseItem({
      metadata: {
        recurrence: {
          active: true,
          startDate: '2026-01-10',
          endDate: '2026-06-10',
          frequency: 'monthly',
        },
      },
    });
    const ocorrencias = expandRecurrence(item, '2026-04-01', '2026-12-31');
    expect(ocorrencias.map((o) => o.date)).toEqual([
      '2026-04-10',
      '2026-05-10',
      '2026-06-10',
    ]);
  });
});

describe('isMaterialized', () => {
  it('detecta ocorrência já lançada no caixa', () => {
    const occ = {
      date: '2026-03-15',
      value: 1000,
      sourceId: 'b1',
      sourceType: 'base_item' as const,
      sourceDescription: 'Aluguel',
      sourceTypeKey: null,
      frequency: 'monthly',
      virtual: true as const,
    };
    const caixa: CaixaEntry[] = [
      {
        id: 'c1',
        type: 'saida',
        description: 'Aluguel',
        value: 1000,
        date: '2026-03-15',
        baseItemId: 'b1',
      },
    ];
    expect(isMaterialized(occ, caixa)).toBe(true);
    expect(isMaterialized({ ...occ, date: '2026-04-15' }, caixa)).toBe(false);
  });
});

describe('frequencyLabel', () => {
  it('traduz frequências conhecidas', () => {
    expect(frequencyLabel('monthly')).toBe('mensal');
    expect(frequencyLabel('weekly')).toBe('semanal');
    expect(frequencyLabel('desconhecida')).toBe('desconhecida');
  });
});
