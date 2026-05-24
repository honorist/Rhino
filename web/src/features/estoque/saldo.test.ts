import { describe, expect, it } from 'vitest';
import type { Almoxarifado, EstoqueItem } from './types';
import {
  abaixoMinimo,
  almoxCentral,
  almoxsObras,
  saldoCentral,
  saldoEm,
  saldoTotal,
} from './saldo';

const ALMOXS: Almoxarifado[] = [
  { id: 'central', nome: 'Central' },
  { id: 'a1', nome: 'Almox Obra', contractId: 'c1', contractName: 'Obra Alfa' },
];

const ITEM: EstoqueItem = {
  id: 'i1',
  descricao: 'Tinta',
  estoqueMinimo: 10,
  saldos: [
    { almoxId: 'central', qtd: 5 },
    { almoxId: 'a1', qtd: 3 },
  ],
};

describe('saldoEm / saldoTotal', () => {
  it('lê o saldo de um almoxarifado', () => {
    expect(saldoEm(ITEM, 'central')).toBe(5);
    expect(saldoEm(ITEM, 'a1')).toBe(3);
    expect(saldoEm(ITEM, 'inexistente')).toBe(0);
  });

  it('soma o saldo total', () => {
    expect(saldoTotal(ITEM)).toBe(8);
  });
});

describe('almoxCentral / almoxsObras', () => {
  it('identifica o Central e as obras', () => {
    expect(almoxCentral(ALMOXS)?.id).toBe('central');
    expect(almoxsObras(ALMOXS).map((a) => a.id)).toEqual(['a1']);
  });
});

describe('saldoCentral', () => {
  it('lê o saldo no almoxarifado Central', () => {
    expect(saldoCentral(ITEM, ALMOXS)).toBe(5);
  });
});

describe('abaixoMinimo', () => {
  it('é verdadeiro quando o total fica abaixo do mínimo', () => {
    expect(abaixoMinimo(ITEM)).toBe(true);
  });

  it('é falso sem mínimo configurado', () => {
    expect(abaixoMinimo({ id: 'x', descricao: 'X', saldos: [] })).toBe(false);
  });
});
