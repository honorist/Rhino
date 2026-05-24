/**
 * Hook compartilhado pelos 4 protótipos de Dashboard — abstrai a busca de
 * dados e o cálculo dos indicadores principais, pra cada protótipo focar
 * só em estilo visual.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { useCurrentUser } from '../../auth/queries';
import { useContracts, useSaidas } from '../../contracts/queries';
import { calcRelatorio } from '../../relatorio/calculations';
import {
  useCaixa,
  useContasPagar,
  useInvestimentos,
  useNotasFiscais,
  usePropostas,
  useRecursos,
  useSocios,
} from '../../resources';
import {
  calcCoberturaMeses,
  calcFaturadoMes,
  calcPipeline,
  calcScoreSaude,
  calcSparklines,
  primeiroNome,
  saudacao,
} from '../../dashboard/dashboardCalc';

export interface PontoHistorico {
  data: string;
  saldo: number;
  label?: string;
}
export interface PontoProjetado {
  data: string;
  saldo: number;
}
interface DashboardApi {
  caixaBalance?: number;
  historicoCaixa?: PontoHistorico[];
  saldoProjetado?: PontoProjetado[];
  totalContractValue?: number;
}

export interface DashboardData {
  ready: boolean;
  saudacao: string;
  nome: string;
  saldo: number;
  receitasMes: number;
  custosAcum: number;
  margem: number;
  coberturaMeses: number;
  contratosAtivos: number;
  aPagar: number;
  aReceber: number;
  taxaDespesa: number;
  scoreValor: number;
  scoreLabel: string;
  sparkSaldo: number[];
  sparkEntradas: number[];
  sparkSaidas: number[];
  pipeline: {
    rascunho: number;
    aguardEmissao: number;
    nfEmitida: number;
    recebida: number;
  };
  historico: PontoHistorico[];
  projecao: PontoProjetado[];
}

export function useDashboardData(projDays: 30 | 60 | 90 = 30): DashboardData {
  const meQuery = useCurrentUser();
  const dashQuery = useQuery({
    queryKey: ['dashboard-protos', projDays],
    queryFn: () => api.get<DashboardApi>(`/api/dashboard?projDays=${projDays}`),
  });
  const contractsQuery = useContracts();
  const saidasQuery = useSaidas();
  const caixaQuery = useCaixa();
  const nfsQuery = useNotasFiscais();
  const cpQuery = useContasPagar();
  const sociosQuery = useSocios();
  const investQuery = useInvestimentos();
  const recursosQuery = useRecursos();
  const propostasQuery = usePropostas();

  const ready =
    !contractsQuery.isLoading &&
    !caixaQuery.isLoading &&
    !nfsQuery.isLoading &&
    !cpQuery.isLoading &&
    !sociosQuery.isLoading &&
    !investQuery.isLoading &&
    !recursosQuery.isLoading &&
    !propostasQuery.isLoading;

  const indicadores = useMemo(() => {
    if (!ready || !contractsQuery.data) return null;
    return calcRelatorio(contractsQuery.data, {
      caixa: caixaQuery.data ?? [],
      saidas: saidasQuery.data ?? [],
      notasFiscais: nfsQuery.data ?? [],
      contasPagar: cpQuery.data ?? [],
    });
  }, [
    ready,
    contractsQuery.data,
    caixaQuery.data,
    saidasQuery.data,
    nfsQuery.data,
    cpQuery.data,
  ]);

  if (!ready || !indicadores) {
    return {
      ready: false,
      saudacao: '',
      nome: '',
      saldo: 0,
      receitasMes: 0,
      custosAcum: 0,
      margem: 0,
      coberturaMeses: 0,
      contratosAtivos: 0,
      aPagar: 0,
      aReceber: 0,
      taxaDespesa: 0,
      scoreValor: 0,
      scoreLabel: '',
      sparkSaldo: [],
      sparkEntradas: [],
      sparkSaidas: [],
      pipeline: { rascunho: 0, aguardEmissao: 0, nfEmitida: 0, recebida: 0 },
      historico: [],
      projecao: [],
    };
  }

  const dash = (dashQuery.data ?? {}) as DashboardApi;
  const caixa = (caixaQuery.data ?? []) as unknown as Record<string, unknown>[];
  const saldo = dash.caixaBalance ?? indicadores.saldoCaixa;
  const sparks = calcSparklines(caixa);
  const pipe = calcPipeline(
    (nfsQuery.data ?? []) as unknown as Record<string, unknown>[],
    (saidasQuery.data ?? []) as unknown as Record<string, unknown>[],
  );
  const coberturaMeses = calcCoberturaMeses(saldo, caixa);
  const faturadoMes = calcFaturadoMes(caixa).faturadoMes;

  const totalSaidas = (saidasQuery.data ?? []).reduce(
    (s, sd) => s + (Number((sd as { value?: unknown }).value) || 0),
    0,
  );
  const totalContratado = dash.totalContractValue ?? indicadores.totalContratado;
  const taxaDespesa = totalContratado > 0 ? (totalSaidas / totalContratado) * 100 : 0;
  const score = calcScoreSaude(taxaDespesa, indicadores.margemMedia, saldo);

  const aPagar = (cpQuery.data ?? []).reduce((s, p) => {
    if ((p as { paid?: boolean }).paid) return s;
    return s + (Number((p as { value?: unknown }).value) || 0);
  }, 0);
  const aReceber = (nfsQuery.data ?? []).reduce((s, nf) => {
    const recebida = !!(nf as { caixaEntryId?: string }).caixaEntryId;
    if (recebida) return s;
    return s + (Number((nf as { valor?: unknown }).valor) || 0);
  }, 0);

  const user = meQuery.data?.user;
  return {
    ready: true,
    saudacao: saudacao(new Date().getHours()),
    nome: primeiroNome(user?.name ?? user?.email ?? null),
    saldo,
    receitasMes: faturadoMes,
    custosAcum: totalSaidas,
    margem: indicadores.margemMedia,
    coberturaMeses,
    contratosAtivos: indicadores.contratosAtivos,
    aPagar,
    aReceber,
    taxaDespesa,
    scoreValor: score.score,
    scoreLabel: score.label,
    sparkSaldo: sparks.saldo,
    sparkEntradas: sparks.entradasAcum,
    sparkSaidas: sparks.saidasAcum,
    pipeline: {
      rascunho: pipe.rascunho.count,
      aguardEmissao: pipe.aguardEmissao.count,
      nfEmitida: pipe.nfEmitida.count,
      recebida: pipe.recebida.count,
    },
    historico: dash.historicoCaixa ?? [],
    projecao: dash.saldoProjetado ?? [],
  };
}
