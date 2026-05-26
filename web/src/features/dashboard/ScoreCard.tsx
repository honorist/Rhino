import { Link } from 'react-router-dom';
import Card from '../../components/ui/card';
import type { ScoreSaude } from './dashboardCalc';

interface ScoreCardProps {
  score: ScoreSaude;
  margemPct: number;
  taxaPct: number;
  coberturaMeses: number;
  contratosAtivos: number;
}

/**
 * Card de Score de Saúde Financeira — porte de _scoreCard() em
 * js/views/Dashboard.js (linhas 235-295). Gauge SVG circular + 3 sub-barras
 * (Margem, Taxa de despesa, Cobertura de caixa).
 */
export default function ScoreCard({
  score,
  margemPct,
  taxaPct,
  coberturaMeses,
  contratosAtivos,
}: ScoreCardProps) {
  const scoreColor =
    score.score >= 80 ? '#16A34A' : score.score >= 60 ? '#D97706' : '#DC2626';
  const r = 36;
  const c = 2 * Math.PI * r;
  const offset = c - (score.score / 100) * c;

  // Cobertura: 6 meses = 100% da barra
  const cobScore = Math.min(100, Math.max(0, (coberturaMeses / 6) * 100));

  const periodLabel = new Date().toLocaleDateString('pt-BR', {
    month: 'short',
    year: '2-digit',
  });

  return (
    <Link
      to="/contratos"
      style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
      title="Score de 0 a 100 a partir de 3 fatores: taxa de despesa, margem média e saldo de caixa. Saudável ≥80, Atenção 60-79, Crítico <60."
    >
      <Card style={{ padding: 'var(--sp-lg)' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 'var(--sp-md)',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
              Score de saúde financeira
            </h3>
            <div className="text-muted" style={{ fontSize: 13 }}>
              {periodLabel.replace('.', '')} · {contratosAtivos} contrato
              {contratosAtivos !== 1 ? 's' : ''} ativo
              {contratosAtivos !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {/* Gauge + score */}
        <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
          <div style={{ position: 'relative', width: 80, height: 80 }}>
            <svg viewBox="0 0 80 80" style={{ width: 80, height: 80 }}>
              <circle
                cx={40}
                cy={40}
                r={r}
                strokeWidth={6}
                stroke="#e5e7eb"
                fill="none"
              />
              <circle
                cx={40}
                cy={40}
                r={r}
                strokeWidth={6}
                stroke={scoreColor}
                fill="none"
                strokeDasharray={c}
                strokeDashoffset={offset}
                strokeLinecap="round"
                transform="rotate(-90 40 40)"
              />
            </svg>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                fontWeight: 800,
                fontSize: 18,
              }}
            >
              <span>{score.score}</span>
              <span style={{ fontSize: 9, color: '#64748B' }}>/100</span>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '.04em',
                color: '#64748B',
                marginBottom: 4,
              }}
            >
              {score.label}
            </div>
            <div
              style={{
                fontSize: 34,
                fontWeight: 800,
                color: scoreColor,
                lineHeight: 1,
              }}
            >
              {score.score}
            </div>
          </div>
        </div>

        {/* Sub-barras */}
        <div style={{ marginTop: 'var(--sp-lg)', display: 'grid', gap: 10 }}>
          <SubBar label="Margem operacional" valor={`${margemPct.toFixed(1)}%`} pct={Math.min(100, Math.max(0, margemPct * 3))} cor="#16A34A" />
          <SubBar label="Taxa de despesa" valor={`${taxaPct.toFixed(1)}%`} pct={Math.min(100, taxaPct)} cor="#D97706" />
          <SubBar
            label="Cobertura de caixa"
            valor={coberturaMeses > 0 ? `${coberturaMeses.toFixed(1)} meses` : '—'}
            pct={cobScore}
            cor="#3182CE"
          />
        </div>
      </Card>
    </Link>
  );
}

function SubBar({
  label,
  valor,
  pct,
  cor,
}: {
  label: string;
  valor: string;
  pct: number;
  cor: string;
}) {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 12,
          marginBottom: 2,
        }}
      >
        <span className="text-muted">{label}</span>
        <strong>{valor}</strong>
      </div>
      <div
        style={{
          height: 6,
          background: '#e5e7eb',
          borderRadius: 3,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct.toFixed(0)}%`,
            height: '100%',
            background: cor,
            transition: 'width .3s',
          }}
        />
      </div>
    </div>
  );
}
