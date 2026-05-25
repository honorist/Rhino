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

/**
 * @deprecated Usar `<Input>` de `@/components/ui/input`. Removido em v1.3.0.
 */
export function Input({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  if (import.meta.env.DEV) {
    console.warn('[controls.Input] deprecated — usar <Input> de @/components/ui/input. Removido em v1.3.0.');
  }
  return <input className={cn(BASE_INPUT_CLASS, className)} {...rest} />;
}

/**
 * @deprecated Usar `<Select>` de `@/components/ui/select`. Removido em v1.3.0.
 */
export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  if (import.meta.env.DEV) {
    console.warn('[controls.Select] deprecated — usar <Select> de @/components/ui/select. Removido em v1.3.0.');
  }
  return (
    <select className={cn(BASE_SELECT_CLASS, className)} {...rest}>
      {children}
    </select>
  );
}

/**
 * @deprecated Usar `<Textarea>` de `@/components/ui/textarea`. Removido em v1.3.0.
 */
export function Textarea({
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  if (import.meta.env.DEV) {
    console.warn('[controls.Textarea] deprecated — usar <Textarea> de @/components/ui/textarea. Removido em v1.3.0.');
  }
  return <textarea className={cn(BASE_TEXTAREA_CLASS, className)} {...rest} />;
}
