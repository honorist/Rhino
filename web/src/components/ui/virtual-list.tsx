import { useRef, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '../../lib/cn';

interface VirtualListProps<T> {
  items: T[];
  /** Render de um item — recebe o item e o índice na lista original. */
  renderItem: (item: T, index: number) => ReactNode;
  /** Altura estimada de cada item em px (usado pela virtualização). */
  estimateSize?: number;
  /** Quantos itens renderizar fora da viewport (smooth scroll). Default 5. */
  overscan?: number;
  /** Altura do container scrollável. Pode ser CSS string ou número (px). */
  height?: number | string;
  className?: string;
}

/**
 * Lista virtualizada genérica — só renderiza itens visíveis na viewport
 * + overscan. Use para listas com >100 itens (clientes, contratos, RDOs,
 * estoque, audit log). Resolve o problema de jank quando o backend Railway
 * retorna 1000+ registros de uma vez sob latência alta.
 */
export default function VirtualList<T>({
  items,
  renderItem,
  estimateSize = 56,
  overscan = 5,
  height = 600,
  className,
}: VirtualListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
  });

  const totalSize = virtualizer.getTotalSize();
  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className={cn('overflow-auto contain-strict', className)}
      style={{ height }}
    >
      <div style={{ height: totalSize, position: 'relative', width: '100%' }}>
        {virtualItems.map((virtualRow) => {
          const item = items[virtualRow.index];
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {renderItem(item, virtualRow.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
