import type { ReactNode } from 'react';

export interface Column<T> {
  /** Texto do cabeçalho da coluna. */
  header: string;
  /** Render da célula a partir da linha. */
  cell: (row: T) => ReactNode;
  /** Largura CSS opcional (ex.: "120px"). */
  width?: string;
  /** Alinhamento horizontal do cabeçalho e das células. */
  align?: 'left' | 'right' | 'center';
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
}

/** Tabela genérica dirigida por colunas — classe .table-wrap do CSS atual. */
export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  emptyMessage = 'Nenhum registro encontrado',
}: DataTableProps<T>) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.header}
                style={{ width: column.width, textAlign: column.align }}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="text-center text-muted"
                style={{ padding: 32 }}
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                style={onRowClick ? { cursor: 'pointer' } : undefined}
              >
                {columns.map((column) => (
                  <td key={column.header} style={{ textAlign: column.align }}>
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
