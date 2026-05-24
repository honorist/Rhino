/**
 * Dashboard Corp — tema "Corporate" do ngx-admin (Akveo) portado pra React.
 * Referência visual: https://demo.akveo.com/ngx-admin/pages/dashboard?theme=corporate
 *
 * Características-chave do tema Corporate:
 *  - Background cinza muito claro (#F7F9FC) — não branco puro
 *  - Cards brancos com sombra suave + border-radius 6px
 *  - Tipografia limpa (Open Sans 14-15px corpo, 28-44px valores hero)
 *  - Cores accent: azul cobalto #36F (#2954FF) e turquesa #00D68F
 *  - Charts coloridos: azul, magenta, ciano, amarelo
 *  - Cards grandes com padding generoso (24px)
 *  - Header de card: título 15px medium + subtítulo 12px mute
 *  - Headers de seção em uppercase + letter-spacing
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Spinner from '../../components/ui/Spinner';
import { api } from '../../lib/api';
import { formatBRL, formatBRLk, isMaskingMoney } from '../../lib/format';
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
  calcCoberturaMeses,
  calcFaturadoMes,
  calcPipeline,
  calcScoreSaude,
  primeiroNome,
  saudacao,
} from '../dashboard/dashboardCalc';
import './dashboard-corp.css';

// Paleta ngx-admin Corporate (cores extraídas do theme.corporate.ts oficial)
const COR_SUCCESS = '#00D68F';
const COR_INFO = '#0095FF';
const COR_WARNING = '#FFAA00';
const COR_DANGER = '#FF3D71';
const COR_MAGENTA = '#FF386A';
const COR_AMBER = '#FFC94D';
const COR_GRAY_SUBTITLE = '#8F9BB3';

interface DashboardApi {
  caixaBalance?: number;
  historicoCaixa?: Array<{ data: string; saldo: number }>;
  saldoProjetado?: Array<{ data: string; saldo: number }>;
  totalContractValue?: number;
}

function CorpCard({
  title,
  subtitle,
  children,
  style,
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div className="corp-card" style={style}>
      {title && (
        <div className="corp-card-header">
          <div className="corp-card-title">{title}</div>
          {subtitle && <div className="corp-card-subtitle">{subtitle}</div>}
        </div>
      )}
      <div className="corp-card-body">{children}</div>
    </div>
  );
}

function StatTile({
  label,
  value,
  delta,
  icon,
  cor,
  href,
}: {
  label: string;
  value: string;
  delta?: string;
  icon: string;
  cor: string;
  href?: string;
}) {
  const inner = (
    <div className="corp-stat">
      <div className="corp-stat-icon" style={{ background: cor + '1A', color: cor }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="corp-stat-label">{label}</div>
        <div className="corp-stat-value">{value}</div>
        {delta && <div className="corp-stat-delta" style={{ color: cor }}>{delta}</div>}
      </div>
    </div>
  );
  return href ? (
    <Link to={href} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="corp-card">{inner}</div>
    </Link>
  ) : (
    <div className="corp-card">{inner}</div>
  );
}

export default function DashboardCorp() {
  const meQuery = useCurrentUser();
  const dashQuery = useQuery({
    queryKey: ['dashboard-corp', 30],
    queryFn: () => api.get<DashboardApi>('/api/dashboard?projDays=30'),
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

  if (!ready || !indicadores) return <Spinner label="Carregando dashboard…" />;

  const dash = (dashQuery.data ?? {}) as DashboardApi;
  const caixa = (caixaQuery.data ?? []) as unknown as Record<string, unknown>[];
  const saldo = dash.caixaBalance ?? indicadores.saldoCaixa;
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
  const aPagar = (cpQuery.data ?? []).reduce(
    (s, p) =>
      (p as { paid?: boolean }).paid
        ? s
        : s + (Number((p as { value?: unknown }).value) || 0),
    0,
  );
  const aReceber = (nfsQuery.data ?? []).reduce((s, nf) => {
    if ((nf as { caixaEntryId?: string }).caixaEntryId) return s;
    return s + (Number((nf as { valor?: unknown }).valor) || 0);
  }, 0);

  const user = meQuery.data?.user;
  const nome = primeiroNome(user?.name ?? user?.email ?? null);
  const greet = saudacao(new Date().getHours());

  // Recharts data
  const fluxoData = [
    ...(dash.historicoCaixa ?? []).map((p) => ({
      data: p.data,
      real: p.saldo,
      proj: null as number | null,
    })),
    ...(dash.saldoProjetado ?? []).map((p, i, arr) => ({
      data: p.data,
      real:
        i === 0 && (dash.historicoCaixa?.length ?? 0) > 0
          ? dash.historicoCaixa![dash.historicoCaixa!.length - 1].saldo
          : null,
      proj: p.saldo,
      _arrlen: arr.length,
    })),
  ];

  // Pipeline → pie
  const pipeData = [
    { name: 'Rascunho', value: pipe.rascunho.count, fill: COR_GRAY_SUBTITLE },
    { name: 'Aguard. emissão', value: pipe.aguardEmissao.count, fill: COR_AMBER },
    { name: 'NF emitida', value: pipe.nfEmitida.count, fill: COR_INFO },
    { name: 'Recebida', value: pipe.recebida.count, fill: COR_SUCCESS },
  ].filter((p) => p.value > 0);

  // Barras de pipeline (alternativa visual)
  const pipeBarras = pipeData.map((p) => ({ name: p.name, qtd: p.value, fill: p.fill }));

  // Score → arc
  const scoreCor = score.score >= 75 ? COR_SUCCESS : score.score >= 50 ? COR_WARNING : COR_DANGER;
  const scoreData = [
    { name: 'Score', value: score.score, fill: scoreCor },
    { name: 'Falta', value: 100 - score.score, fill: '#EDF1F7' },
  ];

  const maskAtivo = isMaskingMoney();

  return (
    <div className="dashboard-corp">
      <div className="corp-header">
        <div>
          <span className="corp-banner">Dashboard Corp · estilo ngx-admin Corporate</span>
          <h1 className="corp-greeting">
            {greet}, {nome} 👋
          </h1>
          <div className="corp-greeting-sub">
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>
        {maskAtivo && (
          <div className="corp-mask-notice">
            🙈 Seu perfil oculta valores monetários
          </div>
        )}
      </div>

      {/* Row 1: 4 statistic tiles */}
      <div className="corp-row corp-stats-row">
        <StatTile
          label="Saldo em caixa"
          value={formatBRL(saldo)}
          delta={`Cobertura ${coberturaMeses.toFixed(1)} meses`}
          icon="💰"
          cor={saldo >= 0 ? COR_SUCCESS : COR_DANGER}
          href="/caixa"
        />
        <StatTile
          label="Receitas (mês)"
          value={formatBRL(faturadoMes)}
          delta={`A receber ${formatBRLk(aReceber)}`}
          icon="📈"
          cor={COR_INFO}
          href="/notas-fiscais"
        />
        <StatTile
          label="Custos (acum.)"
          value={formatBRL(totalSaidas)}
          delta={`A pagar ${formatBRLk(aPagar)}`}
          icon="📉"
          cor={COR_WARNING}
          href="/contas-pagar"
        />
        <StatTile
          label="Margem média"
          value={`${indicadores.margemMedia.toFixed(1)}%`}
          delta={`${indicadores.contratosAtivos} contratos ativos`}
          icon="🎯"
          cor={indicadores.margemMedia >= 20 ? COR_SUCCESS : indicadores.margemMedia >= 10 ? COR_WARNING : COR_DANGER}
          href="/contratos"
        />
      </div>

      {/* Row 2: Fluxo de Caixa (2 cols) + Score (1 col) */}
      <div className="corp-row" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <CorpCard title="Fluxo de Caixa" subtitle="Histórico real + projeção dos próximos 30 dias">
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={fluxoData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="corpReal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COR_INFO} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={COR_INFO} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="corpProj" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COR_MAGENTA} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={COR_MAGENTA} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#EDF1F7" vertical={false} />
                <XAxis
                  dataKey="data"
                  fontSize={11}
                  stroke={COR_GRAY_SUBTITLE}
                  tickFormatter={(d: string) => {
                    const dt = new Date(d);
                    return Number.isNaN(dt.getTime())
                      ? d
                      : `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}`;
                  }}
                  minTickGap={24}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  fontSize={11}
                  stroke={COR_GRAY_SUBTITLE}
                  tickFormatter={(v: number) => formatBRLk(v)}
                  width={64}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 6,
                    border: '1px solid #E4E9F2',
                    background: '#FFF',
                    fontSize: 12,
                  }}
                  labelFormatter={(d) => {
                    const dt = new Date(String(d));
                    return Number.isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString('pt-BR');
                  }}
                  formatter={(v, n) => {
                    const num = Number(v);
                    return [
                      Number.isFinite(num) ? formatBRL(num) : '—',
                      String(n) === 'real' ? 'Real' : 'Projeção',
                    ];
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="real"
                  stroke={COR_INFO}
                  strokeWidth={2.5}
                  fill="url(#corpReal)"
                  connectNulls
                />
                <Area
                  type="monotone"
                  dataKey="proj"
                  stroke={COR_MAGENTA}
                  strokeWidth={2.5}
                  strokeDasharray="6 4"
                  fill="url(#corpProj)"
                  connectNulls
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CorpCard>

        <CorpCard title="Saúde Financeira" subtitle={score.label}>
          <div style={{ position: 'relative', height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={scoreData}
                  innerRadius={64}
                  outerRadius={88}
                  startAngle={210}
                  endAngle={-30}
                  dataKey="value"
                  stroke="none"
                >
                  {scoreData.map((s, i) => (
                    <Cell key={i} fill={s.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
              }}
            >
              <div style={{ fontSize: 36, fontWeight: 700, color: scoreCor, lineHeight: 1 }}>
                {score.score}
              </div>
              <div style={{ fontSize: 12, color: COR_GRAY_SUBTITLE }}>/ 100</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginTop: 12 }}>
            <div className="corp-mini-stat">
              <span className="corp-mini-label">Taxa despesa</span>
              <span className="corp-mini-value">{taxaDespesa.toFixed(1)}%</span>
            </div>
            <div className="corp-mini-stat">
              <span className="corp-mini-label">Cobertura</span>
              <span className="corp-mini-value">{coberturaMeses.toFixed(1)} mo</span>
            </div>
          </div>
        </CorpCard>
      </div>

      {/* Row 3: Pipeline bars */}
      <div className="corp-row" style={{ gridTemplateColumns: '1fr' }}>
        <CorpCard title="Pipeline de Faturamento" subtitle="Distribuição das notas no funil">
          {pipeBarras.length === 0 ? (
            <p style={{ color: COR_GRAY_SUBTITLE, padding: 20, textAlign: 'center' }}>
              Sem dados de pipeline ainda.
            </p>
          ) : (
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pipeBarras} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EDF1F7" vertical={false} />
                  <XAxis dataKey="name" fontSize={12} stroke={COR_GRAY_SUBTITLE} tickLine={false} axisLine={false} />
                  <YAxis fontSize={11} stroke={COR_GRAY_SUBTITLE} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 6,
                      border: '1px solid #E4E9F2',
                      fontSize: 12,
                    }}
                    cursor={{ fill: 'rgba(51,102,255,.05)' }}
                  />
                  <Bar dataKey="qtd" radius={[6, 6, 0, 0]}>
                    {pipeBarras.map((p, i) => (
                      <Cell key={i} fill={p.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CorpCard>
      </div>
    </div>
  );
}
