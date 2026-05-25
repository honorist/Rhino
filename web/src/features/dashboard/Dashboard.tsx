import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Card from '../../components/ui/Card';
import Spinner from '../../components/ui/Spinner';
import { BentoGrid, BentoItem } from '../../components/ui/BentoGrid';
import { api } from '../../lib/api';
import { formatBRL, formatBRLk } from '../../lib/format';
import { useCurrentUser } from '../auth/queries';
import { useContracts, useSaidas } from '../contracts/queries';
import { calcRelatorio } from '../relatorio/calculations';
import {
  useCaixa,
  useContasPagar,
  useInvestimentos,
  useNotasFiscais,
  usePropostas,
  useRecursos,
  useSocios,
} from '../resources';
import {
  calcAReceberPagar,
  calcAportes,
  calcColaboradores,
  calcCoberturaMeses,
  calcDailyCumulative,
  calcDelta,
  calcFaturadoMes,
  calcNfsSituacao,
  calcPipeline,
  calcProspeccao,
  calcSparklines,
  primeiroNome,
  saudacao,
} from './dashboardCalc';
import EntradasPrevistasTable from './EntradasPrevistasTable';
import FluxoCaixaChart from './FluxoCaixaChart';
import KpiCard from './KpiCard';
import NfsStatusCard from './NfsStatusCard';
import PipelineCard from './PipelineCard';
import { useRdosDashboard } from './queries';
import RdosCard from './RdosCard';

interface EntradaPrev {
  nfId: string;
  numero: string;
  contractId: string;
  contractName?: string;
  contractClient?: string;
  prazoRecebimento: number;
  valor: number;
}
interface ProjecaoFuturaDia {
  data: string;
  entradas: EntradaPrev[];
}
interface PontoHistorico {
  data: string;
  saldo: number;
  label?: string;
}
interface PontoProjetado {
  data: string;
  saldo: number;
}
interface DashboardData {
  caixaBalance?: number;
  projecaoFutura?: ProjecaoFuturaDia[];
  historicoCaixa?: PontoHistorico[];
  saldoProjetado?: PontoProjetado[];
  totalContractValue?: number;
}

const PROJ_DAYS_OPTIONS = [30, 60, 90] as const;
type ProjDays = (typeof PROJ_DAYS_OPTIONS)[number];

