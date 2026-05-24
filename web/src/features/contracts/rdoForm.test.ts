import { describe, expect, it } from 'vitest';
import { calcPrazo, diaSemanaFromISO, rdoTotais, type RdoFormData } from './rdoForm';

describe('diaSemanaFromISO', () => {
  it('devolve o nome do dia da semana', () => {
    // 2026-05-20 é uma quarta-feira.
    expect(diaSemanaFromISO('2026-05-20')).toBe('Quarta-feira');
  });

  it('devolve vazio para data ausente', () => {
    expect(diaSemanaFromISO('')).toBe('');
  });
});

describe('calcPrazo', () => {
  const contrato = { startDate: '2026-01-01', endDate: '2026-12-31' };

  it('calcula contratual, decorrido e faltante', () => {
    const p = calcPrazo(contrato, '2026-02-01');
    expect(p.contratual).toBe(364);
    expect(p.decorrido).toBe(31);
    expect(p.faltante).toBe(333);
    expect(p.atraso).toBe(0);
  });

  it('calcula atraso a partir da data de tendência', () => {
    const p = calcPrazo(
      { ...contrato, tendencyDate: '2027-01-15' },
      '2026-02-01',
    );
    expect(p.atraso).toBe(15);
  });
});

describe('rdoTotais', () => {
  it('soma pessoas e homens-hora (US-03: normais + extras)', () => {
    const form = {
      moi: [{ cargo: 'Eng', qtd: 2, horasNormais: 8, horasExtras: 0 }],
      mod: [{ cargo: 'Pedreiro', qtd: 3, horasNormais: 9, horasExtras: 2 }],
      terc: [],
      equipamentos: [{ nome: 'Betoneira', qtd: 1, horas: 5 }],
    } as unknown as RdoFormData;
    const t = rdoTotais(form);
    expect(t.moi).toBe(2);
    expect(t.mod).toBe(3);
    expect(t.eqp).toBe(1);
    // normais = 2*8 + 3*9 = 43; extras = 3*2 = 6
    expect(t.horasNormais).toBe(43);
    expect(t.horasExtras).toBe(6);
    expect(t.homensHora).toBe(49);
    expect(t.equipamentoHora).toBe(5);
  });
});
