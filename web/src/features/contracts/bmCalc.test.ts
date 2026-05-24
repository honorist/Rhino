import { describe, expect, it } from 'vitest';
import { bmFileName, calcBm, fmtBRL, fmtPct } from './bmCalc';

describe('calcBm', () => {
  it('soma anterior + atual e calcula saldo', () => {
    const r = calcBm({ contractValue: 100_000, thisMedicaoValor: 25_000, valorAnterior: 50_000 });
    expect(r.valorAcumulado).toBe(75_000);
    expect(r.saldo).toBe(25_000);
  });

  it('saldo nunca é negativo quando excede o contrato', () => {
    const r = calcBm({ contractValue: 100_000, thisMedicaoValor: 90_000, valorAnterior: 50_000 });
    expect(r.saldo).toBe(0);
  });

  it('percentuais zeram quando contractValue=0 (sem div por 0)', () => {
    const r = calcBm({ contractValue: 0, thisMedicaoValor: 10, valorAnterior: 5 });
    expect(r.pctAnterior).toBe(0);
    expect(r.pctMes).toBe(0);
    expect(r.pctTotal).toBe(0);
  });

  it('pctTotal = pctAnterior + pctMes (dentro de epsilon)', () => {
    const r = calcBm({ contractValue: 200_000, thisMedicaoValor: 30_000, valorAnterior: 70_000 });
    expect(r.pctTotal).toBeCloseTo(r.pctAnterior + r.pctMes, 6);
    expect(r.pctTotal).toBeCloseTo(50, 6);
  });
});

describe('fmtBRL / fmtPct', () => {
  it('formata BRL com R$ e vírgula', () => {
    expect(fmtBRL(1234.5)).toMatch(/^R\$/);
    expect(fmtBRL(1234.5)).toContain('1.234,50');
  });

  it('NaN/undefined/string viram R$ 0,00', () => {
    expect(fmtBRL(undefined)).toContain('0,00');
    expect(fmtBRL('xyz')).toContain('0,00');
  });

  it('pct usa 2 casas com vírgula', () => {
    expect(fmtPct(12.345)).toBe('12,35%');
    expect(fmtPct(0)).toBe('0,00%');
  });
});

describe('bmFileName', () => {
  it('sanitiza nome do contrato e aplica data', () => {
    expect(bmFileName('BM-001', 'Obra Acme/Filial #2', '2025-04-30')).toBe(
      'BM-001_Obra_Acme_Filial_2_20250430.pdf',
    );
  });

  it('usa data atual quando saidaDate vazia', () => {
    const fn = bmFileName('BM-002', 'X', undefined);
    expect(fn).toMatch(/^BM-002_X_\d{8}\.pdf$/);
  });

  it('limita o nome do contrato em 40 chars', () => {
    const longName = 'a'.repeat(80);
    const fn = bmFileName('BM-003', longName, '2025-01-01');
    // Espera 40 chars de "a" entre BM-003_ e _20250101.pdf
    expect(fn).toBe('BM-003_' + 'a'.repeat(40) + '_20250101.pdf');
  });
});
