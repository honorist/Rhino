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

export function CardHeader({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col space-y-1 mb-4', className)} {...rest} />;
}

export function CardTitle({ className, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-base font-semibold leading-none tracking-tight', className)} {...rest} />;
}

export function CardDescription({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...rest} />;
}

export function CardContent({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(className)} {...rest} />;
}

export function CardFooter({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center mt-4', className)} {...rest} />;
}
