import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import Card from '../../components/ui/card';
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
      <div className="h-[32px] w-[96px] flex items-center justify-end text-[10px] text-muted-foreground italic">
        sem histórico
      </div>
    );
  }
  const w = 96;
  const h = 32;
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
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums whitespace-nowrap',
        colorClass,
      )}
      title={`${pct.toFixed(1)}% ${periodLabel}`}
    >
      <Icon size={11} aria-hidden="true" />
      {isStable ? '0%' : `${isUp ? '+' : ''}${pct.toFixed(1)}%`}
    </span>
  );
}

/**
 * Cartão de KPI no padrão shadcn/ui dashboard:
 *   - label: `text-xs` (12px) `uppercase` `tracking-wider` `muted`
 *   - value: `text-3xl` (30px) `font-bold` `tracking-tight`
 *   - meta:  `text-sm` (14px) `muted`
 *   - padding `p-6` (24px) — vence `.card` legado via `!`
 *   - hover: leve elevação + sombra média
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
    <Link to={href} className="block h-full text-inherit no-underline group">
      <Card
        className={cn(
          'flex h-full flex-col transition-all',
          'group-hover:shadow-md group-hover:-translate-y-0.5',
          'group-focus-visible:ring-2 group-focus-visible:ring-ring',
        )}
      >
        {/* Header: label uppercase + delta badge à direita */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground leading-none">
            {label}
          </span>
          {delta && <DeltaBadge delta={delta} />}
        </div>

        {/* Value: 30px bold, hierarquia clara como número principal */}
        <div
          className={cn(
            'text-3xl font-bold leading-none tracking-tight tabular-nums',
            VALUE_TONE[tone],
          )}
          title={title}
        >
          {value}
        </div>

        {/* Footer: meta à esquerda + sparkline à direita, alinhados pela
            baseline. `mt-auto` empurra para o fim do card (importante em
            spans 2x2/3x2 onde o card tem altura extra). */}
        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <span className="truncate text-sm text-muted-foreground leading-snug">
            {meta ?? ''}
          </span>
          <Sparkline values={spark} tone={tone} />
        </div>
      </Card>
    </Link>
  );
}