/** Dashboard — visão consolidada (porte de js/views/Dashboard.js). */
export default function Dashboard() {
  const meQuery = useCurrentUser();
  const [projDays, setProjDays] = useState<ProjDays>(30);
  const dashQuery = useQuery({
    queryKey: ['dashboard-home', projDays],
    queryFn: () => api.get<DashboardData>(`/api/dashboard?projDays=${projDays}`),
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
  const rdosQuery = useRdosDashboard();

  const carregado =
    !contractsQuery.isLoading &&
    !saidasQuery.isLoading &&
    !caixaQuery.isLoading &&
    !nfsQuery.isLoading &&
    !cpQuery.isLoading &&
    !sociosQuery.isLoading &&
    !investQuery.isLoading &&
    !recursosQuery.isLoading &&
    !propostasQuery.isLoading;

  const indicadores = useMemo(() => {
    if (!carregado || !contractsQuery.data) return null;
    return calcRelatorio(contractsQuery.data, {
      caixa: caixaQuery.data ?? [],
      saidas: saidasQuery.data ?? [],
      notasFiscais: nfsQuery.data ?? [],
      contasPagar: cpQuery.data ?? [],
    });
  }, [
    carregado,
    contractsQuery.data,
    caixaQuery.data,
    saidasQuery.data,
    nfsQuery.data,
    cpQuery.data,
  ]);

  if (!carregado || !indicadores) {
    return <Spinner label="Carregando dashboard..." />;
  }

  const caixa = (caixaQuery.data ?? []) as unknown as Record<string, unknown>[];
  const dash = dashQuery.data ?? {};
  const saldo = dash.caixaBalance ?? indicadores.saldoCaixa;

  // ─── Indicadores derivados ───
  const faturado = calcFaturadoMes(caixa);
  const aportesTotal = calcAportes(
    (sociosQuery.data ?? []) as unknown as Record<string, unknown>[],
    (investQuery.data ?? []) as unknown as Record<string, unknown>[],
  );
  const prospeccao = calcProspeccao(
    (propostasQuery.data ?? []) as unknown as Record<string, unknown>[],
  );
  const colab = calcColaboradores(
    (recursosQuery.data ?? []) as unknown as Record<string, unknown>[],
  );
  const arp = calcAReceberPagar(
    (nfsQuery.data ?? []) as unknown as Record<string, unknown>[],
    (cpQuery.data ?? []) as unknown as Record<string, unknown>[],
  );
  const sparks = calcSparklines(caixa);
  const pipeline = calcPipeline(
    (nfsQuery.data ?? []) as unknown as Record<string, unknown>[],
    (saidasQuery.data ?? []) as unknown as Record<string, unknown>[],
  );
  const nfsSituacao = calcNfsSituacao(
    (nfsQuery.data ?? []) as unknown as Record<string, unknown>[],
  );
  const coberturaMeses = calcCoberturaMeses(saldo, caixa);
  const historicoCaixa = dash.historicoCaixa ?? [];
  const saldoProjetado = dash.saldoProjetado ?? [];

  // ─── Sparklines derivadas (DASH-3 universal) ───
  const sparkAportes = calcDailyCumulative(
    (sociosQuery.data ?? []) as unknown as Record<string, unknown>[],
    (r) => String(r.dataAporte ?? r.data_aporte ?? r.createdAt ?? r.created_at ?? ''),
    (r) => Number(r.aporteTotal ?? r.aporte_total ?? r.aporte ?? 0),
  );
  const sparkProspeccao = calcDailyCumulative(
    (propostasQuery.data ?? []) as unknown as Record<string, unknown>[],
    (r) => String(r.createdAt ?? r.created_at ?? r.dataCriacao ?? ''),
    () => 1,
  );
  const sparkColab = calcDailyCumulative(
    (recursosQuery.data ?? []) as unknown as Record<string, unknown>[],
    (r) => String(r.dataAdmissao ?? r.data_admissao ?? r.createdAt ?? r.created_at ?? ''),
    (r) => (r.status === 'funcionario' ? 1 : 0),
  );

  const rdoStats = rdosQuery.data?.stats;
  const rdosAtrasados = (rdoStats?.aderenciaDiaria ?? []).reduce(
    (s: number, d: { esperados?: number; feitos?: number }) =>
      s + Math.max(0, (d.esperados || 0) - (d.feitos || 0)),
    0,
  );

  // ─── Deltas vs período anterior (DASH-2) ───
  // Saldo: comparar com saldo de 30 dias atrás (primeiro ponto da spark de 45d)
  const saldo30dAtras = sparks.saldo[Math.max(0, sparks.saldo.length - 30)] ?? saldo;
  const deltaSaldo = calcDelta(saldo, saldo30dAtras);

  // A receber/pagar: comparativo dia 1 vs dia 30 da spark.
  const deltaReceber = calcDelta(
    sparks.entradasAcum[sparks.entradasAcum.length - 1] ?? 0,
    sparks.entradasAcum[Math.max(0, sparks.entradasAcum.length - 30)] ?? 0,
  );
  const deltaPagar = calcDelta(
    sparks.saidasAcum[sparks.saidasAcum.length - 1] ?? 0,
    sparks.saidasAcum[Math.max(0, sparks.saidasAcum.length - 30)] ?? 0,
  );
  const deltaAportes = calcDelta(
    sparkAportes[sparkAportes.length - 1] ?? 0,
    sparkAportes[Math.max(0, sparkAportes.length - 30)] ?? 0,
  );
  const deltaProspeccao = calcDelta(
    sparkProspeccao[sparkProspeccao.length - 1] ?? 0,
    sparkProspeccao[Math.max(0, sparkProspeccao.length - 30)] ?? 0,
  );
  const deltaColab = calcDelta(
    sparkColab[sparkColab.length - 1] ?? 0,
    sparkColab[Math.max(0, sparkColab.length - 30)] ?? 0,
  );

  const margem = indicadores.margemMedia;
  const margemTone = margem > 20 ? 'pos' : margem > 0 ? 'warn' : 'neg';

  // ─── Header: saudação ───
  const horaH = new Date().getHours();
  const user = meQuery.data?.user;
  const nome = primeiroNome(user?.name ?? user?.email ?? null);
  const subParts: string[] = [];
  subParts.push(saldo >= 0 ? 'Caixa positivo' : 'Caixa negativo');
  const bmsAguard =
    nfsQuery.data?.filter((n) => !(n as { emitida?: unknown }).emitida).length ?? 0;
  if (bmsAguard > 0) subParts.push(`${bmsAguard} BM${bmsAguard !== 1 ? 's' : ''} aguardando emissão`);
  if (rdosAtrasados > 0)
    subParts.push(`${rdosAtrasados} RDO${rdosAtrasados !== 1 ? 's' : ''} atrasado${rdosAtrasados !== 1 ? 's' : ''}`);

  return (
    <div className="space-y-8">
      {/* Page header — saudação + status do dia. Mantém as classes legadas
          `page-header`/`page-title` para preservar o gradiente do tema,
          mas o `space-y-8` do wrapper já garante o respiro abaixo. */}
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {saudacao(horaH)}, {nome}
          </h1>
          <p className="page-subtitle mt-1.5 text-muted-foreground">
            {subParts.join(' · ')}
          </p>
        </div>
      </div>

      {/*
       * Hero bento (DASH-8): Pipeline horizontal (DASH-9) à esquerda como
       * peça grande; KPIs distribuídos no restante com tamanhos variados
       * por importância (saldo > demais).
       */}
      <BentoGrid>
        <BentoItem span="6x2">
          <PipelineCard pipeline={pipeline} />
        </BentoItem>

        <BentoItem span="3x2">
          <KpiCard
            label="Saldo em caixa"
            value={formatBRLk(saldo)}
            tone={saldo >= 0 ? 'pos' : 'neg'}
            meta={saldo >= 0 ? 'caixa positivo' : 'caixa negativo'}
            spark={sparks.saldo}
            delta={{ pct: deltaSaldo, periodLabel: 'vs 30d' }}
            href="/caixa"
            title={`${formatBRL(saldo)} — saldo histórico`}
          />
        </BentoItem>

        <BentoItem span="3x1">
          <KpiCard
            label="A receber (NFs)"
            value={formatBRLk(arp.totalAReceber)}
            tone="pos"
            meta={`${arp.nfsEmitidas} emitidas · ${arp.nfsPendentes} pendentes`}
            spark={sparks.entradasAcum}
            delta={{ pct: deltaReceber, periodLabel: 'vs 30d' }}
            href="/notas-fiscais?status=emitida"
            title={formatBRL(arp.totalAReceber)}
          />
        </BentoItem>

        <BentoItem span="3x1">
          <KpiCard
            label="A pagar (30d)"
            value={formatBRLk(arp.totalAPagar30d)}
            tone={arp.totalAPagar30d > 0 ? 'warn' : 'neutral'}
            meta={`${arp.cp30dCount} lançamento${arp.cp30dCount !== 1 ? 's' : ''}`}
            spark={sparks.saidasAcum}
            delta={{ pct: deltaPagar, periodLabel: 'vs 30d', inverted: true }}
            href="/contas-pagar?status=pendente"
            title={formatBRL(arp.totalAPagar30d)}
          />
        </BentoItem>

        <BentoItem span="3x1">
          <KpiCard
            label="Faturado (mês)"
            value={formatBRLk(faturado.faturadoMes)}
            tone={faturado.deltaPct >= 0 ? 'pos' : 'neg'}
            meta={`${formatBRL(faturado.faturadoMesAnt)} no mês ant.`}
            spark={sparks.entradaDia}
            delta={
              faturado.faturadoMesAnt > 0
                ? { pct: faturado.deltaPct, periodLabel: 'vs mês ant.' }
                : undefined
            }
            href="/caixa?type=entrada"
            title={formatBRL(faturado.faturadoMes)}
          />
        </BentoItem>

        <BentoItem span="3x1">
          <KpiCard
            label="Margem média"
            value={`${margem.toFixed(1)}%`}
            tone={margemTone}
            meta={`${indicadores.contratosAtivos} contrato${indicadores.contratosAtivos !== 1 ? 's' : ''} ativo${indicadores.contratosAtivos !== 1 ? 's' : ''}`}
            spark={sparks.saldo}
            href="/contratos"
          />
        </BentoItem>

        <BentoItem span="3x1">
          <KpiCard
            label="Prospecção"
            value={String(prospeccao.prospeccaoTotal)}
            tone={prospeccao.prospeccaoTotal > 0 ? 'warn' : 'neutral'}
            meta={`${prospeccao.rascunho} rascunho · ${prospeccao.enviada} enviada${prospeccao.aceita > 0 ? ` · ${prospeccao.aceita} aceita` : ''}`}
            spark={sparkProspeccao}
            delta={{ pct: deltaProspeccao, periodLabel: 'vs 30d' }}
            href="/proposta"
          />
        </BentoItem>

        <BentoItem span="3x1">
          <KpiCard
            label="Aportes acumulados"
            value={formatBRLk(aportesTotal)}
            tone="pos"
            meta="sócios + empresa"
            spark={sparkAportes}
            delta={{ pct: deltaAportes, periodLabel: 'vs 30d' }}
            href="/socios"
          />
        </BentoItem>

        <BentoItem span="3x1">
          <KpiCard
            label="Colaboradores"
            value={String(colab.ativos)}
            tone={colab.ativos > 0 ? 'pos' : 'neutral'}
            meta={
              colab.candidatos > 0
                ? `+ ${colab.candidatos} candidato${colab.candidatos !== 1 ? 's' : ''}`
                : 'ativos'
            }
            spark={sparkColab}
            delta={{ pct: deltaColab, periodLabel: 'vs 30d' }}
            href="/recursos"
          />
        </BentoItem>

        <BentoItem span="3x1">
          <KpiCard
            label="Cobertura caixa"
            value={`${coberturaMeses.toFixed(1)} meses`}
            tone={coberturaMeses >= 6 ? 'pos' : coberturaMeses >= 3 ? 'warn' : 'neg'}
            meta="runway com saídas médias 90d"
            spark={sparks.saldo}
            href="/caixa"
          />
        </BentoItem>

        {rdoStats && (
          <BentoItem span="3x1">
            <KpiCard
              label={`Aderência RDO ${rdoStats.diasUteisAvaliados}d`}
              value={`${rdoStats.aderencia7d}%`}
              tone={rdoStats.aderencia7d >= 80 ? 'pos' : rdoStats.aderencia7d >= 50 ? 'warn' : 'neg'}
              meta={
                rdosAtrasados > 0
                  ? `${rdosAtrasados} RDO${rdosAtrasados !== 1 ? 's' : ''} atrasado${rdosAtrasados !== 1 ? 's' : ''}`
                  : 'tudo em dia'
              }
              spark={(rdoStats.aderenciaDiaria ?? []).map((d: { pct: number }) => d.pct)}
              href="/rdos"
            />
          </BentoItem>
        )}
      </BentoGrid>

      {/* Card auxiliar de RDOs com mais detalhe — mantido fora do bento. */}
      {rdoStats && <RdosCard stats={rdoStats} />}

      {/* Alertas — list view com separadores entre itens */}
      {indicadores.riscos.length > 0 && (
        <Card className="!p-6">
          <h3 className="mb-5 text-base font-semibold leading-none tracking-tight">
            ⚠️ Alertas ({indicadores.riscos.length})
          </h3>
          <div className="divide-y divide-border">
            {indicadores.riscos.map((r, i) => (
              <div
                key={i}
                className="flex items-start gap-4 py-3 text-sm first:pt-0 last:pb-0"
              >
                <span
                  className={`min-w-[64px] font-semibold ${
                    r.sev === 'Alta'
                      ? 'text-destructive'
                      : r.sev === 'Média'
                        ? 'text-warning'
                        : 'text-muted-foreground'
                  }`}
                >
                  {r.sev}
                </span>
                <span className="flex-1 text-foreground leading-relaxed">
                  {r.desc}
                </span>
                {r.impacto > 0 && (
                  <strong className="text-destructive tabular-nums">
                    {formatBRL(r.impacto)}
                  </strong>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Gráfico Fluxo de Caixa — passado real + projeção 30/60/90 dias.
          Header com titulo + subtitulo à esquerda, toggle de projeção à
          direita. Body com `pt-2` extra antes do gráfico para respirar. */}
      <Card className="!p-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h3 className="m-0 text-base font-semibold leading-none tracking-tight">
              Fluxo de Caixa
            </h3>
            <p className="text-sm text-muted-foreground">
              30 dias passados + {projDays} dias projetados
            </p>
          </div>
          <div
            className="inline-flex overflow-hidden rounded-lg border border-border bg-muted/40 p-0.5"
            role="group"
            aria-label="Dias de projeção"
          >
            {PROJ_DAYS_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setProjDays(d)}
                className={`cursor-pointer rounded-md border-0 px-3.5 py-1.5 text-xs font-semibold transition-colors min-w-[44px] ${
                  projDays === d
                    ? 'bg-card text-foreground shadow-sm'
                    : 'bg-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
        {historicoCaixa.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Sem dados de caixa para exibir.
          </p>
        ) : (
          <div className="pt-4">
            <FluxoCaixaChart
              historico={historicoCaixa}
              projecao={saldoProjetado}
              saldoAtual={saldo}
              height={340}
            />
          </div>
        )}
      </Card>

      {/* NFs Situação */}
      <NfsStatusCard situacao={nfsSituacao} emitidas={arp.nfsEmitidas} />

      {/* Tabela Entradas Previstas */}
      {dash.projecaoFutura && dash.projecaoFutura.length > 0 && (
        <EntradasPrevistasTable projecaoFutura={dash.projecaoFutura} />
      )}
    </div>
  );
}
