import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface FormStackProps extends HTMLAttributes<HTMLDivElement> {
  /** Espaçamento vertical entre campos. Default 'md' (20px) — padrão de
   *  forms gerenciais. 'sm' (12px) para dialogs compactos, 'lg' (24px) para
   *  forms longos em página inteira. */
  spacing?: 'sm' | 'md' | 'lg';
}

const SPACING_MAP: Record<NonNullable<FormStackProps['spacing']>, string> = {
  sm: 'space-y-3',
  md: 'space-y-5',
  lg: 'space-y-6',
};

/** Container vertical para sequência de FormField — espaçamento padronizado.
 *  Antes cada form definia seu próprio space-y, gerando densidades diferentes
 *  entre telas. */
export function FormStack({
  spacing = 'md',
  className,
  ...rest
}: FormStackProps) {
  return <div className={cn(SPACING_MAP[spacing], className)} {...rest} />;
}

interface FormSectionProps extends HTMLAttributes<HTMLElement> {
  title?: string;
  description?: string;
  /** Quando truthy, organiza children em grid 2 colunas no desktop. */
  twoColumns?: boolean;
  children: ReactNode;
}

/** Seção lógica do form com título, descrição e opção de grid 2-col.
 *  Padrão Swiss: separator sutil acima, spacing generoso. */
export function FormSection({
  title,
  description,
  twoColumns,
  className,
  children,
  ...rest
}: FormSectionProps) {
  return (
    <section
      className={cn(
        'space-y-4 pt-5 first:pt-0 first:border-t-0 border-t border-border',
        className,
      )}
      {...rest}
    >
      {(title || description) && (
        <header className="space-y-1">
          {title && (
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          )}
          {description && (
            <p className="text-xs text-muted-foreground leading-relaxed">
              {description}
            </p>
          )}
        </header>
      )}
      <div
        className={cn(
          twoColumns
            ? 'grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4'
            : 'space-y-4',
        )}
      >
        {children}
      </div>
    </section>
  );
}
