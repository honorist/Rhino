import { Link } from 'react-router-dom';
import Card from '../../components/ui/card';
import { formatBRL } from '../../lib/format';
import type { Pipeline } from './dashboardCalc';

interface PipelineCardProps {
  pipeline: Pipeline;
}

interface Stage {
  label: string;
  count: number;
  valor: number;
  href: string;
  /** Cor do bar (token Tailwind). */
  color: string;
  tip: string;
}

/**
 * Pipeline de medições — funil HORIZONTAL com barras proporcionais ao volume
 * (count). Cada estágio é clicável → drill-down direto na lista filtrada.
 * Cores reforçam o estado (muted → warning → primary → success).
 *
 * Padrão shadcn/ui card de dashboard:
 *   - Header: titulo `text-base font-semibold` + subtítulo `text-sm muted`
 *   - Stages: gap vertical `space-y-5` para acomodar label + barra confortável
 *   - Footer (link): ação secundária ghost à direita
 */
export default function PipelineCard({ pipeline }: PipelineCardProps) {
  const hoje = new Date();
  const stages: Stage[] = [
    {
      label: 'Rascunho',
      count: pipeline.rascunho.count,
      valor: pipeline.rascunho.valor,
      href: '/contratos?stage=rascunho',
      color: 'bg-muted-foreground/30',
      tip: 'Saídas (BMs) cadastradas mas ainda sem NF vinculada.',
    },
    {
      label: 'Aguard. emissão',
      count: pipeline.aguardEmissao.count,
      valor: pipeline.aguardEmissao.valor,
      href: '/notas-fiscais?status=pendente',
      color: 'bg-warning',
      tip: 'NF cadastrada mas ainda não emitida.',
    },
    {
      label: 'NF emitida',
      count: pipeline.nfEmitida.count,
      valor: pipeline.nfEmitida.valor,
      href: '/notas-fiscais?status=emitida',
      color: 'bg-primary',
      tip: 'NF emitida, aguardando recebimento.',
    },
    {
      label: 'Recebida',
      count: pipeline.recebida.count,
      valor: pipeline.recebida.valor,
      href: '/caixa?type=entrada',
      color: 'bg-success',
      tip: 'Pagamento recebido — ciclo completo.',
    },
  ];

  const maxCount = Math.max(1, ...stages.map((s) => s.count));
  const totalValor = stages.reduce((s, x) => s + x.valor, 0);

  return (
    <Card className="h-full flex flex-col">
      {/* Header: title + subtítulo + ação secundária */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="space-y-0.5">
          <h3 className="m-0 text-sm font-semibold leading-none tracking-tight">
            Pipeline de medições
          </h3>
          <p className="text-sm text-muted-foreground capitalize">
            {hoje.toLocaleDateString('pt-BR', { month: 'long' })}
          </p>
        </div>
        <Link
          to="/contratos"
          className="shrink-0 text-xs font-semibold text-primary no-underline hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md px-1"
        >
          Ver tudo →
        </Link>
      </div>

      {/* Funil: 4 estágios com barras proporcionais e gap generoso */}
      <div role="list" aria-label="Funil do pipeline" className="space-y-5 flex-1">
        {stages.map((s) => {
          const widthPct = (s.count / maxCount) * 100;
          const valorPct = totalValor > 0 ? (s.valor / totalValor) * 100 : 0;
          return (
            <Link
              key={s.label}
              to={s.href}
              role="listitem"
              title={s.tip}
              className="block rounded-md p-2 -mx-2 no-underline text-inherit transition-colors hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-baseline justify-between mb-2 gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                  {s.label}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  <strong className="text-foreground font-semibold">
                    {s.count}
                  </strong>
                  <span className="mx-1.5 text-border">·</span>
                  {formatBRL(s.valor)}
                  {totalValor > 0 && (
                    <span className="ml-1.5 text-muted-foreground">
                      ({valorPct.toFixed(0)}%)
                    </span>
                  )}
                </span>
              </div>
              <div
                className="h-2.5 w-full rounded-full bg-muted overflow-hidden"
                role="progressbar"
                aria-valuenow={s.count}
                aria-valuemin={0}
                aria-valuemax={maxCount}
                aria-label={`${s.label}: ${s.count} item${s.count !== 1 ? 's' : ''}`}
              >
                <div
                  className={`h-full ${s.color} transition-[width] duration-500 ease-out`}
                  style={{ width: `${Math.max(2, widthPct)}%` }}
                />
              </div>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
