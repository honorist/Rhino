import { describe, expect, it } from 'vitest';
import {
  calcInss,
  findPreset,
  presetDescricao,
  presetSuggestion,
} from './presets';

describe('calcInss (tabela 2026)', () => {
  it('retorna 0 para salário não positivo', () => {
    expect(calcInss(0)).toBe(0);
    expect(calcInss(-100)).toBe(0);
  });

  it('aplica 7,5% na primeira faixa', () => {
    // 1000 inteiramente na 1ª faixa → 7,5%.
    expect(calcInss(1000)).toBeCloseTo(75, 2);
  });

  it('soma faixas progressivas para salário intermediário', () => {
    // 1621*0,075 + (2000-1621)*0,09 = 121,575 + 34,11 = 155,69 (arred.).
    expect(calcInss(2000)).toBeCloseTo(155.69, 2);
  });

  it('limita ao teto do INSS', () => {
    const noTeto = calcInss(8475.55);
    expect(calcInss(20000)).toBe(noTeto);
  });
});

describe('presetSuggestion', () => {
  it('contribuição sindical é 2% com teto de 70', () => {
    const sind = findPreset('sind')!;
    expect(presetSuggestion(sind, 1000, 0)).toBe(20);
    expect(presetSuggestion(sind, 10000, 0)).toBe(70);
  });

  it('hora extra usa (salário ÷ 220) × fator × horas', () => {
    const he50 = findPreset('he50')!;
    // (2200/220) * 1.5 * 2 = 30.
    expect(presetSuggestion(he50, 2200, 2)).toBe(30);
  });

  it('faltas usam salário ÷ 30 por dia', () => {
    const falta = findPreset('falta')!;
    expect(presetSuggestion(falta, 3000, 2)).toBe(200);
  });

  it('retorna null para presets de valor livre', () => {
    const plr = findPreset('plr')!;
    expect(presetSuggestion(plr, 3000, 0)).toBeNull();
  });
});

describe('presetDescricao', () => {
  it('usa a descrição livre para preset "outro"', () => {
    const outro = findPreset('outro_d')!;
    expect(presetDescricao(outro, 0, '  Multa de trânsito  ')).toBe(
      'Multa de trânsito',
    );
  });

  it('anexa a quantidade para presets com fórmula', () => {
    const falta = findPreset('falta')!;
    expect(presetDescricao(falta, 1, '')).toBe('Faltas (1 dia)');
    expect(presetDescricao(falta, 3, '')).toBe('Faltas (3 dias)');
  });

  it('usa só o rótulo quando não há quantidade', () => {
    const he50 = findPreset('he50')!;
    expect(presetDescricao(he50, 0, '')).toBe('Hora extra 50%');
  });
});
