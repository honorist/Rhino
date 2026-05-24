import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Spinner from '../../components/ui/Spinner';
import { api } from '../../lib/api';
import { formatBRL, formatBRLk } from '../../lib/format';
import { formatDateBR } from '../../lib/formatDate';

interface PontoSaldo {
  data: string;
  saldo: number;
}
interface EntradaDia {
  data: string;
  entradas: { numero?: string; valor?: number }[];
}
interface OcorrenciaVirtual {
  data: string;
  descricao?: string;
  valor?: number;
}
interface PrevisaoData {
  saldoProjetado?: PontoSaldo[];
  projecaoFutura?: EntradaDia[];
  caixaBalance?: number;
  contasPagarStatus?: { totalPendente?: number; pendentes?: number };
  ocorrenciasVirtuais?: OcorrenciaVirtual[];
}

const W = 760;
const H = 280;
const PAD = { top: 16, right: 16, bottom: 40, left: 64 };

/** Gráfico de linha do saldo projetado — SVG, suporta valores negativos. */
function SaldoChart({ pontos }: { pontos: { label: string; valor: number }[] }) {
  if (pontos.length < 2) {
    return <p className="text-muted">Sem dados para o gráfico.</p>;
  }
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const vals = pontos.map((p) => p.valor);
  const max = Math.max(0, ...vals);
  const min = Math.min(0, ...vals);
  const range = max - min || 1;
  const x = (i: number) => PAD.left + (i / (pontos.length - 1)) * plotW;
  const y = (v: number) => PAD.top + plotH - ((v - min) / range) * plotH;

  const linha = pontos.map((p, i) => `${x(i)},${y(p.valor)}`).join(' ');
  const passo = Math.ceil(pontos.length / 8);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: 'auto' }}
      role="img"
      aria-label="Evolução do saldo projetado"
    >
      {[0, 0.25, 0.5, 0.75, 1].map((f) => {
        const yy = PAD.top + plotH - f * plotH;
        return (
          <g key={f}>
            <line
              x1={PAD.left}
              y1={yy}
              x2={W - PAD.right}
              y2={yy}
              stroke="rgba(0,0,0,.06)"
            />
            <text x={PAD.left - 8} y={yy + 4} textAnchor="end" fontSize={11} fill="#64748b">
              {formatBRLk(min + f * range)}
            </text>
          </g>
        );
      })}
      {/* Linha do zero, se houver negativos. */}
      {min < 0 && (
        <line
          x1={PAD.left}
          y1={y(0)}
          x2={W - PAD.right}
          y2={y(0)}
          stroke="#94a3b8"
          strokeDasharray="4 3"
        />
      )}
      {pontos.map((p, i) =>
        i % passo === 0 ? (
          <text
            key={i}
            x={x(i)}
            y={H - PAD.bottom + 16}
            textAnchor="middle"
            fontSize={10}
            fill="#64748b"
          >
            {p.label}
          </text>
        ) : null,
      )}
      <polyline
        points={linha}
        fill="none"
        stroke="#55588B"
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      {pontos.map((p, i) => (
        <circle
          key={i}
          cx={x(i)}
          cy={y(p.valor)}
          r={3}
          fill={p.valor >= 0 ? '#38A169' : '#E53E3E'}
        />
      ))}
    </svg>
  );
}

function Kpi({
  label,
  valor,
  cor,
  sub,
}: {
  label: string;
  valor: string;
  cor: string;
  sub?: string;
}) {
  return (
    <Card style={{ textAlign: 'center', padding: 'var(--sp-md)' }}>
      <div
        className="text-muted"
        style={{ fontSize: 12, textTransform: 'uppercase', marginBottom: 4 }}
      >
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: cor }}>{valor}</div>
      {sub && (
        <div className="text-muted" style={{ fontSize: 12 }}>
          {sub}
        </div>
      )}
    </Card>
  );
}

const VERDE = 'var(--color-success)';
const VERMELHO = '#E53E3E';

