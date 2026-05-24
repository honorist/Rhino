import { describe, expect, it } from 'vitest';
import type { Contract } from '../contracts/types';
import { calcMetrics } from './metrics';

const CONTRACT: Contract = {
  id: 'c1',
  name: 'Obra Alfa',
  client: 'Cliente X',
  status: 'ativo',
  value: 100_000,
  endDate: '2026-12-31',
  tendencyDate: '2027-01-15',
  budget: [{ type: 'material', value: 40_000 }],
};

const INPUT = {
  saidas: [{ contractId: 'c1', value: 10_000 }],
  base: [
    { contracts: [{ contractId: 'c1', value: 5_000 }] },
    { contracts: [{ contractId: 'c2', value: 999 }] },
  ],
  caixa: [
    { contractId: 'c1', type: 'saida', category: 'passagem', value: 1_000 },
    { contractId: 'c1', type: 'saida', category: 'material', value: 2_000 },
  ],
  notasFiscais: [
    { contractId: 'c1', valor: 30_000, emitida: true },
    { contractId: 'c2', valor: 999 },
  ],
  recursos: [
    { status: 'funcionario', alocacaoAtual: { contractId: 'c1' } },
    { status: 'funcionario', alocacaoAtual: { contractId: 'c2' } },
  ],
};

describe('calcMetrics (Comparativo)', () => {
  const m = calcMetrics(CONTRACT, INPUT);

  it('soma custos de saídas, BASE, passagens e compras', () => {
    expect(m.totalCusto).toBe(18_000); // 10k + 5k + 1k + 2k
  });

  it('soma só as NFs do contrato em totalMedido', () => {
    expect(m.totalMedido).toBe(30_000);
  });

  it('calcula margem e percentuais', () => {
    expect(m.margemReais).toBe(12_000);
    expect(m.pctMargem).toBeCloseTo(12);
    expect(m.pctMedido).toBeCloseTo(30);
  });

  it('calcula atraso pela tendência vs fim contratual', () => {
    expect(m.atrasoDias).toBe(15);
  });

  it('conta equipe alocada só desse contrato', () => {
    expect(m.equipeAtual).toBe(1);
  });
});
