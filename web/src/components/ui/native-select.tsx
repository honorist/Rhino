import type { SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground',
        'transition-colors cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}
