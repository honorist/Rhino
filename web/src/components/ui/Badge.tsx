import type { ReactNode } from 'react';

interface BadgeProps {
  children: ReactNode;
  /** Sufixo de classe — gera `badge-<variant>` (ex.: "ativo", "material"). */
  variant?: string;
}

/** Etiqueta de status — classes .badge / .badge-* do CSS atual. */
export default function Badge({ children, variant }: BadgeProps) {
  const className = variant ? `badge badge-${variant}` : 'badge';
  return <span className={className}>{children}</span>;
}
