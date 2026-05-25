import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import Card from '../../components/ui/Card';
import { cn } from '../../lib/cn';

export type KpiTone = 'pos' | 'neg' | 'warn' | 'neutral';

/** Delta comparativo automático em todo KPI (DASH-2). */
export interface KpiDelta {
  /** Variação percentual vs período anterior. */
  pct: number;
  /** Rótulo do período comparado, ex.: "vs mês ant.". */
  periodLabel?: string;
  /** Se true, percentual maior é RUIM (ex.: "Despesas"). Inverte a cor. */
  inverted?: boolean;
}

interface KpiCardProps {
  label: string;
  value: string;
  meta?: string;
  tone?: KpiTone;
  /** Drill-down (DASH-4) — todos KPIs idealmente têm href. */
  href: string;
  /** Sparkline (DASH-3) — universal em todos KPIs. */
  spark: readonly number[];
  /** Comparativo automático (DASH-2). */
  delta?: KpiDelta;
  /** Title nativo (tooltip do navegador) com o valor exato. */
  title?: string;
}

const VALUE_TONE: Record<KpiTone, string> = {
  pos: 'text-success',
  neg: 'text-destructive',
  warn: 'text-warning',
  neutral: 'text-foreground',
};

function Sparkline({ values, tone }: { values: readonly number[]; tone: KpiTone }) {
  if (values.length < 2) {
    return (
      <div className="h-[28px] w-[90px] flex items-center justify-end text-[10px] text-muted-foreground italic">
        sem histórico
      </div>
    );
  }
  const w = 90;
  const h = 28;
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
  const stroke =
    tone === 'pos'
      ? 'var(--color-success)'
      : tone === 'neg'
        ? 'var(--color-destructive)'
        : tone === 'warn'
          ? 'var(--color-warning)'
          : 'var(--color-muted-foreground)';
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ width: w, height: h }}
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DeltaBadge({ delta }: { delta: KpiDelta }) {
  const { pct, periodLabel = 'vs anterior', inverted = false } = delta;
  const isStable = Math.abs(pct) < 0.05;
  const isUp = pct > 0;
  const isGood = isStable ? null : inverted ? !isUp : isUp;

  const Icon = isStable ? Minus : isUp ? ArrowUpRight : ArrowDownRight;
  const colorClass = isStable
    ? 'text-muted-foreground bg-muted'
    : isGood
      ? 'text-success bg-success/10'
      : 'text-destructive bg-destructive/10';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold tabular-nums whitespace-nowrap',
        colorClass,
      )}
      title={`${pct.toFixed(1)}% ${periodLabel}`}
    >
      <Icon size={12} aria-hidden="true" />
      {isStable ? '0%' : `${isUp ? '+' : ''}${pct.toFixed(1)}%`}
    </span>
  );
}

/**
 * Cartão de KPI padronizado. Padding generoso (p-5 = 20px), tipografia em
 * 3 níveis claros (label uppercase / value 28px bold / meta 12px muted) e
 * sparkline à direita do meta com altura proporcional.
 */
export default function KpiCard({
  label,
  value,
  meta,
  tone = 'neutral',
  href,
  spark,
  delta,
  title,
}: KpiCardProps) {
  return (
    <Link to={href} className="block h-full text-inherit no-underline">
      <Card className="flex h-full flex-col gap-3 p-5 transition-all hover:shadow-md hover:-translate-y-0.5 focus-within:ring-2 focus-within:ring-ring">
        <div className="flex items-start justify-between gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground leading-tight">
            {label}
          </span>
          {delta && <DeltaBadge delta={delta} />}
        </div>
        <div
          className={cn(
            'text-[26px] font-extrabold leading-[1.1] tracking-tight',
            VALUE_TONE[tone],
          )}
          title={title}
        >
          {value}
        </div>
        <div className="mt-auto flex items-end justify-between gap-3 pt-2">
          <span className="truncate text-[12px] text-muted-foreground leading-snug">
            {meta ?? ''}
          </span>
          <Sparkline values={spark} tone={tone} />
        </div>
      </Card>
    </Link>
  );
}
