import type { ReactNode } from 'react';

interface FormFieldProps {
  label: string;
  /** id do controle associado (para o htmlFor do label). */
  htmlFor?: string;
  /** Mensagem de erro — tem precedência sobre `helper`. */
  error?: string;
  /** Texto auxiliar exibido abaixo do controle. */
  helper?: string;
  children: ReactNode;
}

/** Grupo rótulo + controle + erro/ajuda — classes .form-* do CSS atual. */
export default function FormField({
  label,
  htmlFor,
  error,
  helper,
  children,
}: FormFieldProps) {
  return (
    <div className="form-group">
      <label className="form-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <div className="form-error">{error}</div>
      ) : helper ? (
        <div className="form-helper">{helper}</div>
      ) : null}
    </div>
  );
}
