/**
 * Helpers de saldo de estoque — núcleo testável da tela de Almoxarifado.
 * Porte de `_saldoEm` / `_saldoTotal` / `_saldoCentral` de Estoque.js.
 */
import type { Almoxarifado, EstoqueItem } from './types';

/** Saldo de um item num almoxarifado específico. */
export function saldoEm(item: EstoqueItem, almoxId: string): number {
  const s = (item.saldos ?? []).find((x) => x.almoxId === almoxId);
  return s ? Number(s.qtd) || 0 : 0;
}

/** Saldo total de um item (soma de todos os almoxarifados). */
export function saldoTotal(item: EstoqueItem): number {
  return (item.saldos ?? []).reduce((acc, x) => acc + (Number(x.qtd) || 0), 0);
}

/** Almoxarifado Central (o único sem contrato). */
export function almoxCentral(
  almoxs: Almoxarifado[],
): Almoxarifado | undefined {
  return almoxs.find((a) => !a.contractId);
}

/** Saldo de um item no Central. */
export function saldoCentral(
  item: EstoqueItem,
  almoxs: Almoxarifado[],
): number {
  const central = almoxCentral(almoxs);
  return central ? saldoEm(item, central.id) : 0;
}

/** Almoxarifados de obra (todos exceto o Central). */
export function almoxsObras(almoxs: Almoxarifado[]): Almoxarifado[] {
  return almoxs.filter((a) => a.contractId);
}

/** True se o item está abaixo do estoque mínimo configurado. */
export function abaixoMinimo(item: EstoqueItem): boolean {
  const min = Number(item.estoqueMinimo) || 0;
  return min > 0 && saldoTotal(item) < min;
}