/** Previsão de Caixa — porte de js/views/Previsao.js. */
export default function Previsao() {
  const [days, setDays] = useState(60);

  const query = useQuery({
    queryKey: ['previsao', days],
    queryFn: () => api.get<PrevisaoData>(`/api/dashboard?projDays=${days}`),
  });

  if (query.isLoading) return <Spinner label="Carregando previsão…" />;
  if (query.isError || !query.data) {
    return <div className="error-banner">Erro ao carregar a previsão.</div>;
  }

  const d = query.data;
  const saldoProjetado = d.saldoProjetado ?? [];
  const caixaBalance = d.caixaBalance ?? 0;
  const saldoFinal = saldoProjetado.length
    ? saldoProjetado[saldoProjetado.length - 1].saldo
    : caixaBalance;
  const minimo = saldoProjetado.length
    ? Math.min(...saldoProjetado.map((p) => p.saldo))
    : 0;
  const temNegativo = minimo < 0;
  const cpStatus = d.contasPagarStatus ?? {};

  const pontosChart = [
    { label: 'Hoje', valor: caixaBalance },
    ...saldoProjetado.map((p) => ({
      label: formatDateBR(p.data).slice(0, 5),
      valor: p.saldo,
    })),
  ];

  const entradas = (d.projecaoFutura ?? []).flatMap((dia) =>
    dia.entradas.map((e) => ({ data: dia.data, ...e })),
  );

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">📈 Previsão de Caixa</h1>
          <p className="page-subtitle">
            Saldo projetado considerando NFs emitidas, contas a pagar e
            recorrências
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[30, 60, 90, 180].map((dd) => (
            <Button
              key={dd}
              size="sm"
              variant={days === dd ? 'primary' : 'secondary'}
              onClick={() => setDays(dd)}
            >
              {dd}d
            </Button>
          ))}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 'var(--sp-md)',
          marginBottom: 'var(--sp-lg)',
        }}
      >
        <Kpi
          label="Saldo Atual"
          valor={formatBRL(caixaBalance)}
          cor={caixaBalance >= 0 ? VERDE : VERMELHO}
        />
        <Kpi
          label={`Saldo Projetado (${days}d)`}
          valor={formatBRL(saldoFinal)}
          cor={saldoFinal >= 0 ? VERDE : VERMELHO}
        />
        <Kpi
          label="Mínimo Projetado"
          valor={formatBRL(minimo)}
          cor={minimo >= 0 ? VERDE : VERMELHO}
          sub={temNegativo ? '⚠️ Saldo negativo previsto' : undefined}
        />
        <Kpi
          label="CP Pendentes"
          valor={formatBRL(cpStatus.totalPendente ?? 0)}
          cor={VERMELHO}
          sub={`${cpStatus.pendentes ?? 0} contas`}
        />
      </div>

      {temNegativo && (
        <div
          style={{
            background: '#FEE2E2',
            border: '1px solid #FECACA',
            borderRadius: 8,
            padding: '12px 16px',
            marginBottom: 'var(--sp-lg)',
            color: '#991B1B',
            fontWeight: 600,
          }}
        >
          ⚠️ Saldo negativo previsto nos próximos {days} dias (mín:{' '}
          {formatBRL(minimo)}). Revise contas a pagar e NFs emitidas.
        </div>
      )}

      <Card style={{ padding: 'var(--sp-lg)', marginBottom: 'var(--sp-lg)' }}>
        <div style={{ fontWeight: 700, marginBottom: 'var(--sp-md)' }}>
          Evolução do Saldo Projetado
        </div>
        <SaldoChart pontos={pontosChart} />
      </Card>

      {entradas.length > 0 && (
        <Card
          style={{ padding: 0, overflow: 'hidden', marginBottom: 'var(--sp-lg)' }}
        >
          <div style={{ padding: 'var(--sp-md) var(--sp-lg)', fontWeight: 700 }}>
            Entradas Previstas (NFs emitidas)
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>NF</th>
                  <th style={{ textAlign: 'right' }}>Valor</th>
                </tr>
              </thead>
              <tbody>
                {entradas.map((e, i) => (
                  <tr key={i}>
                    <td>{formatDateBR(e.data)}</td>
                    <td>{e.numero || '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: VERDE }}>
                      {formatBRL(e.valor ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {(d.ocorrenciasVirtuais ?? []).length > 0 && (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: 'var(--sp-md) var(--sp-lg)', fontWeight: 700 }}>
            Saídas Recorrentes Previstas
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th style={{ textAlign: 'right' }}>Valor</th>
                </tr>
              </thead>
              <tbody>
                {(d.ocorrenciasVirtuais ?? []).map((o, i) => (
                  <tr key={i}>
                    <td>{formatDateBR(o.data)}</td>
                    <td>{o.descricao || '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: VERMELHO }}>
                      {formatBRL(o.valor ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
