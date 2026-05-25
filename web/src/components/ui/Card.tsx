import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

type CardProps = HTMLAttributes<HTMLDivElement>;

/**
 * Contêiner base do design system. NÃO usa a classe legada `.card`
 * (components.css) — ela tem `padding: var(--sp-lg)` que vencia o `p-*`
 * Tailwind dos consumers em empate de especificidade.
 *
 * Padrão shadcn/ui Card: `rounded-lg border bg-card text-card-foreground
 * shadow-sm`. O padding (`p-6`) fica a cargo do consumer porque alguns
 * cards (KPI, Pipeline) precisam de `p-5`/`p-6` distinto, e o header de
 * Card composto pode ter o seu próprio.
 *
 * O prefixo `!` é aplicado nas props que entram em empate com o CSS
 * legado `.card` (bg/border/radius/shadow); o padding é deixado puro pra
 * que o consumer ainda consiga sobrescrever com `!p-X` quando precisar.
 */
export default function Card({ className, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        '!rounded-lg !border !border-border !bg-card !text-card-foreground shadow-sm p-5',
        className,
      )}
      {...rest}
    />
  );
}
