import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { cn } from '../../lib/cn';

/**
 * Controles base — APENAS Tailwind. A classe legada `.form-control` tem
 * `!important` em border/background/color (components.css linhas 232-239),
 * o que sobrescreveria qualquer estilo Tailwind. Por isso o componente
 * novo não usa `.form-control` — quem precisa do visual legado continua
 * usando `<input className="form-control">` direto.
 */
const BASE_INPUT_CLASS =
  'flex h-11 w-full rounded-md border border-input bg-background px-3.5 py-2.5 text-sm ' +
  'text-foreground placeholder:text-muted-foreground transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ' +
  'disabled:cursor-not-allowed disabled:opacity-50 ' +
  'file:border-0 file:bg-transparent file:text-sm file:font-medium';

const BASE_TEXTAREA_CLASS =
  'flex min-h-[120px] w-full rounded-md border border-input bg-background px-3.5 py-2.5 text-sm ' +
  'text-foreground placeholder:text-muted-foreground transition-colors resize-y leading-relaxed ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

const BASE_SELECT_CLASS =
  'flex h-11 w-full rounded-md border border-input bg-background px-3.5 py-2.5 text-sm ' +
  'text-foreground transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

/** <input> Tailwind puro. */
export function Input({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(BASE_INPUT_CLASS, className)} {...rest} />;
}

/** <select> Tailwind puro. */
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

/** <textarea> Tailwind puro. */
export function Textarea({
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(BASE_TEXTAREA_CLASS, className)} {...rest} />;
}
