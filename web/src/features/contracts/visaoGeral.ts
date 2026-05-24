/**
 * Cálculo financeiro da aba Visão Geral do contrato — núcleo testável.
 * Porte das contas inline de ContratoDetail.js (render, aba `visao`).
 *
 * Função pura: recebe as coleções cruas e o contrato, devolve os totais.
 */
import type { Contract } from './types';

type Registro = Record<string, unknown>;

const n = (v: unknown): number => Number(v) || 0;

/** Totais e percentuais consolidados da Visão Geral. */
export interface VisaoGeralData {
  totalSaidas: number;
  totalBase: number;
  totalPassagensRealizadas: number;
  totalCompras: number;
  totalRealizado: number;
  totalMedido: number;
  totalEmitido: number;
  totalAMedir: number;
  pctMedido: number;
  pctEmitido: number;
  margemAtual: number;
  pctMargem: number;
  metaMargemReais: number;
  margemFaltante: number;
  totalRecebido: number;
  totalNFAberta: number;
  totalRascunho: number;
  totalDisponivel: number;
  saldoRestante: number;
  pctConsumido: number;
  /** Custo realizado agrupado por categoria. */
  realizadoPorTipo: Record<string, number>;
  nfsEmitidasCount: number;
}

/** Coleções necessárias para o cálculo (já no formato cru das queries). */
export interface VisaoGeralInput {
  saidas: readonly unknown[];
  notasFiscais: readonly unknown[];
  caixa: readonly unknown[];
  base: readonly unknown[];
}

/** Calcula os totais financeiros da Visão Geral de um contrato. */
export function computeVisaoGeral(
  contract: Contract,
  input: VisaoGeralInput,
): VisaoGeralData {
  const id = contract.id;
  const valor = n(contract.value);

  const saidasRaw = input.saidas as readonly Registro[];
  const nfsRaw = input.notasFiscais as readonly Registro[];
  const caixaRaw = input.caixa as readonly Registro[];
  const baseRaw = input.base as readonly Registro[];

  // ── Saídas classificadas ──
  const saidas = saidasRaw.filter((s) => s.contractId === id);
  const totalSaidas = saidas.reduce((acc, s) => acc + n(s.value), 0);
  const saidasByType = (tipo: string): number =>
    saidas.filter((s) => s.type === tipo).reduce((acc, s) => acc + n(s.value), 0);

  // ── BASE (rateio) ──
  const totalBase = baseRaw.reduce((acc, item) => {
    const allocs = Array.isArray(item.allocations)
      ? (item.allocations as Registro[])
      : [];
    return (
      acc +
      allocs
        .filter((a) => a.contractId === id)
        .reduce((s, a) => s + n(a.value), 0)
    );
  }, 0);

  // ── Caixa: passagens realizadas + compras avulsas ──
  const caixaContrato = caixaRaw.filter(
    (e) => e.contractId === id && e.type === 'saida',
  );
  const totalPassagensRealizadas = caixaContrato
    .filter((e) => e.category === 'passagem')
    .reduce((acc, e) => acc + n(e.value), 0);
  const compras = caixaContrato.filter((e) => e.category !== 'passagem');
  const totalCompras = compras.reduce((acc, e) => acc + n(e.value), 0);

  // ── Notas fiscais (boletins de medição) ──
  const nfs = nfsRaw.filter((nf) => nf.contractId === id);
  const nfsEmitidas = nfs.filter((nf) => nf.emitida);
  const totalMedido = nfs.reduce((acc, nf) => acc + n(nf.valor), 0);
  const totalEmitido = nfsEmitidas.reduce((acc, nf) => acc + n(nf.valor), 0);
  const totalAMedir = Math.max(0, valor - totalMedido);
  const pctMedido = valor > 0 ? (totalMedido / valor) * 100 : 0;
  const pctEmitido = valor > 0 ? (totalEmitido / valor) * 100 : 0;

  // ── Margem ──
  const totalRealizado =
    totalSaidas + totalBase + totalPassagensRealizadas + totalCompras;
  const margemAtual = totalMedido - totalRealizado;
  const pctMargem = valor > 0 ? (margemAtual / valor) * 100 : 0;
  const metaMargemReais = valor * 0.2;
  const margemFaltante = Math.max(0, metaMargemReais - margemAtual);

  // ── Barra "uso do contrato" ──
  const totalRecebido = nfsEmitidas
    .filter((nf) => nf.caixaEntryId || nf.caixa_entry_id)
    .reduce((acc, nf) => acc + n(nf.valor), 0);
  const totalNFAberta = totalEmitido - totalRecebido;
  const totalRascunho = totalMedido - totalEmitido;
  const totalDisponivel = Math.max(0, valor - totalMedido);

  // ── Composição do gasto ──
  const realizadoPorTipo: Record<string, number> = {
    mao_de_obra: saidasByType('mao_de_obra'),
    material: saidasByType('material'),
    hospedagem: saidasByType('hospedagem'),
    transporte: saidasByType('transporte') + totalPassagensRealizadas,
    base: totalBase,
  };
  for (const e of compras) {
    const k = String(e.category ?? 'outros');
    realizadoPorTipo[k] = (realizadoPorTipo[k] ?? 0) + n(e.value);
  }
  if (!realizadoPorTipo.outros) realizadoPorTipo.outros = 0;

  const saldoRestante = Math.max(0, valor - totalRealizado);
  const pctConsumido = valor > 0 ? (totalRealizado / valor) * 100 : 0;

  return {
    totalSaidas,
    totalBase,
    totalPassagensRealizadas,
    totalCompras,
    totalRealizado,
    totalMedido,
    totalEmitido,
    totalAMedir,
    pctMedido,
    pctEmitido,
    margemAtual,
    pctMargem,
    metaMargemReais,
    margemFaltante,
    totalRecebido,
    totalNFAberta,
    totalRascunho,
    totalDisponivel,
    saldoRestante,
    pctConsumido,
    realizadoPorTipo,
    nfsEmitidasCount: nfsEmitidas.length,
  };
}
