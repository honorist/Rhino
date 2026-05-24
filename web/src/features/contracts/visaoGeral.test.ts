import { describe, expect, it } from 'vitest';
import type { Contract } from './types';
import { computeVisaoGeral } from './visaoGeral';

const CONTRACT: Contract = {
  id: 'c1',
  name: 'Obra Alfa',
  client: 'Cliente X',
  status: 'ativo',
  value: 100_000,
};

const INPUT = {
  saidas: [
    { contractId: 'c1', type: 'material', value: 20_000 },
    { contractId: 'c2', type: 'material', value: 999 },
  ],
  notasFiscais: [
    { contractId: 'c1', emitida: true, valor: 30_000 },
    { contractId: 'c1', emitida: false, valor: 10_000 },
  ],
  caixa: [{ contractId: 'c1', type: 'saida', category: 'passagem', value: 1_000 }],
  base: [{ allocations: [{ contractId: 'c1', value: 5_000 }] }],
};

describe('computeVisaoGeral', () => {
  const data = computeVisaoGeral(CONTRACT, INPUT);

  it('soma apenas as NFs emitidas em totalEmitido', () => {
    expect(data.totalEmitido).toBe(30_000);
    expect(data.totalMedido).toBe(40_000);
  });

  it('calcula o disponível para BM (valor − medido)', () => {
    expect(data.totalAMedir).toBe(60_000);
  });

  it('consolida o realizado (saídas + base + passagens + compras)', () => {
    expect(data.totalRealizado).toBe(26_000);
  });

  it('calcula a margem (medido − realizado)', () => {
    expect(data.margemAtual).toBe(14_000);
    expect(data.pctMargem).toBeCloseTo(14);
  });

  it('agrupa o realizado por tipo, somando passagem em transporte', () => {
    expect(data.realizadoPorTipo.material).toBe(20_000);
    expect(data.realizadoPorTipo.base).toBe(5_000);
    expect(data.realizadoPorTipo.transporte).toBe(1_000);
  });

  it('ignora registros de outros contratos', () => {
    expect(data.totalSaidas).toBe(20_000);
  });
});
