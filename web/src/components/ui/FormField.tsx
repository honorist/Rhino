import * as RadixLabel from '@radix-ui/react-label';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface FormFieldProps {
  label: string;
  /** id do controle associado (para o htmlFor do label). */
  htmlFor?: string;
  /** Mensagem de erro — tem precedência sobre `helper`. */
  error?: string;
  /** Texto auxiliar exibido abaixo do controle. */
  helper?: string;
  /** Marca o campo como obrigatório com asterisco visual. */
  required?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Grupo rótulo + controle + erro/ajuda no padrão shadcn/ui:
 *   - `space-y-2` (8px) entre label e controle
 *   - label `text-sm font-medium leading-none`
 *   - helper/erro `text-xs` (12px) abaixo do controle
 *
 * Não usa as classes legadas `.form-group` / `.form-label` — ambas teriam
 * `margin-bottom` próprio brigando com o `space-y-*` do Modal/Form parent.
 */
export default function FormField({
  label,
  htmlFor,
  error,
  helper,
  required,
  children,
  className,
}: FormFieldProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <RadixLabel.Root
        className="block text-sm font-medium text-foreground leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        htmlFor={htmlFor}
      >
        {label}
        {required && (
          <span className="ml-0.5 text-destructive" aria-hidden="true">
            *
          </span>
        )}
      </RadixLabel.Root>
      {children}
      {error ? (
        <p
          className="text-xs font-medium text-destructive leading-snug"
          role="alert"
        >
          {error}
        </p>
      ) : helper ? (
        <p className="text-xs text-muted-foreground leading-snug">{helper}</p>
      ) : null}
    </div>
  );
}
