import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

type CardProps = HTMLAttributes<HTMLDivElement>;

/**
 * Contêiner base do design system novo. NÃO usa mais a classe legada
 * `.card` (components.css) — ela tem `padding: var(--sp-lg)` que vencia o
 * `p-5`/`p-6`/`p-7` dos consumers Tailwind em especificidade igual.
 *
 * Quem ainda precisa do visual legado deve usar `<div className="card">`
 * direto. O `<Card>` aqui é puro Tailwind.
 */
export default function Card({ className, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-card text-card-foreground shadow-sm',
        className,
      )}
      {...rest}
    />
  );
}
