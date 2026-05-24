/**
 * Núcleo testável do Relatório Gerencial — saldo, fluxo, concentração,
 * aging, riscos. Porte de js/views/Relatorio.js (helpers _calc*).
 */
import type { Contract } from '../contracts/types';

type Registro = Record<string, unknown>;
const n = (v: unknown): number => Number(v) || 0;
const isoHoje = (): string => new Date().toISOString().slice(0, 10);
const dataPlus = (dias: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
};

/** Saldo consolidado de Caixa: Σ entradas − Σ saídas. */
export function calcSaldoCaixa(entries: readonly unknown[]): number {
  return entries.reduce<number>((s, raw) => {
    const e = raw as Registro;
    const v = n(e.value);
    return s + (e.type === 'entrada' ? v : -v);
  }, 0);
}

/** Mapa contractId → total de saídas. */
export function saidasByContract(
  saidas: readonly unknown[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const raw of saidas) {
    const s = raw as Registro;
    const id = String(s.contractId ?? s.contract_id ?? '');
    if (!id) continue;
    out[id] = (out[id] ?? 0) + n(s.value);
  }
  return out;
}

/** Ponto mensal do fluxo de caixa. */
export interface MesFluxo {
  ano: number;
  mes: number;
  label: string;
  entradas: number;
  saidas: number;
}

/** Fluxo mensal dos últimos 6 meses. */
export function calcFluxoMensal(
  entries: readonly unknown[],
  now: Date = new Date(),
): MesFluxo[] {
  const meses: MesFluxo[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    meses.push({
      ano: d.getFullYear(),
      mes: d.getMonth() + 1,
      label: d
        .toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
        .replace('.', '')
        .replace(' de ', '/'),
      entradas: 0,
      saidas: 0,
    });
  }
  for (const raw of entries) {
    const e = raw as Registro;
    const data = String(e.date ?? '');
    if (!data) continue;
    const [ano, mes] = data.split('-').map(Number);
    const bucket = meses.find((m) => m.ano === ano && m.mes === mes);
    if (!bucket) continue;
    const v = n(e.value);
    if (e.type === 'entrada') bucket.entradas += v;
    else bucket.saidas += v;
  }
  return meses;
}

/** Entrada do top-5 de concentração. */
export interface ContratoConcentracao {
  nome: string;
  cliente: string;
  valor: number;
  medido: number;
  pct: number;
}
export interface ConcentracaoReceita {
  totalContratado: number;
  totalContratos: number;
  top5: ContratoConcentracao[];
  /** Σ % de carteira dos 5 maiores (CR5). */
  cr5: number;
}

/** Concentração de receita (CR5 + top 5 contratos ativos). */
export function calcConcentracaoReceita(
  contracts: readonly Contract[],
  saidasMap: Record<string, number>,
): ConcentracaoReceita {
  const ativos = contracts.filter(
    (c) => c.status === 'ativo' && (Number(c.value) || 0) > 0,
  );
  const totalContratado = ativos.reduce((s, c) => s + n(c.value), 0);
  const ord = ativos
    .map((c) => {
      const valor = n(c.value);
      return {
        nome: c.name || '—',
        cliente: c.client || '—',
        valor,
        medido: saidasMap[c.id] ?? 0,
        pct: totalContratado > 0 ? (valor / totalContratado) * 100 : 0,
      };
    })
    .sort((a, b) => b.valor - a.valor);
  const top5 = ord.slice(0, 5);
  const cr5 = top5.reduce((s, c) => s + c.pct, 0);
  return { totalContratado, top5, cr5, totalContratos: ord.length };
}

/** Bucket do aging de contas a receber. */
export interface AgingBucket {
  label: string;
  min: number;
  max: number;
  valor: number;
  qtd: number;
}
export interface AgingResultado {
  buckets: AgingBucket[];
  total: number;
}

