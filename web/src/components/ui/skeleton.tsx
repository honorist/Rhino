import * as React from 'react';
import { cn } from '@/lib/cn';

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('animate-pulse rounded-md bg-accent', className)}
      {...props}
    />
  );
}

/** Linhas de skeleton para representar uma linha de tabela em loading. */
function SkeletonTableRow({
  columns = 5,
  className,
  ...props
}: React.ComponentProps<'tr'> & { columns?: number }) {
  return (
    <tr
      data-slot="skeleton-row"
      className={cn('border-b border-border', className)}
      {...props}
    >
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-2 py-3">
          <Skeleton className="h-4 w-full" />
        </td>
      ))}
    </tr>
  );
}

/** N linhas de skeleton — útil em <tbody> enquanto a query carrega. */
function SkeletonTableBody({
  rows = 5,
  columns = 5,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonTableRow key={i} columns={columns} />
      ))}
    </>
  );
}

/** Esqueleto de card KPI — título curto + valor grande. */
function SkeletonKpiCard({ className }: { className?: string }) {
  return (
    <div
      data-slot="skeleton-kpi"
      className={cn(
        'rounded-lg border border-border bg-card p-5 space-y-3',
        className,
      )}
    >
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-3 w-16" />
    </div>
  );
}

/** Esqueleto de bloco de texto — N linhas de larguras variáveis. */
function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div
      data-slot="skeleton-text"
      className={cn('space-y-2', className)}
    >
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-3"
          style={{ width: `${100 - i * 12}%` }}
        />
      ))}
    </div>
  );
}

export {
  Skeleton,
  SkeletonKpiCard,
  SkeletonTableBody,
  SkeletonTableRow,
  SkeletonText,
};
