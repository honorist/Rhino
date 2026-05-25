import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Helper canônico do shadcn/ui — concatena classes e resolve conflitos
 * Tailwind (ex.: `p-2 p-4` vira `p-4`). Usado por todos os componentes UI
 * novos. Mantemos em lib/cn.ts (não lib/utils.ts) para evitar colisão com
 * possíveis utils.ts pré-existentes.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
