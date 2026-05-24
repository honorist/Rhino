/**
 * Dashboard v2 — protótipo "Personalizável" (drag & drop).
 *
 * Plugins novos:
 *   - react-grid-layout: grade onde cada card é arrastável e redimensionável.
 *   - recharts:           gráficos React-native (LineChart pra sparklines, AreaChart pro fluxo de caixa).
 *   - framer-motion:      animação de entrada dos cards e transições de valores.
 *
 * Esta tela NÃO substitui o Dashboard atual — fica em /dashboard-v2 paralelo
 * pra aprovação visual. Quando aprovada, vira o `Dashboard.tsx` principal.
 *
 * Layout: persiste em localStorage (`rhino:dash-v2:layout`). Botão "Resetar"
 * volta ao default. Modo edição habilita o drag/resize.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
// react-grid-layout v2: o `useContainerWidth` substitui o antigo WidthProvider.
// Envolvemos a grid num ref que mede a largura via ResizeObserver e só
// renderiza após a primeira medição.
import { ResponsiveGridLayout, useContainerWidth } from 'react-grid-layout';
interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
  static?: boolean;
}
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
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
  calcCoberturaMeses,
  calcFaturadoMes,
  calcPipeline,
  calcScoreSaude,
  calcSparklines,
  primeiroNome,
  saudacao,
} from '../dashboard/dashboardCalc';

import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import './dashboard-v2.css';


// ─── Tipos da API (mesma do Dashboard atual) ─────────────────────────────
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
  historicoCaixa?: PontoHistorico[];
  saldoProjetado?: PontoProjetado[];
  totalContractValue?: number;
}

const PROJ_DAYS = [30, 60, 90] as const;
type ProjDays = (typeof PROJ_DAYS)[number];

const LAYOUT_KEY = 'rhino:dash-v2:layout';

/** Cards default — id, posição, tamanho mínimo. */
const DEFAULT_LAYOUT_LG: LayoutItem[] = [
  { i: 'saldo', x: 0, y: 0, w: 3, h: 3, minW: 2, minH: 2 },
  { i: 'receitas', x: 3, y: 0, w: 3, h: 3, minW: 2, minH: 2 },
  { i: 'custos', x: 6, y: 0, w: 3, h: 3, minW: 2, minH: 2 },
  { i: 'margem', x: 9, y: 0, w: 3, h: 3, minW: 2, minH: 2 },
  { i: 'fluxo', x: 0, y: 3, w: 8, h: 7, minW: 4, minH: 5 },
  { i: 'score', x: 8, y: 3, w: 4, h: 4, minW: 3, minH: 3 },
  { i: 'pipeline', x: 8, y: 7, w: 4, h: 3, minW: 3, minH: 3 },
];

/** Layout mobile (1 coluna). */
const DEFAULT_LAYOUT_SM: LayoutItem[] = [
  { i: 'saldo', x: 0, y: 0, w: 12, h: 3 },
  { i: 'receitas', x: 0, y: 3, w: 12, h: 3 },
  { i: 'custos', x: 0, y: 6, w: 12, h: 3 },
  { i: 'margem', x: 0, y: 9, w: 12, h: 3 },
  { i: 'fluxo', x: 0, y: 12, w: 12, h: 6 },
  { i: 'score', x: 0, y: 18, w: 12, h: 4 },
  { i: 'pipeline', x: 0, y: 22, w: 12, h: 4 },
];

function loadLayout(): { lg: LayoutItem[]; sm: LayoutItem[] } {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return { lg: DEFAULT_LAYOUT_LG, sm: DEFAULT_LAYOUT_SM };
    const parsed = JSON.parse(raw) as { lg?: LayoutItem[]; sm?: LayoutItem[] };
    return {
      lg: parsed.lg ?? DEFAULT_LAYOUT_LG,
      sm: parsed.sm ?? DEFAULT_LAYOUT_SM,
    };
  } catch {
    return { lg: DEFAULT_LAYOUT_LG, sm: DEFAULT_LAYOUT_SM };
  }
}

function saveLayout(lg: LayoutItem[], sm: LayoutItem[]) {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify({ lg, sm }));
  } catch {
    // localStorage cheio ou indisponível — ignora silenciosamente
  }
}

// ─── Cards individuais ─────────────────────────────────────────────────────

interface KpiTileProps {
  label: string;
  value: string;
  tone?: 'pos' | 'neg' | 'warn' | 'neutral';
  delta?: string;
  spark?: number[];
  href?: string;
  title?: string;
}

