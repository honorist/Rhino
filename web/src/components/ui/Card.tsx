import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

type CardProps = HTMLAttributes<HTMLDivElement>;

/**
 * Contêiner básico. API preservada — `className` continua sendo concatenada.
 * A classe `card` legada é mantida porque muitos consumers (Dashboard, KPIs)
 * dependem dela; estilo base agora também via Tailwind tokens.
 */
export default function Card({ className, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'card rounded-lg border border-border bg-card text-card-foreground shadow-sm',
        className,
      )}
      {...rest}
    />
  );
}