/** Aging de NFs em aberto por faixa de atraso. */
export function calcAgingARecever(
  nfs: readonly unknown[],
  now: Date = new Date(),
): AgingResultado {
  const buckets: AgingBucket[] = [
    { label: 'A vencer', min: -9999, max: 0, valor: 0, qtd: 0 },
    { label: 'Vencidas 1–30d', min: 1, max: 30, valor: 0, qtd: 0 },
    { label: 'Vencidas 31–60d', min: 31, max: 60, valor: 0, qtd: 0 },
    { label: 'Vencidas 61–90d', min: 61, max: 90, valor: 0, qtd: 0 },
    { label: 'Vencidas >90d', min: 91, max: 99_999, valor: 0, qtd: 0 },
  ];
  for (const raw of nfs) {
    const nf = raw as Registro;
    if (nf.emitida || nf.status === 'emitida') continue;
    const venc = String(nf.dataLimite ?? nf.data_limite ?? '');
    if (!venc) continue;
    const dVenc = new Date(`${venc}T12:00:00`).getTime();
    const dias = Math.floor((now.getTime() - dVenc) / 86_400_000);
    const valor = n(nf.valor ?? nf.totalLiquido ?? nf.valorTotal);
    const b = buckets.find((x) => dias >= x.min && dias <= x.max);
    if (b) {
      b.valor += valor;
      b.qtd += 1;
    }
  }
  const total = buckets.reduce((s, b) => s + b.valor, 0);
  return { buckets, total };
}

/** Risco identificado para o sumário. */
export interface Risco {
  sev: 'Alta' | 'Média' | 'Baixa';
  cat: string;
  desc: string;
  impacto: number;
}

/** Lista de riscos materiais do período. */
export function calcRiscos(
  contracts: readonly Contract[],
  nfs: readonly unknown[],
  contasPagar: readonly unknown[],
  saidasMap: Record<string, number>,
  now: Date = new Date(),
): Risco[] {
  const hoje = isoHoje();
  const riscos: Risco[] = [];

  const nfsAntigas = (nfs as Registro[]).filter((nf) => {
    if (nf.emitida) return false;
    const v = String(nf.dataLimite ?? nf.data_limite ?? '');
    if (!v) return false;
    const dias = Math.floor(
      (now.getTime() - new Date(`${v}T12:00:00`).getTime()) / 86_400_000,
    );
    return dias > 60;
  });
  if (nfsAntigas.length > 0) {
    riscos.push({
      sev: 'Alta',
      cat: 'A Receber',
      desc: `${nfsAntigas.length} NFs vencidas há mais de 60 dias`,
      impacto: nfsAntigas.reduce(
        (s, nf) => s + n(nf.valor ?? nf.totalLiquido),
        0,
      ),
    });
  }

  const margemNeg = contracts.filter((c) => {
    if (c.status !== 'ativo' || !c.value) return false;
    const s = saidasMap[c.id] ?? 0;
    return (n(c.value) - s) / n(c.value) < 0;
  });
  if (margemNeg.length > 0) {
    riscos.push({
      sev: 'Alta',
      cat: 'Margem',
      desc: `${margemNeg.length} contrato(s) ativo(s) com margem negativa`,
      impacto: 0,
    });
  }

  const em30 = dataPlus(30);
  const proxFim = contracts.filter(
    (c) =>
      c.status === 'ativo' &&
      c.endDate &&
      c.endDate <= em30 &&
      c.endDate >= hoje,
  );
  if (proxFim.length > 0) {
    riscos.push({
      sev: 'Média',
      cat: 'Renovação',
      desc: `${proxFim.length} contrato(s) ativo(s) com término nos próximos 30 dias`,
      impacto: proxFim.reduce((s, c) => s + n(c.value), 0),
    });
  }

  const cpVenc = (contasPagar as Registro[]).filter((c) => {
    const v = String(c.dataVencimento ?? c.data_vencimento ?? '');
    return (
      (c.status === 'pendente' || c.status === 'aberto') && v && v < hoje
    );
  });
  if (cpVenc.length > 0) {
    riscos.push({
      sev: 'Alta',
      cat: 'A Pagar',
      desc: `${cpVenc.length} conta(s) a pagar vencida(s)`,
      impacto: cpVenc.reduce((s, c) => s + n(c.valor), 0),
    });
  }

  return riscos;
}

/** Dados consolidados do relatório (passados para o gerador de PDF). */
export interface RelatorioDados {
  saldoCaixa: number;
  varSaldoPct: number | null;
  contratosAtivos: number;
  totalContratado: number;
  margemMedia: number;
  totalAReceber: number;
  qtdNFsPend: number;
  totalAPagar: number;
  qtdCpPend: number;
  faturamentoMes: number;
  varFatPct: number | null;
  runwayMeses: string;
  cr5: number;
  riscosAlta: number;
  fluxo: MesFluxo[];
  concentracao: ConcentracaoReceita;
  aging: AgingResultado;
  riscos: Risco[];
  saidasMap: Record<string, number>;
  contracts: readonly Contract[];
}

