import { describe, expect, it } from 'vitest';
import type { Rdo } from './types';
import { moTotal, rdoCompliance } from './rdoCompliance';

// 2026-05-20 é uma quarta-feira; o último dia útil anterior é 19/05 (terça).
const QUARTA = new Date('2026-05-20T12:00:00');
const SABADO = new Date('2026-05-23T12:00:00');

const rdo = (data: string): Rdo => ({ id: data, numero: 1, data });

describe('moTotal', () => {
  it('soma MOI + MOD + Terceiros (qtd ou quantidade)', () => {
    expect(
      moTotal({
        id: 'r1',
        moi: [{ qtd: 3 }],
        mod: [{ quantidade: 5 }],
        terc: [{ qtd: 2 }],
      }),
    ).toBe(10);
  });
});

describe('rdoCompliance', () => {
  it('não alerta para contratos não-ativos', () => {
    expect(rdoCompliance([], 'concluido', QUARTA).nivel).toBeNull();
  });

  it('avisa que é fim de semana', () => {
    expect(rdoCompliance([], 'ativo', SABADO).nivel).toBe('info');
  });

  it('marca erro quando a obra não tem nenhum RDO', () => {
    const r = rdoCompliance([], 'ativo', QUARTA);
    expect(r.nivel).toBe('erro');
    expect(r.mensagem).toContain('nenhum RDO');
  });

  it('marca erro quando falta RDO no último dia útil', () => {
    const r = rdoCompliance([rdo('2026-05-10')], 'ativo', QUARTA);
    expect(r.nivel).toBe('erro');
    expect(r.mensagem).toContain('último dia útil');
  });

  it('fica sem alerta quando o RDO está em dia', () => {
    expect(rdoCompliance([rdo('2026-05-19')], 'ativo', QUARTA).nivel).toBeNull();
  });
});
