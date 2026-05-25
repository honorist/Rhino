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
 * label↔input mesmo quando o consumer esquece o `id`.
 *
 * Mantém a classe `form-group` para compat com CSS legado que possa
 * referenciá-la (margin-bottom no components.css). O `space-y-2` dá gap
 * consistente entre label, input e helper independente do CSS antigo.
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
    <div className={cn('form-group space-y-2', className)}>
      <RadixLabel.Root
        className="form-label block text-[13px] font-medium text-foreground"
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
        <p className="form-error text-[13px] font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : helper ? (
        <p className="form-helper text-[13px] text-muted-foreground">{helper}</p>
      ) : null}
    </div>
  );
}
