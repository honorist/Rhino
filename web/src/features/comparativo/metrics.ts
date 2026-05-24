/**
 * Métricas comparáveis de um contrato — núcleo testável.
 * Porte de `_calcMetrics` de js/views/Comparativo.js.
 */
import type { Contract } from '../contracts/types';

type Registro = Record<string, unknown>;
const n = (v: unknown): number => Number(v) || 0;

/** Coleções cruas necessárias para o cálculo. */
export interface ComparativoInput {
  saidas: readonly unknown[];
  base: readonly unknown[];
  caixa: readonly unknown[];
  notasFiscais: readonly unknown[];
  recursos: readonly unknown[];
}

/** Métricas comparáveis de um contrato. */
export interface ComparativoMetrics {
  id: string;
  nome: string;
  cliente: string;
  status: string;
  contractNumber: string;
  valor: number;
  totalCusto: number;
  totalMedido: number;
  margemReais: number;
  pctMargem: number;
  pctMedido: number;
  desvioOrcado: number;
  orcado: number;
  atrasoDias: number;
  equipeAtual: number;
  rdosUltimos30: number;
}

/** Calcula as métricas comparáveis de um contrato. */
export function calcMetrics(
  contract: Contract,
  input: ComparativoInput,
  now: Date = new Date(),
): ComparativoMetrics {
  const id = contract.id;
  const valor = n(contract.value);

  const saidas = (input.saidas as Registro[]).filter(
    (s) => s.contractId === id,
  );
  const totalSaidas = saidas.reduce((s, x) => s + n(x.value), 0);

  // BASE: itens com allocations vinculadas (campo `contracts` no vanilla).
  const totalBase = (input.base as Registro[]).reduce((acc, item) => {
    const allocs = Array.isArray(item.contracts)
      ? (item.contracts as Registro[])
      : Array.isArray(item.allocations)
        ? (item.allocations as Registro[])
        : [];
    return acc + allocs
      .filter((a) => a.contractId === id)
      .reduce((s, a) => s + n(a.value), 0);
  }, 0);

  const caixaContrato = (input.caixa as Registro[]).filter(
    (e) => e.contractId === id && e.type === 'saida',
  );
  const totalPassagens = caixaContrato
    .filter((e) => e.category === 'passagem')
    .reduce((s, e) => s + n(e.value), 0);
  const totalCompras = caixaContrato
    .filter((e) => e.category !== 'passagem')
    .reduce((s, e) => s + n(e.value), 0);

  const totalCusto = totalSaidas + totalBase + totalCompras + totalPassagens;

  const nfs = (input.notasFiscais as Registro[]).filter(
    (nf) => nf.contractId === id,
  );
  const totalMedido = nfs.reduce((s, nf) => s + n(nf.valor), 0);

  const margemReais = totalMedido - totalCusto;
  const pctMargem = valor > 0 ? (margemReais / valor) * 100 : 0;
  const pctMedido = valor > 0 ? (totalMedido / valor) * 100 : 0;

  const orcado = (contract.budget ?? []).reduce((s, b) => s + n(b.value), 0);
  const desvioOrcado = orcado > 0 ? ((totalCusto - orcado) / orcado) * 100 : 0;

  let atrasoDias = 0;
  if (contract.tendencyDate && contract.endDate) {
    const t = new Date(`${contract.tendencyDate}T12:00:00`).getTime();
    const e = new Date(`${contract.endDate}T12:00:00`).getTime();
    atrasoDias = Math.round((t - e) / 86_400_000);
  }

  const equipeAtual = (input.recursos as Registro[]).filter((r) => {
    const aloc = r.alocacaoAtual as Registro | undefined;
    return r.status === 'funcionario' && aloc?.contractId === id;
  }).length;

  const hoje = new Date(now);
  hoje.setHours(0, 0, 0, 0);
  const limite = new Date(hoje);
  limite.setDate(limite.getDate() - 30);
  const rdos = Array.isArray(contract.rdos)
    ? (contract.rdos as Registro[])
    : [];
  const rdosUltimos30 = rdos.filter((r) => {
    if (!r.data) return false;
    return new Date(`${String(r.data)}T12:00:00`) >= limite;
  }).length;

  return {
    id,
    nome: contract.name,
    cliente: contract.client,
    status: contract.status,
    contractNumber: contract.contractNumber ?? '',
    valor,
    totalCusto,
    totalMedido,
    margemReais,
    pctMargem,
    pctMedido,
    desvioOrcado,
    orcado,
    atrasoDias,
    equipeAtual,
    rdosUltimos30,
  };
}
