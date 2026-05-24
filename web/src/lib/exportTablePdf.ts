/**
 * Exporta uma tabela genérica em PDF (jsPDF + autoTable).
 * Porte de `RhinoExport.tablePdf` em js/exports.js — mesma assinatura.
 * jsPDF entra via dynamic import para code-split.
 */

export interface TablePdfColumn<R> {
  key: string;
  label?: string;
  /** Formatação opcional da célula. */
  format?: (raw: unknown, row: R) => string;
}

export interface TablePdfOptions<R> {
  title?: string;
  subtitle?: string;
  columns: ReadonlyArray<TablePdfColumn<R>>;
  rows: ReadonlyArray<R>;
  filename?: string;
  orientation?: 'portrait' | 'landscape';
}

interface ComAutoTable {
  lastAutoTable: { finalY: number };
}

/**
 * Monta head/body para o autoTable.
 * Função pura — separada do download para ser testável.
 */
export function buildTablePdfBody<R extends Record<string, unknown>>(
  columns: ReadonlyArray<TablePdfColumn<R>>,
  rows: ReadonlyArray<R>,
): { head: string[][]; body: string[][] } {
  const head = [columns.map((c) => c.label ?? c.key)];
  const body = rows.map((r) =>
    columns.map((c) => {
      const raw = r[c.key];
      if (c.format) return c.format(raw, r);
      return raw == null ? '' : String(raw);
    }),
  );
  return { head, body };
}

/** Gera e baixa o PDF da tabela. */
export async function exportTablePdf<R extends Record<string, unknown>>({
  title = 'Relatório',
  subtitle = '',
  columns,
  rows,
  filename = 'relatorio.pdf',
  orientation = 'portrait',
}: TablePdfOptions<R>): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation, compress: true });

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.setTextColor(85, 88, 139);
  pdf.text(title, 14, 16);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(110);
  pdf.text(
    subtitle || `${rows.length} registro(s) — ${new Date().toLocaleString('pt-BR')}`,
    14,
    22,
  );

  const { head, body } = buildTablePdfBody(columns, rows);
  autoTable(pdf, {
    head,
    body,
    startY: 28,
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [85, 88, 139], textColor: [255, 255, 255], halign: 'left' },
    alternateRowStyles: { fillColor: [248, 248, 251] },
    margin: { left: 14, right: 14 },
  });

  // Toca finalY para validar a interface
  void (pdf as unknown as ComAutoTable).lastAutoTable.finalY;

  // Paginação
  const pages = pdf.internal.pages.length - 1;
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setTextColor(140);
    pdf.text(`Rhino · página ${i}/${pages}`, 14, pdf.internal.pageSize.getHeight() - 8);
  }

  pdf.save(filename);
}
