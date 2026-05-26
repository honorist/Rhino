import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface EmptyStateProps {
  /** Título principal — frase curta explicando o estado. */
  message: string;
  /** Descrição opcional abaixo do título, com contexto extra. */
  description?: string;
  /** Ícone Lucide (ou ReactNode equivalente) renderizado acima do texto. */
  icon?: ReactNode;
  /** Botão de ação primária. */
  action?: ReactNode;
  className?: string;
}

/** Estado vazio padrão (lista/tabela/seção sem dados). Tailwind puro, sem
 *  depender do .empty-state legado — mesmo visual em qualquer tela. */
export default function EmptyState({
  message,
  description,
  icon,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-6 py-12 text-center',
        className,
      )}
    >
      {icon && (
        <div className="text-muted-foreground [&>svg]:size-10">{icon}</div>
      )}
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{message}</p>
        {description && (
          <p className="text-xs text-muted-foreground max-w-md">{description}</p>
        )}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
