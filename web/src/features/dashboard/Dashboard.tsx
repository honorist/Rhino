import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import Card from '../../components/ui/Card';
import Spinner from '../../components/ui/Spinner';
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
  calcFaturadoMes,
  calcNfsSituacao,
  calcPipeline,
  calcProspeccao,
  calcScoreSaude,
  calcSparklines,
  primeiroNome,
  saudacao,
} from './dashboardCalc';
import EntradasPrevistasTable from './EntradasPrevistasTable';
import FluxoCaixaChart from './FluxoCaixaChart';
import NfsStatusCard from './NfsStatusCard';
import PipelineCard from './PipelineCard';
import { useRdosDashboard } from './queries';
import RdosCard from './RdosCard';
import ScoreCard from './ScoreCard';

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

const VERDE = 'var(--color-success)';
const VERMELHO = '#E53E3E';
const AMARELO = '#D97706';
const NEUTRO = 'var(--color-text)';

type Tone = 'pos' | 'neg' | 'warn' | 'neutral';

// ─── Sparkline SVG inline ──────────────────────────────────────────
function Sparkline({ values, tone = 'neutral' }: { values: number[]; tone?: Tone }) {
  if (!values || values.length < 2) return null;
  const w = 80;
  const h = 26;
  const p = 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = (w - p * 2) / (values.length - 1);
  const points = values
    .map((v, i) => {
      const x = p + i * stepX;
      const y = h - p - ((v - min) / range) * (h - p * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const color =
    tone === 'pos' ? '#16A34A' : tone === 'neg' ? '#DC2626' : tone === 'warn' ? '#D97706' : '#64748B';
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: w, height: h }} aria-hidden="true">
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Card KPI ──────────────────────────────────────────────────────
interface KpiCardProps {
  label: string;
  value: string;
  meta?: string;
  tone?: Tone;
  href?: string;
  spark?: number[];
  title?: string;
}

function KpiCard({ label, value, meta, tone, href, spark, title }: KpiCardProps) {
  const valueColor =
    tone === 'pos' ? VERDE : tone === 'neg' ? VERMELHO : tone === 'warn' ? AMARELO : NEUTRO;
  const content = (
    <Card style={{ padding: 'var(--sp-md)', height: '100%', display: 'flex', flexDirection: 'column', gap: 4 }} title={title}>
      <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: valueColor, lineHeight: 1.1 }}>{value}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
        <span className="text-muted" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {meta ?? ''}
        </span>
        {spark && <Sparkline values={spark} tone={tone} />}
      </div>
    </Card>
  );
  return href ? (
    <Link to={href} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
      {content}
    </Link>
  ) : (
    content
  );
}

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
  }, [carregado, contractsQuery.data, caixaQuery.data, saidasQuery.data, nfsQuery.data, cpQuery.data]);

  if (!carregado || !indicadores) {
    return <Spinner label="Carregando dashboard..." />;
  }

  const caixa = caixaQuery.data ?? [];
  const dash = dashQuery.data ?? {};
  const saldo = dash.caixaBalance ?? indicadores.saldoCaixa;

  // ─── Indicadores derivados ───
  const faturado = calcFaturadoMes(caixa as unknown as Record<string, unknown>[]);
  const aportesTotal = calcAportes(
    (sociosQuery.data ?? []) as unknown as Record<string, unknown>[],
    (investQuery.data ?? []) as unknown as Record<string, unknown>[],
  );
  const prospeccao = calcProspeccao((propostasQuery.data ?? []) as unknown as Record<string, unknown>[]);
  const colab = calcColaboradores((recursosQuery.data ?? []) as unknown as Record<string, unknown>[]);
  const arp = calcAReceberPagar(
    (nfsQuery.data ?? []) as unknown as Record<string, unknown>[],
    (cpQuery.data ?? []) as unknown as Record<string, unknown>[],
  );
  const sparks = calcSparklines(caixa as unknown as Record<string, unknown>[]);
  const pipeline = calcPipeline(
    (nfsQuery.data ?? []) as unknown as Record<string, unknown>[],
    (saidasQuery.data ?? []) as unknown as Record<string, unknown>[],
  );
  const nfsSituacao = calcNfsSituacao((nfsQuery.data ?? []) as unknown as Record<string, unknown>[]);
  const coberturaMeses = calcCoberturaMeses(saldo, caixa as unknown as Record<string, unknown>[]);
  const historicoCaixa = dash.historicoCaixa ?? [];
  const saldoProjetado = dash.saldoProjetado ?? [];

  // Taxa de despesa = total saídas ÷ total contratado × 100
  const totalSaidas = (saidasQuery.data ?? []).reduce(
    (s, sd) => s + (Number((sd as { value?: unknown }).value) || 0),
    0,
  );
  const totalContratado = dash.totalContractValue ?? indicadores.totalContratado;
  const taxaDespesa = totalContratado > 0 ? (totalSaidas / totalContratado) * 100 : 0;
  const scoreSaude = calcScoreSaude(taxaDespesa, indicadores.margemMedia, saldo);

  const rdoStats = rdosQuery.data?.stats;
  const rdosAtrasados = (rdoStats?.aderenciaDiaria ?? []).reduce(
    (s: number, d: { esperados?: number; feitos?: number }) =>
      s + Math.max(0, (d.esperados || 0) - (d.feitos || 0)),
    0,
  );

  // ─── Header: saudação ───
  const horaH = new Date().getHours();
  const user = meQuery.data?.user;
  const nome = primeiroNome(user?.name ?? user?.email ?? null);
  const subParts: string[] = [];
  subParts.push(saldo >= 0 ? 'Caixa positivo' : 'Caixa negativo');
  const bmsAguard = nfsQuery.data?.filter((n) => !(n as { emitida?: unknown }).emitida).length ?? 0;
  if (bmsAguard > 0) subParts.push(`${bmsAguard} BM${bmsAguard !== 1 ? 's' : ''} aguardando emissão`);
  if (rdosAtrasados > 0)
    subParts.push(`${rdosAtrasados} RDO${rdosAtrasados !== 1 ? 's' : ''} atrasado${rdosAtrasados !== 1 ? 's' : ''}`);

  const margem = indicadores.margemMedia;
  const margemTone: Tone = margem > 20 ? 'pos' : margem > 0 ? 'warn' : 'neg';

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {saudacao(horaH)}, {nome}
          </h1>
          <p className="page-subtitle">{subParts.join(' · ')}</p>
        </div>
      </div>

      {/* HERO: Score + KPIs lado a lado */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(320px, 1fr) minmax(0, 2fr)',
          gap: 'var(--sp-lg)',
          marginBottom: 'var(--sp-xl)',
        }}
      >
        <ScoreCard
          score={scoreSaude}
          margemPct={margem}
          taxaPct={taxaDespesa}
          coberturaMeses={coberturaMeses}
          contratosAtivos={indicadores.contratosAtivos}
        />

        {/* Grid de 9 KPIs */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 'var(--sp-md)',
          }}
        >
          <KpiCard label="Saldo em caixa" value={formatBRLk(saldo)} tone={saldo >= 0 ? 'pos' : 'neg'} meta={saldo >= 0 ? 'caixa positivo' : 'caixa negativo'} spark={sparks.saldo} href="/caixa" title={`${formatBRL(saldo)} — saldo histórico`} />
          <KpiCard label="A receber (NFs)" value={formatBRLk(arp.totalAReceber)} meta={`${arp.nfsEmitidas} emitidas · ${arp.nfsPendentes} pendentes`} spark={sparks.entradasAcum} tone="pos" href="/notas-fiscais" title={`${formatBRL(arp.totalAReceber)}`} />
          <KpiCard label="A pagar (30d)" value={formatBRLk(arp.totalAPagar30d)} tone={arp.totalAPagar30d > 0 ? 'warn' : 'neutral'} meta={`${arp.cp30dCount} lançamento${arp.cp30dCount !== 1 ? 's' : ''}`} spark={sparks.saidasAcum} href="/contas-pagar" title={`${formatBRL(arp.totalAPagar30d)}`} />
          <KpiCard label="Faturado (mês)" value={formatBRLk(faturado.faturadoMes)} tone={faturado.deltaPct >= 0 ? 'pos' : 'neg'} meta={faturado.faturadoMesAnt > 0 ? `${faturado.deltaPct >= 0 ? '+' : ''}${faturado.deltaPct.toFixed(1)}% vs mês ant.` : 'sem comparativo'} spark={sparks.entradaDia} href="/caixa" title={`${formatBRL(faturado.faturadoMes)}`} />
          <KpiCard label="Margem média" value={`${margem.toFixed(1)}%`} tone={margemTone} meta={`${indicadores.contratosAtivos} contrato${indicadores.contratosAtivos !== 1 ? 's' : ''} ativo${indicadores.contratosAtivos !== 1 ? 's' : ''}`} href="/contratos" />
          <KpiCard label="Prospecção" value={String(prospeccao.prospeccaoTotal)} tone={prospeccao.prospeccaoTotal > 0 ? 'warn' : 'neutral'} meta={`${prospeccao.rascunho} rascunho · ${prospeccao.enviada} enviada${prospeccao.aceita > 0 ? ' · ' + prospeccao.aceita + ' aceita' : ''}`} href="/proposta" />
          <KpiCard label="Aportes acumulados" value={formatBRLk(aportesTotal)} meta="sócios + empresa" tone="pos" href="/socios" />
          <KpiCard label="Colaboradores" value={String(colab.ativos)} tone={colab.ativos > 0 ? 'pos' : 'neutral'} meta={colab.candidatos > 0 ? `+ ${colab.candidatos} candidato${colab.candidatos !== 1 ? 's' : ''}` : 'ativos'} href="/recursos" />
          {rdoStats && (
            <KpiCard
              label={`Aderência RDO ${rdoStats.diasUteisAvaliados}d`}
              value={`${rdoStats.aderencia7d}%`}
              tone={rdoStats.aderencia7d >= 80 ? 'pos' : rdoStats.aderencia7d >= 50 ? 'warn' : 'neg'}
              meta={rdosAtrasados > 0 ? `${rdosAtrasados} RDO${rdosAtrasados !== 1 ? 's' : ''} atrasado${rdosAtrasados !== 1 ? 's' : ''}` : 'tudo em dia'}
              spark={(rdoStats.aderenciaDiaria ?? []).map((d: { pct: number }) => d.pct)}
              href="/rdos"
            />
          )}
        </div>
      </div>

      {/* 2 colunas: ESQ Pipeline · DIR Card RDOs */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
          gap: 'var(--sp-lg)',
          marginBottom: 'var(--sp-xl)',
          alignItems: 'start',
        }}
      >
        <PipelineCard pipeline={pipeline} />
        {rdoStats && <RdosCard stats={rdoStats} />}
      </div>

      {/* Alertas */}
      {indicadores.riscos.length > 0 && (
        <Card style={{ padding: 'var(--sp-lg)', marginBottom: 'var(--sp-lg)' }}>
          <h3 style={{ margin: '0 0 var(--sp-md)', fontSize: 15 }}>
            ⚠️ Alertas ({indicadores.riscos.length})
          </h3>
          {indicadores.riscos.map((r, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: 'var(--sp-sm)',
                padding: '8px 0',
                borderBottom: i < indicadores.riscos.length - 1 ? '1px solid var(--color-border)' : undefined,
                fontSize: 14,
              }}
            >
              <span style={{ fontWeight: 700, color: r.sev === 'Alta' ? VERMELHO : r.sev === 'Média' ? AMARELO : 'var(--color-text-muted)', minWidth: 60 }}>
                {r.sev}
              </span>
              <span style={{ flex: 1 }}>{r.desc}</span>
              {r.impacto > 0 && <strong style={{ color: VERMELHO }}>{formatBRL(r.impacto)}</strong>}
            </div>
          ))}
        </Card>
      )}

      {/* Gráfico Fluxo de Caixa — passado real + projeção 30/60/90 dias */}
      <Card style={{ padding: 'var(--sp-lg)', marginBottom: 'var(--sp-lg)' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 'var(--sp-md)',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16 }}>
            Fluxo de Caixa — 30 dias passados + {projDays} dias projetados
          </h3>
          <div
            style={{
              display: 'inline-flex',
              border: '1px solid var(--color-border)',
              borderRadius: 6,
              overflow: 'hidden',
            }}
            role="group"
            aria-label="Dias de projeção"
          >
            {PROJ_DAYS_OPTIONS.map((d, i) => (
              <button
                key={d}
                type="button"
                onClick={() => setProjDays(d)}
                style={{
                  padding: '6px 14px',
                  border: 0,
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  background: projDays === d ? '#60A5FA' : 'transparent',
                  color: projDays === d ? '#fff' : 'var(--color-text-muted)',
                  borderRight: i < PROJ_DAYS_OPTIONS.length - 1 ? '1px solid var(--color-border)' : 0,
                }}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
        {historicoCaixa.length === 0 ? (
          <p className="text-muted" style={{ textAlign: 'center', padding: 'var(--sp-xl) 0' }}>
            Sem dados de caixa para exibir.
          </p>
        ) : (
          <FluxoCaixaChart
            historico={historicoCaixa}
            projecao={saldoProjetado}
            saldoAtual={saldo}
            height={300}
          />
        )}
      </Card>

      {/* NFs Situação */}
      <div style={{ marginBottom: 'var(--sp-lg)' }}>
        <NfsStatusCard situacao={nfsSituacao} emitidas={arp.nfsEmitidas} />
      </div>

      {/* Tabela Entradas Previstas */}
      {dash.projecaoFutura && dash.projecaoFutura.length > 0 && (
        <div style={{ marginBottom: 'var(--sp-lg)' }}>
          <EntradasPrevistasTable projecaoFutura={dash.projecaoFutura} />
        </div>
      )}
    </>
  );
}
