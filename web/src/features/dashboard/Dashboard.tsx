import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import Card from '../../components/ui/Card';
import Spinner from '../../components/ui/Spinner';
import { api } from '../../lib/api';
import { formatBRL, formatBRLk } from '../../lib/format';
import { useContracts } from '../contracts/queries';
import { calcRelatorio } from '../relatorio/calculations';
import { useCaixa, useContasPagar, useNotasFiscais } from '../resources';
import { useSaidas } from '../contracts/queries';

interface PontoSaldo {
  data: string;
  saldo: number;
}
interface DashboardData {
  caixaBalance?: number;
  saldoProjetado?: PontoSaldo[];
  contasPagarStatus?: { totalPendente?: number; pendentes?: number; vencidas?: number };
  margens?: { mediaPercentual?: number; faturamentoMes?: number; varMesAnteriorPct?: number };
}

const VERDE = 'var(--color-success)';
const VERMELHO = '#E53E3E';
const AMARELO = '#D97706';

const W = 600;
const H = 140;
const PAD = { top: 8, right: 8, bottom: 18, left: 8 };

function Sparkline({
  pontos,
  cor,
}: {
  pontos: { valor: number }[];
  cor: string;
}) {
  if (pontos.length < 2) return null;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const vals = pontos.map((p) => p.valor);
  const max = Math.max(0, ...vals);
  const min = Math.min(0, ...vals);
  const range = max - min || 1;
  const x = (i: number) => PAD.left + (i / (pontos.length - 1)) * plotW;
  const y = (v: number) => PAD.top + plotH - ((v - min) / range) * plotH;
  const pts = pontos.map((p, i) => `${x(i)},${y(p.valor)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      {min < 0 && (
        <line
          x1={PAD.left}
          y1={y(0)}
          x2={W - PAD.right}
          y2={y(0)}
          stroke="rgba(0,0,0,.1)"
          strokeDasharray="3 3"
        />
      )}
      <polyline
        points={pts}
        fill="none"
        stroke={cor}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Kpi({
  label,
  valor,
  cor,
  sub,
  link,
}: {
  label: string;
  valor: string;
  cor?: string;
  sub?: string;
  link?: string;
}) {
  const conteudo = (
    <Card style={{ padding: 'var(--sp-lg)', height: '100%' }}>
      <div
        className="text-muted"
        style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.04em' }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 800,
          marginTop: 4,
          color: cor ?? 'var(--color-text)',
        }}
      >
        {valor}
      </div>
      {sub && (
        <div className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>
          {sub}
        </div>
      )}
    </Card>
  );
  return link ? (
    <Link to={link} style={{ textDecoration: 'none', color: 'inherit' }}>
      {conteudo}
    </Link>
  ) : (
    conteudo
  );
}

const ATALHOS: { to: string; label: string }[] = [
  { to: '/contratos', label: '📋 Contratos' },
  { to: '/proposta', label: '📄 Propostas' },
  { to: '/rdos', label: '📝 RDOs' },
  { to: '/caixa', label: '💰 Caixa' },
  { to: '/contas-pagar', label: '💸 Contas a Pagar' },
  { to: '/notas-fiscais', label: '✅ NFs' },
  { to: '/previsao', label: '📈 Previsão' },
  { to: '/comparativo', label: '📊 Comparativo' },
  { to: '/relatorios', label: '📑 Relatório Gerencial' },
];

/** Dashboard — visão consolidada e atalhos (porte de js/views/Dashboard.js). */
export default function Dashboard() {
  const dashQuery = useQuery({
    queryKey: ['dashboard-home'],
    queryFn: () => api.get<DashboardData>('/api/dashboard?projDays=30'),
  });

  const contractsQuery = useContracts();
  const saidasQuery = useSaidas();
  const caixaQuery = useCaixa();
  const nfsQuery = useNotasFiscais();
  const cpQuery = useContasPagar();

  const carregado =
    !dashQuery.isLoading &&
    !contractsQuery.isLoading &&
    !saidasQuery.isLoading &&
    !caixaQuery.isLoading &&
    !nfsQuery.isLoading &&
    !cpQuery.isLoading;

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

  const dash = dashQuery.data ?? {};
  const saldo = dash.caixaBalance ?? indicadores.saldoCaixa;
  const projetado = dash.saldoProjetado ?? [];
  const sparkPontos = [
    { valor: saldo },
    ...projetado.map((p) => ({ valor: p.saldo })),
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">📊 Dashboard</h1>
          <p className="page-subtitle">
            Visão consolidada da operação · {indicadores.contratosAtivos}{' '}
            contrato(s) ativo(s)
          </p>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 'var(--sp-md)',
          marginBottom: 'var(--sp-lg)',
        }}
      >
        <Kpi
          label="Saldo em caixa"
          valor={formatBRL(saldo)}
          cor={saldo >= 0 ? VERDE : VERMELHO}
          link="/caixa"
          sub={
            indicadores.varSaldoPct != null
              ? `${indicadores.varSaldoPct >= 0 ? '+' : ''}${indicadores.varSaldoPct.toFixed(1)}% vs mês ant.`
              : undefined
          }
        />
        <Kpi
          label="A receber (NFs)"
          valor={formatBRL(indicadores.totalAReceber)}
          sub={`${indicadores.qtdNFsPend} NF(s) pendente(s)`}
          link="/notas-fiscais"
        />
        <Kpi
          label="A pagar (contas)"
          valor={formatBRL(indicadores.totalAPagar)}
          cor={indicadores.totalAPagar > 0 ? AMARELO : undefined}
          sub={`${indicadores.qtdCpPend} conta(s) em aberto`}
          link="/contas-pagar"
        />
        <Kpi
          label="Faturamento (mês)"
          valor={formatBRL(indicadores.faturamentoMes)}
          cor={
            indicadores.varFatPct != null && indicadores.varFatPct >= 0
              ? VERDE
              : undefined
          }
          sub={
            indicadores.varFatPct != null
              ? `${indicadores.varFatPct >= 0 ? '+' : ''}${indicadores.varFatPct.toFixed(1)}% vs mês ant.`
              : undefined
          }
        />
        <Kpi
          label="Margem média"
          valor={`${indicadores.margemMedia.toFixed(1)}%`}
          cor={
            indicadores.margemMedia >= 20
              ? VERDE
              : indicadores.margemMedia >= 0
                ? AMARELO
                : VERMELHO
          }
          sub="Meta ≥ 20%"
        />
        <Kpi
          label="Carteira"
          valor={formatBRL(indicadores.totalContratado)}
          sub={`${indicadores.contratosAtivos} contrato(s)`}
          link="/contratos"
        />
        <Kpi
          label="CR5 (concentração)"
          valor={`${indicadores.cr5.toFixed(1)}%`}
          cor={indicadores.cr5 > 70 ? VERMELHO : undefined}
          sub={indicadores.cr5 > 70 ? 'Concentração elevada' : 'Saudável'}
        />
        <Kpi
          label="Runway"
          valor={`${indicadores.runwayMeses} meses`}
          sub="Cobertura do gasto mensal"
        />
      </div>

      {sparkPontos.length > 1 && (
        <Card style={{ padding: 'var(--sp-lg)', marginBottom: 'var(--sp-lg)' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginBottom: 'var(--sp-sm)',
            }}
          >
            <strong style={{ fontSize: 15 }}>📈 Saldo projetado (30d)</strong>
            <Link
              to="/previsao"
              style={{ fontSize: 13, color: 'var(--color-primary)' }}
            >
              Ver detalhes →
            </Link>
          </div>
          <Sparkline pontos={sparkPontos} cor="#55588B" />
          <div
            className="text-muted"
            style={{ fontSize: 12, marginTop: 6, textAlign: 'center' }}
          >
            {formatBRLk(sparkPontos[0].valor)} hoje ·{' '}
            {formatBRLk(sparkPontos[sparkPontos.length - 1].valor)} em 30 dias
          </div>
        </Card>
      )}

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
                borderBottom:
                  i < indicadores.riscos.length - 1
                    ? '1px solid var(--color-border)'
                    : undefined,
                fontSize: 14,
              }}
            >
              <span
                style={{
                  fontWeight: 700,
                  color:
                    r.sev === 'Alta'
                      ? VERMELHO
                      : r.sev === 'Média'
                        ? AMARELO
                        : 'var(--color-text-muted)',
                  minWidth: 60,
                }}
              >
                {r.sev}
              </span>
              <span style={{ flex: 1 }}>{r.desc}</span>
              {r.impacto > 0 && (
                <strong style={{ color: VERMELHO }}>
                  {formatBRL(r.impacto)}
                </strong>
              )}
            </div>
          ))}
        </Card>
      )}

      <Card style={{ padding: 'var(--sp-lg)' }}>
        <h3 style={{ margin: '0 0 var(--sp-md)', fontSize: 15 }}>Atalhos</h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 'var(--sp-sm)',
          }}
        >
          {ATALHOS.map((a) => (
            <Link
              key={a.to}
              to={a.to}
              style={{
                padding: '10px 12px',
                background: 'var(--color-surface-2)',
                border: '1px solid var(--color-border)',
                borderRadius: 6,
                textDecoration: 'none',
                color: 'var(--color-text)',
                fontSize: 14,
              }}
            >
              {a.label}
            </Link>
          ))}
        </div>
      </Card>
    </>
  );
}
