import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface PageHeaderProps {
  /** Título principal — string ou ReactNode (para títulos com badge inline). */
  title: ReactNode;
  /** Texto descritivo abaixo do título. Aceita ReactNode para texto rico. */
  subtitle?: ReactNode;
  /** Botões/ações exibidos à direita do cabeçalho. */
  actions?: ReactNode;
  /** Breadcrumb/back-link renderizado acima do título. */
  breadcrumb?: ReactNode;
  /** Quando truthy, adiciona separator border-b abaixo do header. */
  divider?: boolean;
  className?: string;
}

/** Cabeçalho padrão de página — Swiss-style minimalismo: title + subtitle
 *  pequeno, ações alinhadas à direita, breadcrumb opcional acima.
 *
 *  Tailwind puro (não depende mais de .page-header legado para evitar conflito
 *  com space-y de wrappers). As classes .page-title/.page-subtitle são
 *  mantidas para que telas que ainda usam inline também rendam consistente. */
export default function PageHeader({
  title,
  subtitle,
  actions,
  breadcrumb,
  divider,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 mb-6',
        divider && 'border-b border-border pb-5',
        className,
      )}
    >
      {breadcrumb && <div className="text-xs text-muted-foreground">{breadcrumb}</div>}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1 min-w-0">
          <h1 className="page-title text-2xl font-bold tracking-tight text-foreground">
            {title}
          </h1>
          {subtitle && (
            <p className="page-subtitle text-sm text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div className="page-header-actions flex items-center gap-2 flex-wrap shrink-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
