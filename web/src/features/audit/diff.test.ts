import { describe, expect, it } from 'vitest';
import { computeDiff, formatValue, visibleEntries } from './diff';

describe('computeDiff', () => {
  it('retorna vazio quando before ou after é nulo', () => {
    expect(computeDiff(null, { a: 1 })).toEqual([]);
    expect(computeDiff({ a: 1 }, null)).toEqual([]);
  });

  it('detecta os campos que mudaram', () => {
    const before = { nome: 'Ana', valor: 100 };
    const after = { nome: 'Ana', valor: 250 };

    const diffs = computeDiff(before, after);

    expect(diffs).toEqual([{ key: 'valor', before: 100, after: 250 }]);
  });

  it('ignora id, timestamps e metadata', () => {
    const before = { id: 'x', createdAt: '2020', updated_at: '2020', nome: 'A' };
    const after = { id: 'y', createdAt: '2021', updated_at: '2021', nome: 'A' };

    expect(computeDiff(before, after)).toEqual([]);
  });

  it('compara objetos e arrays por valor', () => {
    const diffs = computeDiff({ tags: ['a'] }, { tags: ['a', 'b'] });

    expect(diffs).toHaveLength(1);
    expect(diffs[0].key).toBe('tags');
  });
});

describe('formatValue', () => {
  it('mostra travessão para valores vazios', () => {
    expect(formatValue(null)).toBe('—');
    expect(formatValue(undefined)).toBe('—');
    expect(formatValue('')).toBe('—');
  });

  it('traduz booleanos', () => {
    expect(formatValue(true)).toBe('Sim');
    expect(formatValue(false)).toBe('Não');
  });

  it('formata números com duas casas', () => {
    expect(formatValue(1234.5)).toBe('1.234,50');
  });

  it('resume arrays e strings longas', () => {
    expect(formatValue([1, 2, 3])).toBe('[3 itens]');
    expect(formatValue('x'.repeat(100))).toHaveLength(80);
  });
});

describe('visibleEntries', () => {
  it('remove campos internos e valores vazios', () => {
    const entries = visibleEntries({
      id: 'x',
      nome: 'Ana',
      vazio: '',
      metadata: {},
    });

    expect(entries).toEqual([['nome', 'Ana']]);
  });
});
