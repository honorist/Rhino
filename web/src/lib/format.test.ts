import { describe, expect, it } from 'vitest';
import { formatBRL, formatBRLk, parseBRL } from './format';

describe('formatBRL', () => {
  it('formata valor positivo como moeda BRL', () => {
    expect(formatBRL(1234.56)).toBe('R$ 1.234,56');
  });

  it('trata zero', () => {
    expect(formatBRL(0)).toBe('R$ 0,00');
  });

  it('trata valores não-finitos como zero', () => {
    expect(formatBRL(Number.NaN)).toBe('R$ 0,00');
  });
});

describe('formatBRLk', () => {
  it('abrevia milhões', () => {
    expect(formatBRLk(1_234_567)).toBe('R$ 1,23M');
  });

  it('abrevia milhares acima de 10k sem casas decimais', () => {
    expect(formatBRLk(12_345)).toBe('R$ 12k');
  });

  it('abrevia milhares entre 1k e 10k com uma casa', () => {
    expect(formatBRLk(1_500)).toBe('R$ 1,5k');
  });

  it('mantém o sinal negativo', () => {
    expect(formatBRLk(-2_000_000)).toBe('−R$ 2,00M');
  });
});

describe('parseBRL', () => {
  it('faz parse de string com separador de milhar e vírgula decimal', () => {
    expect(parseBRL('R$ 1.234,56')).toBe(1234.56);
  });

  it('faz parse de string só com vírgula decimal', () => {
    expect(parseBRL('1234,56')).toBe(1234.56);
  });

  it('faz parse de string em formato com ponto decimal', () => {
    expect(parseBRL('1234.56')).toBe(1234.56);
  });

  it('retorna o próprio número quando recebe number', () => {
    expect(parseBRL(99.9)).toBe(99.9);
  });

  it('retorna 0 para entrada vazia ou inválida', () => {
    expect(parseBRL('')).toBe(0);
    expect(parseBRL('abc')).toBe(0);
  });
});