function KpiTile({ label, value, tone = 'neutral', delta, spark, href, title }: KpiTileProps) {
  const color =
    tone === 'pos' ? '#16A34A' : tone === 'neg' ? '#DC2626' : tone === 'warn' ? '#D97706' : '#0F172A';
  const data = (spark ?? []).map((v, i) => ({ i, v }));

  const inner = (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      style={{ width: '100%', height: '100%' }}
    >
      <Card
        style={{
          padding: 'var(--sp-md)',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          overflow: 'hidden',
        }}
        title={title}
      >
        <div
          className="text-muted"
          style={{
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '.05em',
            fontWeight: 700,
          }}
        >
          {label}
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={value}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.18 }}
            style={{
              fontSize: 26,
              fontWeight: 800,
              color,
              lineHeight: 1.1,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {value}
          </motion.div>
        </AnimatePresence>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8 }}>
          {delta && (
            <span style={{ fontSize: 12, color, fontWeight: 600 }}>{delta}</span>
          )}
          {data.length > 1 && (
            <div style={{ width: 90, height: 30, marginLeft: 'auto' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <Line
                    type="monotone"
                    dataKey="v"
                    stroke={color}
                    strokeWidth={1.8}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );

  return href ? (
    <Link to={href} style={{ textDecoration: 'none', color: 'inherit' }}>
      {inner}
    </Link>
  ) : (
    inner
  );
}

/** Gráfico de Fluxo de Caixa (Recharts AreaChart) — passado real + projeção. */
function FluxoCaixaCard({
  historico,
  projecao,
  projDays,
  setProjDays,
}: {
  historico: PontoHistorico[];
  projecao: PontoProjetado[];
  projDays: ProjDays;
  setProjDays: (d: ProjDays) => void;
}) {
  const merged = useMemo(() => {
    const hist = historico.map((p) => ({
      data: p.data,
      real: p.saldo,
      proj: null as number | null,
    }));
    const ult = historico.length > 0 ? historico[historico.length - 1] : null;
    // Inicia a projeção no último ponto real para a linha não ficar interrompida.
    const proj = projecao.map((p, idx) => ({
      data: p.data,
      real: null as number | null,
      proj: p.saldo,
      ...(idx === 0 && ult ? { real: ult.saldo } : {}),
    }));
    return [...hist, ...proj];
  }, [historico, projecao]);

  return (
    <Card
      style={{
        padding: 'var(--sp-md)',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--color-text)',
            }}
          >
            Fluxo de Caixa
          </div>
          <div className="text-muted" style={{ fontSize: 12 }}>
            Histórico real · linha tracejada = projeção {projDays}d
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {PROJ_DAYS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setProjDays(d)}
              style={{
                padding: '4px 10px',
                fontSize: 12,
                fontWeight: 600,
                border: '1px solid var(--color-border)',
                borderRadius: 6,
                background: projDays === d ? 'var(--color-primary)' : 'transparent',
                color: projDays === d ? '#fff' : 'var(--color-text)',
                cursor: 'pointer',
              }}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={merged} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="realFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#16A34A" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#16A34A" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="projFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.25)" />
            <XAxis
              dataKey="data"
              fontSize={11}
              tickFormatter={(d: string) => {
                const dt = new Date(d);
                return Number.isNaN(dt.getTime())
                  ? d
                  : `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}`;
              }}
              minTickGap={20}
            />
            <YAxis
              fontSize={11}
              tickFormatter={(v: number) => formatBRLk(v)}
              width={56}
            />
            <Tooltip
              labelFormatter={(d) => {
                const s = String(d ?? '');
                const dt = new Date(s);
                return Number.isNaN(dt.getTime()) ? s : dt.toLocaleDateString('pt-BR');
              }}
              formatter={(v, name) => {
                const num = typeof v === 'number' ? v : Number(v);
                if (!Number.isFinite(num)) return ['—', String(name)];
                return [
                  formatBRL(num),
                  String(name) === 'real' ? 'Real' : 'Projeção',
                ];
              }}
              contentStyle={{ borderRadius: 8, border: '1px solid var(--color-border)' }}
            />
            <Area
              type="monotone"
              dataKey="real"
              stroke="#16A34A"
              strokeWidth={2}
              fill="url(#realFill)"
              connectNulls
              isAnimationActive
            />
            <Area
              type="monotone"
              dataKey="proj"
              stroke="#3B82F6"
              strokeWidth={2}
              strokeDasharray="6 4"
              fill="url(#projFill)"
              connectNulls
              isAnimationActive
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function ScoreTile({ score, label }: { score: number; label: string }) {
  // Gauge SVG simples (semi-círculo)
  const safe = Math.max(0, Math.min(100, score));
  const angle = (safe / 100) * 180; // 0 a 180 graus
  const r = 56;
  const cx = 70;
  const cy = 70;
  const rad = (a: number) => (a - 180) * (Math.PI / 180);
  const end = { x: cx + r * Math.cos(rad(angle)), y: cy + r * Math.sin(rad(angle)) };
  const cor =
    safe >= 75 ? '#16A34A' : safe >= 50 ? '#D97706' : '#DC2626';

  return (
    <Card style={{ padding: 'var(--sp-md)', height: '100%', overflow: 'hidden' }}>
      <div
        className="text-muted"
        style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}
      >
        Score de saúde
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
        <svg viewBox="0 0 140 80" width="100%" height="100">
          {/* Fundo */}
          <path
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
            fill="none"
            stroke="rgba(148,163,184,.25)"
            strokeWidth={10}
            strokeLinecap="round"
          />
          {/* Preenchimento */}
          <motion.path
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${end.x} ${end.y}`}
            fill="none"
            stroke={cor}
            strokeWidth={10}
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: safe / 100 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        </svg>
      </div>
      <div style={{ textAlign: 'center', marginTop: -16 }}>
        <div style={{ fontSize: 32, fontWeight: 800, color: cor, fontVariantNumeric: 'tabular-nums' }}>
          {safe}
        </div>
        <div className="text-muted" style={{ fontSize: 13 }}>
          {label}
        </div>
      </div>
    </Card>
  );
}

function PipelineTile({
  rascunho,
  aguardEmissao,
  nfEmitida,
  recebida,
}: {
  rascunho: number;
  aguardEmissao: number;
  nfEmitida: number;
  recebida: number;
}) {
  const stages = [
    { label: 'Rascunho', value: rascunho, cor: '#64748B' },
    { label: 'Aguard. emissão', value: aguardEmissao, cor: '#D97706' },
    { label: 'NF emitida', value: nfEmitida, cor: '#3B82F6' },
    { label: 'Recebida', value: recebida, cor: '#16A34A' },
  ];
  const max = Math.max(1, ...stages.map((s) => s.value));
  return (
    <Card style={{ padding: 'var(--sp-md)', height: '100%', overflow: 'hidden' }}>
      <div
        className="text-muted"
        style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}
      >
        Pipeline de Contratos
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
        {stages.map((s) => (
          <div key={s.label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span>{s.label}</span>
              <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{s.value}</strong>
            </div>
            <div
              style={{
                height: 8,
                background: 'rgba(148,163,184,.15)',
                borderRadius: 4,
                overflow: 'hidden',
                marginTop: 4,
              }}
            >
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(s.value / max) * 100}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                style={{ height: '100%', background: s.cor }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Shell que mede a largura e passa para a grid responsiva ─────────────

interface GridShellProps {
  edit: boolean;
  layouts: { lg: LayoutItem[]; sm: LayoutItem[] };
  onChange: (lg: LayoutItem[], sm: LayoutItem[]) => void;
  children: React.ReactNode;
}

function GridShell({ edit, layouts, onChange, children }: GridShellProps) {
  const { width, containerRef, mounted } = useContainerWidth({ initialWidth: 1280 });
  return (
    <div ref={containerRef as React.RefObject<HTMLDivElement>}>
      {mounted && (
        <ResponsiveGridLayout
          width={width}
          className={`layout ${edit ? 'editing' : ''}`}
          layouts={{
            lg: layouts.lg,
            md: layouts.lg,
            sm: layouts.sm,
            xs: layouts.sm,
            xxs: layouts.sm,
          }}
          breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
          cols={{ lg: 12, md: 12, sm: 12, xs: 12, xxs: 12 }}
          rowHeight={36}
          dragConfig={{ enabled: edit, bounded: false }}
          resizeConfig={{ enabled: edit, handles: ['se'] }}
          margin={[12, 12]}
          onLayoutChange={(_current, all) => {
            const lg = (all.lg ?? layouts.lg) as LayoutItem[];
            const sm = (all.sm ?? all.xs ?? layouts.sm) as LayoutItem[];
            onChange(lg, sm);
          }}
        >
          {children}
        </ResponsiveGridLayout>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────

export default function Dashboard2() {
  const meQuery = useCurrentUser();
  const [projDays, setProjDays] = useState<ProjDays>(30);
  const [edit, setEdit] = useState(false);
  const [layouts, setLayouts] = useState(() => loadLayout());

  const dashQuery = useQuery({
    queryKey: ['dashboard-v2', projDays],
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

  const carregado =
    !contractsQuery.isLoading &&
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

  useEffect(() => {
    saveLayout(layouts.lg, layouts.sm);
  }, [layouts]);

  if (!carregado || !indicadores) {
    return <Spinner label="Carregando dashboard…" />;
  }

  const dash = (dashQuery.data ?? {}) as DashboardData;
  const historico = dash.historicoCaixa ?? [];
  const projecao = dash.saldoProjetado ?? [];

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
  const margem = indicadores.margemMedia;

  // a pagar (contas em aberto) e a receber (NFs emitidas mas não recebidas)
  const aPagar = (cpQuery.data ?? []).reduce(
    (s, p) =>
      (p as { paid?: boolean }).paid
        ? s
        : s + (Number((p as { value?: unknown }).value) || 0),
    0,
  );
  const aReceber = (nfsQuery.data ?? []).reduce((s, nf) => {
    const recebida = !!(nf as { caixaEntryId?: string }).caixaEntryId;
    if (recebida) return s;
    return s + (Number((nf as { valor?: unknown }).valor) || 0);
  }, 0);

  function handleResetLayout() {
    if (!window.confirm('Voltar ao layout padrão?')) return;
    setLayouts({ lg: DEFAULT_LAYOUT_LG, sm: DEFAULT_LAYOUT_SM });
  }

  return (
    <div className="dashboard-v2">
      <div className="page-header" style={{ alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>
            {saudacao(new Date().getHours())},{' '}
            {primeiroNome(
              meQuery.data?.user?.name ?? meQuery.data?.user?.email ?? null,
            )}{' '}
            👋
          </h1>
          <p className="page-subtitle">
            {new Date().toLocaleDateString('pt-BR', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
            {' · '}
            <span style={{ fontSize: 11, fontWeight: 700, color: '#3B82F6' }}>
              BETA v2
            </span>
            {' · '}
            <Link to="/dashboard" style={{ color: '#64748B' }}>
              ← voltar ao dashboard atual
            </Link>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant={edit ? 'success' : 'secondary'} onClick={() => setEdit((v) => !v)}>
            {edit ? '✓ Concluir edição' : '✏️ Editar layout'}
          </Button>
          <Button variant="secondary" onClick={handleResetLayout}>
            ↻ Resetar
          </Button>
        </div>
      </div>

      {edit && (
        <div
          style={{
            padding: '8px 12px',
            background: 'rgba(59,130,246,.08)',
            border: '1px dashed #3B82F6',
            borderRadius: 8,
            fontSize: 13,
            color: '#1E40AF',
            marginBottom: 12,
          }}
        >
          🖐️ Arraste qualquer card pra mover. Use o canto inferior direito pra redimensionar. Clique
          em "Concluir edição" quando terminar — o layout é salvo automaticamente.
        </div>
      )}

      <GridShell
        edit={edit}
        layouts={layouts}
        onChange={(lg, sm) => setLayouts({ lg, sm })}
      >
        <div key="saldo">
          <KpiTile
            label="Saldo em caixa"
            value={formatBRL(saldo)}
            tone={saldo >= 0 ? 'pos' : 'neg'}
            spark={sparks.saldo}
            delta={`Cobertura ${coberturaMeses.toFixed(1)} meses`}
            href="/caixa"
          />
        </div>
        <div key="receitas">
          <KpiTile
            label="Receitas (mês)"
            value={formatBRL(faturadoMes)}
            tone="pos"
            spark={sparks.entradasAcum}
            delta={`A receber ${formatBRLk(aReceber)}`}
            href="/notas-fiscais"
          />
        </div>
        <div key="custos">
          <KpiTile
            label="Custos (acum.)"
            value={formatBRL(totalSaidas)}
            tone="neg"
            spark={sparks.saidasAcum}
            delta={`A pagar ${formatBRLk(aPagar)}`}
            href="/contas-pagar"
          />
        </div>
        <div key="margem">
          <KpiTile
            label="Margem média"
            value={`${margem.toFixed(1)}%`}
            tone={margem >= 20 ? 'pos' : margem >= 10 ? 'warn' : 'neg'}
            delta={`${indicadores.contratosAtivos} contratos ativos`}
            href="/contratos"
          />
        </div>
        <div key="fluxo">
          <FluxoCaixaCard
            historico={historico}
            projecao={projecao}
            projDays={projDays}
            setProjDays={setProjDays}
          />
        </div>
        <div key="score">
          <ScoreTile score={score.score} label={score.label} />
        </div>
        <div key="pipeline">
          <PipelineTile
            rascunho={pipe.rascunho.count}
            aguardEmissao={pipe.aguardEmissao.count}
            nfEmitida={pipe.nfEmitida.count}
            recebida={pipe.recebida.count}
          />
        </div>
      </GridShell>
    </div>
  );
}
