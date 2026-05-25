import { useMemo, useState, type ReactNode } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '../../lib/cn';

/**
 * Coluna no formato simplificado do Rhino (compat com a versão anterior).
 * Internamente é convertida para ColumnDef do TanStack Table.
 */
export interface Column<T> {
  /** Texto do cabeçalho da coluna. */
  header: string;
  /** Render da célula a partir da linha. */
  cell: (row: T) => ReactNode;
  /** Largura CSS opcional (ex.: "120px"). */
  width?: string;
  /** Alinhamento horizontal do cabeçalho e das células. */
  align?: 'left' | 'right' | 'center';
  /** Se true, a coluna é ordenável (clique no header). */
  sortable?: boolean;
  /** Acessor para sort — função que retorna o valor comparável. */
  sortAccessor?: (row: T) => string | number | Date;
}

/** Ação em lote — recebe os IDs das linhas selecionadas. */
export interface BulkAction<T> {
  label: string;
  /** Cor visual: 'danger' para deletar, 'primary' para confirmar, etc. */
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
  /** Handler executado ao clicar; recebe linhas completas selecionadas. */
  onClick: (selectedRows: T[]) => void | Promise<void>;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  /** Chave estável de cada linha. */
  rowKey: (row: T) => string;
  /** Torna a linha clicável. */
  onRowClick?: (row: T) => void;
  /** Mensagem exibida quando não há linhas. */
  emptyMessage?: string;
  /** Tamanho da página — se ausente, mostra tudo. */
  pageSize?: number;
  /** Habilita seleção múltipla com checkbox por linha + select-all. */
  selectable?: boolean;
  /** Ações em lote — render como barra acima da tabela quando há seleção. */
  bulkActions?: BulkAction<T>[];
  className?: string;
}

const ALIGN_CLASS = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
} as const;

/**
 * Tabela genérica dirigida por colunas. TanStack Table v8 por baixo,
 * mantendo a API antiga. Classes `.table-wrap` / `<table>` legadas
 * preservadas para compat com CSS atual.
 *
 * Bulk actions: passe `selectable` + `bulkActions`. Quando o usuário
 * marca ≥1 linha, uma barra fixa aparece no topo com os botões de ação.
 */
export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  emptyMessage = 'Nenhum registro encontrado',
  pageSize,
  selectable = false,
  bulkActions,
  className,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const tableColumns = useMemo<ColumnDef<T>[]>(
    () =>
      columns.map((col, idx) => ({
        id: `${idx}-${col.header}`,
        header: col.header,
        cell: ({ row }) => col.cell(row.original),
        enableSorting: !!col.sortable,
        accessorFn: col.sortAccessor ?? (() => null),
        meta: { align: col.align, width: col.width },
      })),
    [columns],
  );

  const table = useReactTable({
    data: rows,
    columns: tableColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => rowKey(row),
  });

  const sortedRows = table.getRowModel().rows;
  const visibleRows = pageSize ? sortedRows.slice(0, pageSize) : sortedRows;

  const allVisibleIds = visibleRows.map((r) => r.id);
  const allSelected =
    allVisibleIds.length > 0 && allVisibleIds.every((id) => selectedIds.has(id));
  const someSelected = allVisibleIds.some((id) => selectedIds.has(id));

  const toggleAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        allVisibleIds.forEach((id) => next.delete(id));
      } else {
        allVisibleIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const selectedRows = useMemo(
    () => rows.filter((row) => selectedIds.has(rowKey(row))),
    [rows, selectedIds, rowKey],
  );

  return (
    <div className={cn('table-wrap', className)}>
      {selectable && selectedRows.length > 0 && bulkActions && bulkActions.length > 0 && (
        <div
          className="flex items-center justify-between gap-3 rounded-md border border-primary/20 bg-primary/5 px-4 py-2 mb-2"
          role="region"
          aria-label="Ações em lote"
        >
          <span className="text-sm font-medium">
            {selectedRows.length} selecionado{selectedRows.length !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-2">
            {bulkActions.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={() => {
                  void action.onClick(selectedRows);
                  clearSelection();
                }}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  action.variant === 'danger' &&
                    'bg-destructive text-destructive-foreground hover:bg-destructive/90',
                  action.variant === 'success' &&
                    'bg-success text-success-foreground hover:bg-success/90',
                  action.variant === 'secondary' &&
                    'bg-secondary text-secondary-foreground hover:bg-secondary/80',
                  (!action.variant || action.variant === 'primary') &&
                    'bg-primary text-primary-foreground hover:bg-primary/90',
                )}
              >
                {action.label}
              </button>
            ))}
            <button
              type="button"
              onClick={clearSelection}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Limpar
            </button>
          </div>
        </div>
      )}
      <table className="w-full">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {selectable && (
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    aria-label="Selecionar todas as linhas visíveis"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = !allSelected && someSelected;
                    }}
                    onChange={toggleAll}
                  />
                </th>
              )}
              {headerGroup.headers.map((header) => {
                const meta = header.column.columnDef.meta as
                  | { align?: 'left' | 'right' | 'center'; width?: string }
                  | undefined;
                const canSort = header.column.getCanSort();
                const sortState = header.column.getIsSorted();
                return (
                  <th
                    key={header.id}
                    style={{ width: meta?.width }}
                    className={cn(meta?.align && ALIGN_CLASS[meta.align])}
                  >
                    {canSort ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="inline-flex items-center gap-1 hover:text-primary"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sortState === 'asc' ? (
                          <ArrowUp size={12} />
                        ) : sortState === 'desc' ? (
                          <ArrowDown size={12} />
                        ) : (
                          <ArrowUpDown size={12} className="opacity-40" />
                        )}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {visibleRows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length + (selectable ? 1 : 0)}
                className="text-center text-muted-foreground"
                style={{ padding: 32 }}
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            visibleRows.map((row) => {
              const isSelected = selectedIds.has(row.id);
              return (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  style={onRowClick ? { cursor: 'pointer' } : undefined}
                  className={isSelected ? 'bg-primary/5' : undefined}
                  aria-selected={selectable ? isSelected : undefined}
                >
                  {selectable && (
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Selecionar linha ${row.id}`}
                        checked={isSelected}
                        onChange={() => toggleOne(row.id)}
                      />
                    </td>
                  )}
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta as
                      | { align?: 'left' | 'right' | 'center' }
                      | undefined;
                    return (
                      <td
                        key={cell.id}
                        className={cn(meta?.align && ALIGN_CLASS[meta.align])}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
