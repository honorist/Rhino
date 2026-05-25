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
 * Grupo rótulo + controle + erro/ajuda. Radix Label garante a associação
 * label↔input mesmo quando o consumer esquece o `id`. Classes `.form-*`
 * legadas mantidas para compat.
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
    <div className={cn('form-group space-y-1.5', className)}>
      <RadixLabel.Root
        className="form-label block text-sm font-medium text-foreground"
        htmlFor={htmlFor}
      >
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </RadixLabel.Root>
      {children}
      {error ? (
        <p className="form-error text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : helper ? (
        <p className="form-helper text-sm text-muted-foreground">{helper}</p>
      ) : null}
    </div>
  );
}
