import { Link } from 'react-router-dom';
import Card from '../../components/ui/card';
import { formatBRL } from '../../lib/format';

interface ContasPagarStatusCardProps {
  vencidas: number;
  proximas7d: number;
  pendentes: number;
  totalPendente: number;
}

/**
 * Card "Contas a Pagar — Situação" — 4 buckets: Vencidas, Próx 7d, No prazo,
 * Total pendente (R$). Porte de js/views/Dashboard.js (linhas 644-665).
 */
export default function ContasPagarStatusCard({
  vencidas,
  proximas7d,
  pendentes,
  totalPendente,
}: ContasPagarStatusCardProps) {
  const noPrazo = Math.max(0, pendentes - vencidas - proximas7d);

  return (
    <Card style={{ padding: 'var(--sp-lg)' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 'var(--sp-md)',
        }}
      >
        <h3 style={{ margin: 0, fontSize: 16 }}>Contas a Pagar — Situação</h3>
        <Link to="/contas-pagar" style={{ fontSize: 13, color: 'var(--color-primary)' }}>
          Ver todas →
        </Link>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 'var(--sp-md)',
        }}
      >
        <Bucket label="Vencidas" tone="neg" value={vencidas} />
        <Bucket label="Próx. 7 dias" tone="warn" value={proximas7d} />
        <Bucket label="No prazo" tone="pos" value={noPrazo} />
        <Bucket
          label="Total pendente"
          tone="neg"
          value={formatBRL(totalPendente)}
          isCurrency
        />
      </div>
    </Card>
  );
}

function Bucket({
  label,
  tone,
  value,
  isCurrency,
}: {
  label: string;
  tone: 'neg' | 'warn' | 'pos';
  value: string | number;
  isCurrency?: boolean;
}) {
  const colors: Record<typeof tone, { bg: string; fg: string }> = {
    neg: { bg: 'rgba(220,38,38,.12)', fg: '#991b1b' },
    warn: { bg: 'rgba(217,119,6,.12)', fg: '#9a3412' },
    pos: { bg: 'rgba(22,163,74,.12)', fg: '#166534' },
  };
  const c = colors[tone];
  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: 8,
        border: '1px solid var(--color-border)',
        borderLeft: `3px solid ${c.fg}`,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: c.fg,
          textTransform: 'uppercase',
          letterSpacing: '.04em',
          background: c.bg,
          display: 'inline-block',
          padding: '2px 6px',
          borderRadius: 4,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: isCurrency ? 18 : 24,
          fontWeight: 800,
          color: isCurrency ? c.fg : 'var(--color-text)',
        }}
      >
        {value}
      </div>
    </div>
  );
}
