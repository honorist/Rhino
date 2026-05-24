/**
 * Cálculos puros do Dashboard.
 * Porte dos blocos inline de js/views/Dashboard.js — sem React/DOM.
 * Testável isoladamente.
 */

type Reg = Record<string, unknown>;
const n = (v: unknown): number => parseFloat(String(v)) || 0;

// ─── Saudação por hora ───
export function saudacao(hora: number): 'Bom dia' | 'Boa tarde' | 'Boa noite' {
  if (hora < 12) return 'Bom dia';
  if (hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

export function primeiroNome(nameOrEmail: string | null | undefined): string {
  if (!nameOrEmail) return 'visitante';
  return nameOrEmail.split(/[\s@]/)[0] || 'visitante';
}

// ─── Faturado do mês (entradas de caixa) ───
export interface FaturadoMes {
  faturadoMes: number;
  faturadoMesAnt: number;
  deltaPct: number;
}

export function calcFaturadoMes(caixa: readonly Reg[], hoje: Date = new Date()): FaturadoMes {
  const mesIni = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
    .toISOString()
    .split('T')[0];
  const mesAntIni = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
    .toISOString()
    .split('T')[0];
  const mesAntFim = new Date(hoje.getFullYear(), hoje.getMonth(), 0)
    .toISOString()
    .split('T')[0];
  const faturadoMes = caixa
    .filter((e) => e.type === 'entrada' && String(e.date) >= mesIni)
    .reduce((s, e) => s + n(e.value), 0);
  const faturadoMesAnt = caixa
    .filter(
      (e) =>
        e.type === 'entrada' &&
        String(e.date) >= mesAntIni &&
        String(e.date) <= mesAntFim,
    )
    .reduce((s, e) => s + n(e.value), 0);
  const deltaPct =
    faturadoMesAnt > 0 ? ((faturadoMes - faturadoMesAnt) / faturadoMesAnt) * 100 : 0;
  return { faturadoMes, faturadoMesAnt, deltaPct };
}

// ─── Aportes acumulados (sócios + investimentos com origem 'empresa') ───
export function calcAportes(socios: readonly Reg[], investimentos: readonly Reg[]): number {
  const aportesSocios = socios.reduce(
    (s, x) => s + n(x.aporteTotal ?? x.aporte_total ?? x.aporte),
    0,
  );
  const aportesEmpresa = investimentos
    .filter((i) => String(i.origem ?? '').toLowerCase() === 'empresa')
    .reduce((s, i) => s + n(i.value ?? i.valor), 0);
  return aportesSocios + aportesEmpresa;
}

// ─── Propostas em prospecção ───
export interface Prospeccao {
  rascunho: number;
  enviada: number;
  aceita: number;
  prospeccaoTotal: number;
  valorPotencial: number;
}

export function calcProspeccao(propostas: readonly Reg[]): Prospeccao {
  const rascunho = propostas.filter((p) => p.status === 'rascunho').length;
  const enviada = propostas.filter((p) => p.status === 'enviada').length;
  const aceita = propostas.filter((p) => p.status === 'aceita').length;
  const valorPotencial = propostas
    .filter((p) => p.status === 'rascunho' || p.status === 'enviada')
    .reduce((s, p) => s + n(p.valorTotal ?? p.valor_total), 0);
  return { rascunho, enviada, aceita, prospeccaoTotal: rascunho + enviada, valorPotencial };
}

// ─── Colaboradores (ativos + candidatos) ───
export interface Colaboradores {
  ativos: number;
  candidatos: number;
}

export function calcColaboradores(recursos: readonly Reg[]): Colaboradores {
  return {
    ativos: recursos.filter((r) => r.status === 'funcionario').length,
    candidatos: recursos.filter((r) => r.status === 'candidato').length,
  };
}

// ─── A Pagar nos próximos 30 dias ───
export interface AReceberPagar {
  totalAReceber: number;
  nfsEmitidas: number;
  nfsPendentes: number;
  totalAPagar30d: number;
  cp30dCount: number;
}

export function calcAReceberPagar(
  notasFiscais: readonly Reg[],
  contasPagar: readonly Reg[],
  hoje: Date = new Date(),
): AReceberPagar {
  const nfsEmitidasList = notasFiscais.filter(
    (n) => n.emitida || n.status === 'emitida',
  );
  const nfsPendentesList = notasFiscais.filter(
    (n) => !n.emitida && n.status !== 'emitida',
  );
  const totalAReceber = nfsEmitidasList
    .filter((n) => !n.caixaEntryId && !n.caixa_entry_id)
    .reduce((s, x) => s + n(x.valor ?? x.totalLiquido ?? x.valorTotal), 0);

  const em30 = new Date(hoje);
  em30.setDate(em30.getDate() + 30);
  const em30str = em30.toISOString().split('T')[0];
  const cpPendentes = contasPagar.filter(
    (c) => c.status === 'pendente' || c.status === 'aberto',
  );
  const cp30d = cpPendentes.filter((c) => {
    const v = String(c.dataVencimento ?? c.data_vencimento ?? '');
    return v && v <= em30str;
  });
  const totalAPagar30d = cp30d.reduce((s, c) => s + n(c.valor), 0);

  return {
    totalAReceber,
    nfsEmitidas: nfsEmitidasList.length,
    nfsPendentes: nfsPendentesList.length,
    totalAPagar30d,
    cp30dCount: cp30d.length,
  };
}

// ─── Pipeline de medições (saídas) ───
export interface PipelineStage {
  count: number;
  valor: number;
}
export interface Pipeline {
  rascunho: PipelineStage;
  aguardEmissao: PipelineStage;
  nfEmitida: PipelineStage;
  recebida: PipelineStage;
}

export function calcPipeline(
  notasFiscais: readonly Reg[],
  saidas: readonly Reg[],
): Pipeline {
  const empty: PipelineStage = { count: 0, valor: 0 };
  const acc: Pipeline = {
    rascunho: { ...empty },
    aguardEmissao: { ...empty },
    nfEmitida: { ...empty },
    recebida: { ...empty },
  };
  // Saídas sem nfId = rascunho
  saidas.forEach((s) => {
    if (!s.nfId && !s.nf_id) {
      acc.rascunho.count++;
      acc.rascunho.valor += n(s.value);
    }
  });
  // NFs por estágio
  notasFiscais.forEach((nf) => {
    const valor = n(nf.valor ?? nf.totalLiquido ?? nf.valorTotal);
    const emitida = !!(nf.emitida || nf.status === 'emitida');
    const recebida = !!(nf.caixaEntryId || nf.caixa_entry_id);
    if (recebida) {
      acc.recebida.count++;
      acc.recebida.valor += valor;
    } else if (emitida) {
      acc.nfEmitida.count++;
      acc.nfEmitida.valor += valor;
    } else {
      acc.aguardEmissao.count++;
      acc.aguardEmissao.valor += valor;
    }
  });
  return acc;
}

// ─── Cobertura de caixa (runway em meses) ───
export function calcCoberturaMeses(
  caixaBalance: number,
  caixa: readonly Reg[],
  hoje: Date = new Date(),
): number {
  const d90 = new Date(hoje);
  d90.setDate(d90.getDate() - 90);
  const d90str = d90.toISOString().split('T')[0];
  const saidasUlt90 = caixa
    .filter((e) => e.type === 'saida' && String(e.date) >= d90str)
    .reduce((s, e) => s + n(e.value), 0);
  const media = saidasUlt90 / 3;
  return media > 0 ? caixaBalance / media : 0;
}

// ─── Sparkline series (45 dias) ───
export interface SparkSeries {
  saldo: number[];
  entradasAcum: number[];
  saidasAcum: number[];
  entradaDia: number[];
}

export function calcSparklines(caixa: readonly Reg[], days = 45): SparkSeries {
  const today = new Date();
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  const sumByDay = (filter: (e: Reg) => boolean): number[] =>
    dates.map((date) =>
      caixa
        .filter((e) => String(e.date) <= date && filter(e))
        .reduce((s, e) => s + n(e.value), 0),
    );
  return {
    saldo: dates.map((date) =>
      caixa
        .filter((e) => String(e.date) <= date)
        .reduce((s, e) => s + (e.type === 'entrada' ? 1 : -1) * n(e.value), 0),
    ),
    entradasAcum: sumByDay((e) => e.type === 'entrada'),
    saidasAcum: sumByDay((e) => e.type === 'saida'),
    entradaDia: dates.map((date) =>
      caixa
        .filter((e) => String(e.date) === date && e.type === 'entrada')
        .reduce((s, e) => s + n(e.value), 0),
    ),
  };
}

// ─── Score de saúde financeira (0-100) ───
export interface ScoreSaude {
  score: number;
  label: 'Saudável' | 'Atenção' | 'Crítico';
}

export function calcScoreSaude(
  taxaDespesa: number,
  margemMedia: number,
  caixaBalance: number,
): ScoreSaude {
  let p = 100;
  if (taxaDespesa > 80) p -= 40;
  else if (taxaDespesa > 60) p -= 20;
  if (margemMedia < 0) p -= 30;
  else if (margemMedia < 10) p -= 15;
  if (caixaBalance < 0) p -= 20;
  const score = Math.max(0, Math.min(100, p));
  const label = score >= 80 ? 'Saudável' : score >= 60 ? 'Atenção' : 'Crítico';
  return { score, label };
}

// ─── NFs Situação ───
export interface NfsSituacao {
  vencidas: number;
  proximas7d: number;
  noPrazo: number;
}

export function calcNfsSituacao(
  notasFiscais: readonly Reg[],
  hoje: Date = new Date(),
): NfsSituacao {
  const hojeStr = hoje.toISOString().split('T')[0];
  const em7 = new Date(hoje);
  em7.setDate(em7.getDate() + 7);
  const em7str = em7.toISOString().split('T')[0];
  let vencidas = 0;
  let proximas7d = 0;
  let noPrazo = 0;
  notasFiscais.forEach((nf) => {
    if (nf.emitida || nf.status === 'emitida') return;
    const dl = String(nf.dataLimite ?? nf.data_limite ?? '');
    if (!dl) return;
    if (dl < hojeStr) vencidas++;
    else if (dl <= em7str) proximas7d++;
    else noPrazo++;
  });
  return { vencidas, proximas7d, noPrazo };
}
