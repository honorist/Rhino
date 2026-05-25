import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { cn } from '../../lib/cn';

/**
 * Controles base — preservam a classe legada `.form-control` (para que CSS
 * antigo continue funcionando) e somam estilos Tailwind para garantir
 * altura, padding, foco e estado disabled consistentes mesmo quando o
 * CSS legado não está aplicado (Storybook, telas novas).
 */
const BASE_INPUT_CLASS =
  'form-control flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ' +
  'text-foreground placeholder:text-muted-foreground transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ' +
  'disabled:cursor-not-allowed disabled:opacity-50 ' +
  'file:border-0 file:bg-transparent file:text-sm file:font-medium';

const BASE_TEXTAREA_CLASS =
  'form-control flex min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ' +
  'text-foreground placeholder:text-muted-foreground transition-colors resize-y ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

const BASE_SELECT_CLASS =
  'form-control flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ' +
  'text-foreground transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

/** <input> com base Tailwind + classe legada `.form-control`. */
export function Input({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(BASE_INPUT_CLASS, className)} {...rest} />;
}

/** <select> com base Tailwind + classe legada `.form-control`. */
export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(BASE_SELECT_CLASS, className)} {...rest}>
      {children}
    </select>
  );
}

/** <textarea> com base Tailwind + classe legada `.form-control`. */
export function Textarea({
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(BASE_TEXTAREA_CLASS, className)} {...rest} />;
}
