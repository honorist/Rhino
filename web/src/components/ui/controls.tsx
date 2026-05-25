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
 *
 * Padrão shadcn/ui:
 *   - Input/Select: `h-10` (40px), `px-3` (12px), `text-sm`
 *   - Textarea: `min-h-[80px]`, mesmo padding
 *   - Foco em ring 2px com offset 2px (acessível, WCAG 2.4.11)
 *   - `!` prefix nas props essenciais para vencer o CSS legado em empate
 */
const BASE_INPUT_CLASS = cn(
  'flex !h-10 w-full !rounded-md !border !border-input !bg-background !px-3 !py-2 !text-sm',
  '!text-foreground placeholder:text-muted-foreground transition-colors',
  'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
  'focus-visible:outline-none focus-visible:!ring-2 focus-visible:!ring-ring focus-visible:!ring-offset-2 focus-visible:!ring-offset-background',
  'disabled:cursor-not-allowed disabled:opacity-50',
);

const BASE_TEXTAREA_CLASS = cn(
  'flex min-h-[80px] w-full !rounded-md !border !border-input !bg-background !px-3 !py-2 !text-sm',
  '!text-foreground placeholder:text-muted-foreground transition-colors resize-y leading-relaxed',
  'focus-visible:outline-none focus-visible:!ring-2 focus-visible:!ring-ring focus-visible:!ring-offset-2 focus-visible:!ring-offset-background',
  'disabled:cursor-not-allowed disabled:opacity-50',
);

const BASE_SELECT_CLASS = cn(
  'flex !h-10 w-full !rounded-md !border !border-input !bg-background !px-3 !py-2 !text-sm',
  '!text-foreground transition-colors cursor-pointer',
  'focus-visible:outline-none focus-visible:!ring-2 focus-visible:!ring-ring focus-visible:!ring-offset-2 focus-visible:!ring-offset-background',
  'disabled:cursor-not-allowed disabled:opacity-50',
);

/** <input> Tailwind puro, h-10 padrão shadcn. */
export function Input({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(BASE_INPUT_CLASS, className)} {...rest} />;
}

/** <select> Tailwind puro, h-10 padrão shadcn. */
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

/** <textarea> Tailwind puro, min-h-[80px] padrão shadcn. */
export function Textarea({
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(BASE_TEXTAREA_CLASS, className)} {...rest} />;
}
