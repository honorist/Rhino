import { useMemo, useState, type ReactNode } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu';

/**
 * Coluna no formato simplificado do Rhino (compat com a versão anterior).
 * Internamente é convertida para ColumnDef do TanStack Table.
 */
export interface Column<T> {
  /** Identificador opcional da coluna (informativo). */
  id?: string;
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
  /** Se false, a coluna não aparece no menu de visibilidade. Default: true. */
  hideable?: boolean;
}

/** Filtro facetado — filtra por valores discretos de uma coluna (ex.: status). */
export interface FacetedFilter<T> {
  id: string;
  label: string;
  options: { label: string; value: unknown }[];
  accessor: (row: T) => unknown;
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
  /** Exibe botão de toggle de colunas no canto superior direito. */
  showColumnToggle?: boolean;
  /**
   * Placeholder do campo de busca global. Quando presente, exibe um input de
   * pesquisa que filtra linhas usando `globalFilterFn`.
   */
  searchPlaceholder?: string;
  /**
   * Função que determina se a linha passa pelo filtro de busca global.
   * Recebe a linha original e o texto digitado em minúsculas.
   */
  globalFilterFn?: (row: T, search: string) => boolean;
  /**
   * Filtros facetados — checkboxes por valores discretos de uma coluna
   * (ex.: status = ativo/inativo). Aparecem na barra de ferramentas.
   */
  filters?: FacetedFilter<T>[];
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
  showColumnToggle = false,
  searchPlaceholder,
  globalFilterFn,
  filters,
  className,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [search, setSearch] = useState('');
  const [activeFilters, setActiveFilters] = useState<Record<string, Set<unknown>>>({});

  const filteredRows = useMemo(() => {
    let result = rows;
    const q = search.trim().toLowerCase();
    if (q && globalFilterFn) {
      result = result.filter((row) => globalFilterFn(row, q));
    }
    for (const [filterId, values] of Object.entries(activeFilters)) {
      if (values.size === 0) continue;
      const f = filters?.find((x) => x.id === filterId);
      if (!f) continue;
      result = result.filter((row) => values.has(f.accessor(row)));
    }
    return result;
  }, [rows, search, activeFilters, globalFilterFn, filters]);

  const toggleFacet = (filterId: string, value: unknown) => {
    setActiveFilters((prev) => {
      const next = { ...prev };
      const set = new Set(next[filterId] ?? []);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      next[filterId] = set;
      return next;
    });
  };

  const clearFacet = (filterId: string) => {
    setActiveFilters((prev) => ({ ...prev, [filterId]: new Set() }));
  };

  const hasActiveFilters = Object.values(activeFilters).some((s) => s.size > 0);

  const tableColumns = useMemo<ColumnDef<T>[]>(
    () =>
      columns.map((col, idx) => ({
        id: `${idx}-${col.header}`,
        header: col.header,
        cell: ({ row }) => col.cell(row.original),
        enableSorting: !!col.sortable,
        enableHiding: col.hideable !== false,
        accessorFn: col.sortAccessor ?? (() => null),
        meta: { align: col.align, width: col.width },
      })),
    [columns],
  );

  const table = useReactTable({
    data: filteredRows,
    columns: tableColumns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
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

  const hideableColumns = table.getAllColumns().filter((col) => col.getCanHide());

  return (
    <div className={cn('w-full overflow-x-auto rounded-md border border-border', className)}>
      {/* Toolbar: search + faceted filters + column toggle */}
      {(searchPlaceholder || (filters && filters.length > 0) || (showColumnToggle && hideableColumns.length > 0)) && (
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-border">
          {searchPlaceholder && globalFilterFn && (
            <div className="relative flex-1 min-w-[160px] max-w-xs">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          )}
          {filters?.map((f) => {
            const active = activeFilters[f.id] ?? new Set();
            return (
              <DropdownMenu key={f.id}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors',
                      active.size > 0
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border bg-background hover:bg-muted/50',
                    )}
                  >
                    {f.label}
                    {active.size > 0 && (
                      <span className="rounded-full bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 leading-none">
                        {active.size}
                      </span>
                    )}
                    <ChevronDown size={12} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-44">
                  <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
                    {f.label}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {f.options.map((opt) => (
                    <DropdownMenuCheckboxItem
                      key={String(opt.value)}
                      checked={active.has(opt.value)}
                      onCheckedChange={() => toggleFacet(f.id, opt.value)}
                    >
                      {opt.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                  {active.size > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <button
                        type="button"
                        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => clearFacet(f.id)}
                      >
                        <X size={11} /> Limpar filtro
                      </button>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          })}
          {hasActiveFilters && (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setActiveFilters({})}
            >
              <X size={11} /> Limpar tudo
            </button>
          )}
          {/* Push column toggle to the right */}
          {showColumnToggle && hideableColumns.length > 0 && (
            <div className="ml-auto">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted/50 transition-colors"
                  >
                    <SlidersHorizontal size={13} />
                    Colunas
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
                    Mostrar colunas
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {hideableColumns.map((col) => (
                    <DropdownMenuCheckboxItem
                      key={col.id}
                      checked={col.getIsVisible()}
                      onCheckedChange={(val) => col.toggleVisibility(val)}
                    >
                      {col.columnDef.header as string}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      )}
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
      <table className="w-full caption-bottom text-sm">
        <thead className="[&_tr]:border-b border-border bg-muted/50">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b border-border transition-colors">
              {selectable && (
                <th className="h-10 px-3 text-left align-middle font-medium text-muted-foreground" style={{ width: 36 }}>
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
                    className={cn(
                      'h-10 px-3 text-left align-middle font-medium text-muted-foreground whitespace-nowrap',
                      meta?.align && ALIGN_CLASS[meta.align],
                    )}
                  >
                    {canSort ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
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
        <tbody className="[&_tr:last-child]:border-0">
          {visibleRows.length === 0 ? (
            <tr>
              <td
                colSpan={table.getVisibleFlatColumns().length + (selectable ? 1 : 0)}
                className="h-24 text-center text-muted-foreground"
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
                  className={cn(
                    'border-b border-border transition-colors hover:bg-muted/50',
                    onRowClick && 'cursor-pointer',
                    isSelected && 'bg-primary/5',
                  )}
                  aria-selected={selectable ? isSelected : undefined}
                >
                  {selectable && (
                    <td className="p-3 align-middle" onClick={(e) => e.stopPropagation()}>
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
                        className={cn(
                          'p-3 align-middle text-sm',
                          meta?.align && ALIGN_CLASS[meta.align],
                        )}
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
