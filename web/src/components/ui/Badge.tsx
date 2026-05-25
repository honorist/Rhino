import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface BadgeProps {
  children: ReactNode;
  /** Sufixo de classe — gera `badge-<variant>` (ex.: "ativo", "material"). */
  variant?: string;
  className?: string;
}

/**
 * Etiqueta de status. Preserva a API antiga: `variant` é uma string livre
 * que vira sufixo de classe (`badge-<variant>`) — controlado pelo CSS
 * legado em components.css. Estilos base agora vêm do Tailwind.
 */
export default function Badge({ children, variant, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground',
        variant && `badge badge-${variant}`,
        className,
      )}
    >
      {children}
    </span>
  );
}
