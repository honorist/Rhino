import { formatBRL } from '../../lib/format';
import { formatDateBR } from '../../lib/formatDate';
import type { Atividade } from './types';

const W = 800;
const H_LIN = 32;
const PAD_L = 200;
const PAD_T = 40;

const t = (s?: string | null): number =>
  s ? new Date(`${s}T12:00:00`).getTime() : 0;

function corExec(p: number): string {
  if (p >= 100) return '#10b981';
  if (p >= 50) return '#3b82f6';
  if (p > 0) return '#f59e0b';
  return '#94a3b8';
}

interface GanttContratoProps {
  atividades: Atividade[];
  onBarClick?: (a: Atividade) => void;
}

/** Gantt do cronograma do contrato — SVG (sem dependência externa). */
export default function GanttContrato({
  atividades,
  onBarClick,
}: GanttContratoProps) {
  const ativs = atividades.filter((a) => a.dataInicioPlan && a.dataFimPlan);
  if (ativs.length === 0) {
    return (
      <p
        className="text-muted"
        style={{ padding: 'var(--sp-md)', textAlign: 'center', fontSize: 13 }}
      >
        Adicione datas planejadas às etapas para ver o Gantt.
      </p>
    );
  }

  const inicios = ativs.map((a) => t(a.dataInicioPlan));
  const finsP = ativs.map((a) => t(a.dataFimPlan));
  const finsR = ativs.map((a) => t(a.dataFimReal)).filter((x) => x > 0);
  const min = Math.min(...inicios);
  const max = Math.max(...finsP, ...finsR);
  const range = max - min || 86_400_000;
  const hoje = Date.now();

  const totalW = PAD_L + W + 20;
  const totalH = PAD_T + ativs.length * H_LIN + 20;
  const x = (ts: number) => PAD_L + ((ts - min) / range) * W;

  // Eixo de meses.
  const eixos: { x: number; label: string }[] = [];
  const cursor = new Date(min);
  cursor.setDate(1);
  while (cursor.getTime() < max) {
    const xx = x(cursor.getTime());
    if (xx >= PAD_L && xx <= PAD_L + W) {
      eixos.push({
        x: xx,
        label: cursor
          .toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
          .replace('.', ''),
      });
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return (
    <div
      style={{
        overflowX: 'auto',
        background: '#0f172a',
        borderRadius: 8,
        padding: 10,
      }}
    >
      <svg
        viewBox={`0 0 ${totalW} ${totalH}`}
        style={{ display: 'block', minWidth: totalW, fontFamily: 'inherit' }}
        role="img"
        aria-label="Gráfico de Gantt do cronograma"
      >
        <rect
          x={PAD_L}
          y={PAD_T - 5}
          width={W}
          height={ativs.length * H_LIN + 5}
          fill="#1e293b"
          rx={4}
        />
        {eixos.map((e, i) => (
          <g key={i}>
            <line
              x1={e.x}
              y1={PAD_T - 8}
              x2={e.x}
              y2={totalH - 10}
              stroke="#475569"
              strokeWidth={0.5}
              strokeDasharray="2 3"
            />
            <text x={e.x + 2} y={PAD_T - 12} fontSize={10} fill="#94a3b8">
              {e.label}
            </text>
          </g>
        ))}
        {hoje >= min && hoje <= max && (
          <g>
            <line
              x1={x(hoje)}
              y1={PAD_T - 5}
              x2={x(hoje)}
              y2={totalH - 10}
              stroke="#dc2626"
              strokeWidth={1.5}
              strokeDasharray="3 3"
            />
            <text
              x={x(hoje) + 4}
              y={PAD_T - 8}
              fontSize={10}
              fill="#dc2626"
              fontWeight={700}
            >
              hoje
            </text>
          </g>
        )}
        {ativs.map((a, i) => {
          const y = PAD_T + i * H_LIN + 6;
          const x1 = x(t(a.dataInicioPlan));
          const x2 = x(t(a.dataFimPlan));
          const wp = Math.max(2, x2 - x1);
          const exec = Number(a.execPct) || 0;
          const wExec = (wp * Math.min(100, exec)) / 100;
          return (
            <g key={a.id}>
              <text
                x={PAD_L - 8}
                y={y + 14}
                textAnchor="end"
                fontSize={11}
                fill="#cbd5e1"
                fontWeight={600}
              >
                {(a.nome || '').slice(0, 28)}
              </text>
              <rect
                x={x1}
                y={y}
                width={wp}
                height={20}
                fill="#1e293b"
                stroke="#475569"
                strokeWidth={1}
                rx={3}
                style={{ cursor: onBarClick ? 'pointer' : 'default' }}
                onClick={() => onBarClick?.(a)}
              >
                <title>
                  {a.nome} · {formatDateBR(a.dataInicioPlan)} →{' '}
                  {formatDateBR(a.dataFimPlan)} · {exec.toFixed(0)}% · custo{' '}
                  {formatBRL(Number(a.custoPlan) || 0)}
                </title>
              </rect>
              <rect
                x={x1}
                y={y}
                width={wExec}
                height={20}
                fill={corExec(exec)}
                rx={3}
                style={{ pointerEvents: 'none' }}
              />
              <text
                x={x1 + wp / 2}
                y={y + 14}
                textAnchor="middle"
                fontSize={10}
                fill="#fff"
                fontWeight={700}
                style={{ pointerEvents: 'none' }}
              >
                {exec.toFixed(0)}%
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