/** Calcula o conjunto completo de indicadores do relatório. */
export function calcRelatorio(
  contracts: readonly Contract[],
  input: {
    caixa: readonly unknown[];
    saidas: readonly unknown[];
    notasFiscais: readonly unknown[];
    contasPagar: readonly unknown[];
  },
  now: Date = new Date(),
): RelatorioDados {
  const saidasMap = saidasByContract(input.saidas);
  const saldoCaixa = calcSaldoCaixa(input.caixa);
  const ativos = contracts.filter((c) => c.status === 'ativo');
  const totalContratado = ativos.reduce((s, c) => s + n(c.value), 0);

  const margens = ativos
    .filter((c) => n(c.value) > 0)
    .map((c) => {
      const s = saidasMap[c.id] ?? 0;
      const valor = n(c.value);
      return ((valor - s) / valor) * 100;
    });
  const margemMedia =
    margens.length > 0
      ? margens.reduce((a, b) => a + b, 0) / margens.length
      : 0;

  const fluxo = calcFluxoMensal(input.caixa, now);
  const mesAtual = fluxo[fluxo.length - 1] ?? { entradas: 0, saidas: 0 };
  const mesAnt = fluxo[fluxo.length - 2] ?? { entradas: 0, saidas: 0 };
  const varFatPct =
    mesAnt.entradas > 0
      ? ((mesAtual.entradas - mesAnt.entradas) / mesAnt.entradas) * 100
      : null;

  const ultimoDiaMesAnt = new Date(now.getFullYear(), now.getMonth(), 0)
    .toISOString()
    .slice(0, 10);
  const saldoMesAnt = calcSaldoCaixa(
    (input.caixa as Registro[]).filter(
      (e) => e.date && String(e.date) <= ultimoDiaMesAnt,
    ),
  );
  const varSaldoPct =
    saldoMesAnt > 0 ? ((saldoCaixa - saldoMesAnt) / saldoMesAnt) * 100 : null;

  // Runway: saldo / gasto mensal médio dos últimos 90d.
  const d90 = new Date(now);
  d90.setDate(d90.getDate() - 90);
  const d90Str = d90.toISOString().slice(0, 10);
  const gasto90 = (input.caixa as Registro[])
    .filter(
      (e) => e.type === 'saida' && e.date && String(e.date) >= d90Str,
    )
    .reduce((s, e) => s + n(e.value), 0);
  const gastoMensal = gasto90 / 3;
  const runwayMeses =
    gastoMensal > 0 ? (saldoCaixa / gastoMensal).toFixed(1) : '—';

  const totalAReceber = (input.notasFiscais as Registro[])
    .filter((nf) => !nf.emitida && nf.status !== 'emitida')
    .reduce((s, nf) => s + n(nf.valor ?? nf.totalLiquido ?? nf.valorTotal), 0);
  const qtdNFsPend = (input.notasFiscais as Registro[]).filter(
    (nf) => !nf.emitida && nf.status !== 'emitida',
  ).length;
  const totalAPagar = (input.contasPagar as Registro[])
    .filter((c) => c.status === 'pendente' || c.status === 'aberto')
    .reduce((s, c) => s + n(c.valor), 0);
  const qtdCpPend = (input.contasPagar as Registro[]).filter(
    (c) => c.status === 'pendente' || c.status === 'aberto',
  ).length;

  const concentracao = calcConcentracaoReceita(contracts, saidasMap);
  const aging = calcAgingARecever(input.notasFiscais, now);
  const riscos = calcRiscos(
    contracts,
    input.notasFiscais,
    input.contasPagar,
    saidasMap,
    now,
  );
  const riscosAlta = riscos.filter((r) => r.sev === 'Alta').length;

  return {
    saldoCaixa,
    varSaldoPct,
    contratosAtivos: ativos.length,
    totalContratado,
    margemMedia,
    totalAReceber,
    qtdNFsPend,
    totalAPagar,
    qtdCpPend,
    faturamentoMes: mesAtual.entradas,
    varFatPct,
    runwayMeses,
    cr5: concentracao.cr5,
    riscosAlta,
    fluxo,
    concentracao,
    aging,
    riscos,
    saidasMap,
    contracts,
  };
}
