import { formatBRLk } from '../../lib/format';
import type { MesCurvaS } from './financeiro';

const W = 800;
const H = 300;
const PAD = { top: 16, right: 16, bottom: 36, left: 64 };

interface SerieDef {
  nome: string;
  cor: string;
  tracejada?: boolean;
  pega: (m: MesCurvaS) => number | null;
}

const SERIES: SerieDef[] = [
  { nome: 'Planejado', cor: '#9CA3AF', tracejada: true, pega: (m) => m.planejado },
  { nome: 'Medido (BMs)', cor: '#1D6B3F', pega: (m) => m.medido },
  { nome: 'Custo realizado', cor: '#DC2626', pega: (m) => m.custo },
];

/** Curva S do contrato — gráfico de linhas em SVG (sem dependência externa). */
export default function CurvaSChart({ meses }: { meses: MesCurvaS[] }) {
  if (meses.length < 2) {
    return (
      <p className="text-muted" style={{ padding: 'var(--sp-md)' }}>
        Sem dados suficientes para a Curva S (contrato precisa de início, fim e
        valor).
      </p>
    );
  }

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const maxVal =
    Math.max(
      1,
      ...meses.flatMap((m) =>
        SERIES.map((s) => s.pega(m) ?? 0),
      ),
    );

  const xAt = (i: number) =>
    PAD.left + (meses.length === 1 ? 0 : (i / (meses.length - 1)) * plotW);
  const yAt = (v: number) => PAD.top + plotH - (v / maxVal) * plotH;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          gap: 'var(--sp-lg)',
          fontSize: 13,
          marginBottom: 8,
          flexWrap: 'wrap',
        }}
      >
        {SERIES.map((s) => (
          <span key={s.nome}>
            <span
              style={{
                display: 'inline-block',
                width: 14,
                height: 3,
                background: s.cor,
                marginRight: 6,
                verticalAlign: 'middle',
              }}
            />
            {s.nome}
          </span>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto' }}
        role="img"
        aria-label="Curva S — planejado, medido e custo acumulados"
      >
        {/* Grade horizontal + rótulos do eixo Y */}
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
          const y = PAD.top + plotH - frac * plotH;
          return (
            <g key={frac}>
              <line
                x1={PAD.left}
                y1={y}
                x2={W - PAD.right}
                y2={y}
                stroke="rgba(0,0,0,.08)"
              />
              <text
                x={PAD.left - 8}
                y={y + 4}
                textAnchor="end"
                fontSize={11}
                fill="#64748b"
              >
                {formatBRLk(maxVal * frac)}
              </text>
            </g>
          );
        })}

        {/* Rótulos do eixo X */}
        {meses.map((m, i) => (
          <text
            key={i}
            x={xAt(i)}
            y={H - PAD.bottom + 18}
            textAnchor="middle"
            fontSize={11}
            fill="#64748b"
          >
            {m.label}
          </text>
        ))}

        {/* Séries */}
        {SERIES.map((s) => {
          const pts = meses
            .map((m, i) => {
              const v = s.pega(m);
              return v === null ? null : `${xAt(i)},${yAt(v)}`;
            })
            .filter((p): p is string => p !== null);
          if (pts.length < 2) return null;
          return (
            <polyline
              key={s.nome}
              points={pts.join(' ')}
              fill="none"
              stroke={s.cor}
              strokeWidth={2.5}
              strokeDasharray={s.tracejada ? '6 4' : undefined}
              strokeLinejoin="round"
            />
          );
        })}
      </svg>
    </div>
  );
}
