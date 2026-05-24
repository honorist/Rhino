import { describe, expect, it } from 'vitest';
import type { Contract } from '../contracts/types';
import {
  calcAgingARecever,
  calcConcentracaoReceita,
  calcFluxoMensal,
  calcRiscos,
  calcSaldoCaixa,
  saidasByContract,
} from './calculations';

const NOW = new Date('2026-06-15T12:00:00');

describe('calcSaldoCaixa', () => {
  it('soma entradas e subtrai saídas', () => {
    expect(
      calcSaldoCaixa([
        { type: 'entrada', value: 1000 },
        { type: 'saida', value: 300 },
        { type: 'saida', value: 200 },
      ]),
    ).toBe(500);
  });
});

describe('saidasByContract', () => {
  it('agrupa as saídas por contractId', () => {
    const m = saidasByContract([
      { contractId: 'a', value: 100 },
      { contractId: 'a', value: 50 },
      { contractId: 'b', value: 30 },
    ]);
    expect(m).toEqual({ a: 150, b: 30 });
  });
});

describe('calcFluxoMensal', () => {
  it('gera 6 meses e distribui as entradas e saídas', () => {
    const fluxo = calcFluxoMensal(
      [
        { date: '2026-06-01', type: 'entrada', value: 1000 },
        { date: '2026-05-15', type: 'saida', value: 200 },
      ],
      NOW,
    );
    expect(fluxo).toHaveLength(6);
    const jun = fluxo[fluxo.length - 1];
    expect(jun.entradas).toBe(1000);
    const mai = fluxo[fluxo.length - 2];
    expect(mai.saidas).toBe(200);
  });
});

describe('calcConcentracaoReceita', () => {
  it('calcula CR5 com base nos contratos ativos', () => {
    const contratos: Contract[] = [
      { id: 'a', name: 'A', client: 'X', status: 'ativo', value: 700 },
      { id: 'b', name: 'B', client: 'Y', status: 'ativo', value: 300 },
      { id: 'c', name: 'C', client: 'Z', status: 'concluido', value: 999 },
    ];
    const c = calcConcentracaoReceita(contratos, {});
    expect(c.totalContratos).toBe(2);
    expect(c.cr5).toBeCloseTo(100);
    expect(c.top5[0].valor).toBe(700);
  });
});

describe('calcAgingARecever', () => {
  it('classifica NFs em aberto por faixa de atraso', () => {
    const aging = calcAgingARecever(
      [
        { dataLimite: '2026-07-01', valor: 100, emitida: false }, // futuro
        { dataLimite: '2026-06-01', valor: 200, emitida: false }, // 14d
        { dataLimite: '2026-03-01', valor: 500, emitida: false }, // ~106d
        { dataLimite: '2026-06-10', valor: 999, emitida: true }, // ignora (emitida)
      ],
      NOW,
    );
    expect(aging.total).toBe(800);
    expect(
      aging.buckets.find((b) => b.label === 'Vencidas >90d')?.valor,
    ).toBe(500);
  });
});

describe('calcRiscos', () => {
  it('detecta NFs antigas e contas vencidas como risco alto', () => {
    const contratos: Contract[] = [
      { id: 'a', name: 'A', client: 'X', status: 'ativo', value: 100 },
    ];
    const r = calcRiscos(
      contratos,
      [{ dataLimite: '2026-01-01', valor: 50, emitida: false }],
      [{ status: 'pendente', valor: 10, dataVencimento: '2026-05-01' }],
      { a: 200 }, // margem negativa
      NOW,
    );
    expect(r.find((x) => x.cat === 'A Receber')?.sev).toBe('Alta');
    expect(r.find((x) => x.cat === 'A Pagar')?.sev).toBe('Alta');
    expect(r.find((x) => x.cat === 'Margem')?.sev).toBe('Alta');
  });
});
