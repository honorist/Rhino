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
 * Grupo rótulo + controle + erro/ajuda. Tailwind puro — não usa mais as
 * classes legadas `form-group` (margin-bottom) e `form-label` (font-size 15)
 * porque ambas atrapalhavam o gap controlado pelo `space-y-*` no parent
 * (Modal, Form).
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
        className="block text-[13px] font-medium text-foreground leading-tight"
        htmlFor={htmlFor}
      >
        {label}
        {required && (
          <span className="ml-1 text-destructive" aria-hidden="true">
            *
          </span>
        )}
      </RadixLabel.Root>
      {children}
      {error ? (
        <p className="text-[13px] font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : helper ? (
        <p className="text-[13px] text-muted-foreground">{helper}</p>
      ) : null}
    </div>
  );
}
