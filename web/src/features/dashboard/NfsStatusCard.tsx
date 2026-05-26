import { Link } from 'react-router-dom';
import Card from '../../components/ui/card';
import type { NfsSituacao } from './dashboardCalc';

interface NfsStatusCardProps {
  situacao: NfsSituacao;
  emitidas: number;
}

interface Stage {
  tone: 'neg' | 'warn' | 'pos' | 'info';
  label: string;
  value: number;
}

/**
 * Card "Notas Fiscais — Situação" — 4 buckets: Vencidas, Próx. 7d, No prazo,
 * Emitidas. Porte do bloco em js/views/Dashboard.js (linhas 623-641).
 */
export default function NfsStatusCard({ situacao, emitidas }: NfsStatusCardProps) {
  const stages: Stage[] = [
    { tone: 'neg', label: 'Vencidas', value: situacao.vencidas },
    { tone: 'warn', label: 'Próx. 7 dias', value: situacao.proximas7d },
    { tone: 'pos', label: 'No prazo', value: situacao.noPrazo },
    { tone: 'info', label: 'Emitidas', value: emitidas },
  ];

  const toneColors: Record<Stage['tone'], { bg: string; fg: string }> = {
    neg: { bg: 'rgba(220,38,38,.12)', fg: '#991b1b' },
    warn: { bg: 'rgba(217,119,6,.12)', fg: '#9a3412' },
    pos: { bg: 'rgba(22,163,74,.12)', fg: '#166534' },
    info: { bg: 'rgba(49,130,206,.12)', fg: '#1e3a8a' },
  };

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
        <h3 style={{ margin: 0, fontSize: 16 }}>Notas Fiscais — Situação</h3>
        <Link
          to="/notas-fiscais"
          style={{ fontSize: 13, color: 'var(--color-primary)' }}
        >
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
        {stages.map((s) => {
          const cores = toneColors[s.tone];
          return (
            <div
              key={s.label}
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                borderLeft: `3px solid ${cores.fg}`,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: cores.fg,
                  textTransform: 'uppercase',
                  letterSpacing: '.04em',
                  background: cores.bg,
                  display: 'inline-block',
                  padding: '2px 6px',
                  borderRadius: 4,
                  marginBottom: 6,
                }}
              >
                {s.label}
              </div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>{s.value}</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
