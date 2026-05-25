import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

/**
 * Bento grid container — grade de 12 colunas com auto-rows responsivo.
 * Cada filho declara seu tamanho via prop `span` no <BentoItem>.
 * Em mobile, todos os items ocupam a largura total automaticamente.
 */
export function BentoGrid({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 sm:grid-cols-6 lg:grid-cols-12 gap-4 auto-rows-[minmax(120px,_auto)]',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

interface BentoItemProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Tamanho do item no grid. Formato `colSpan` (1-12) × `rowSpan` (1-3).
   * Em mobile sempre é 1 col / 1 row.
   */
  span?: '1x1' | '2x1' | '2x2' | '3x1' | '3x2' | '4x1' | '4x2' | '6x1' | '6x2' | '12x1';
  children?: ReactNode;
}

const SPAN_CLASS: Record<NonNullable<BentoItemProps['span']>, string> = {
  '1x1': 'lg:col-span-2 sm:col-span-3',
  '2x1': 'lg:col-span-3 sm:col-span-3',
  '2x2': 'lg:col-span-3 lg:row-span-2 sm:col-span-3',
  '3x1': 'lg:col-span-4 sm:col-span-6',
  '3x2': 'lg:col-span-4 lg:row-span-2 sm:col-span-6',
  '4x1': 'lg:col-span-6 sm:col-span-6',
  '4x2': 'lg:col-span-6 lg:row-span-2 sm:col-span-6',
  '6x1': 'lg:col-span-8 sm:col-span-6',
  '6x2': 'lg:col-span-8 lg:row-span-2 sm:col-span-6',
  '12x1': 'lg:col-span-12 sm:col-span-6',
};

/**
 * Filho do BentoGrid. O `span` controla a proeminência visual — KPIs mais
 * importantes recebem '2x2' ou '3x2'; KPIs secundários '1x1'.
 */
export function BentoItem({
  span = '1x1',
  className,
  children,
  ...rest
}: BentoItemProps) {
  return (
    <div className={cn(SPAN_CLASS[span], className)} {...rest}>
      {children}
    </div>
  );
}
