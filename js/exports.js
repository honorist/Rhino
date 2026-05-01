/* Rhino · Export universal (PDF + CSV)
   Uso:
     RhinoExport.csv(rows, { filename: 'caixa.csv' })
     await RhinoExport.tablePdf({ title: 'Caixa', columns, rows, filename: 'caixa.pdf' })
*/
(function () {
  'use strict';

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  // CSV — formato Excel-friendly (BOM + ; separator).
  function csv(rows, { filename = 'export.csv', columns } = {}) {
    if (!Array.isArray(rows) || !rows.length) {
      if (window.RhinoUI && RhinoUI.toast) RhinoUI.toast('Nada para exportar', { type: 'warning' });
      return;
    }
    const cols = columns || Object.keys(rows[0]);
    const escape = (v) => {
      if (v == null) return '';
      const s = String(v).replace(/"/g, '""');
      return /[";\n\r]/.test(s) ? `"${s}"` : s;
    };
    const head = cols.map(escape).join(';');
    const body = rows.map((r) => cols.map((c) => escape(typeof c === 'object' ? c.get(r) : r[c])).join(';')).join('\n');
    const blob = new Blob(['﻿' + head + '\n' + body], { type: 'text/csv;charset=utf-8' });
    downloadBlob(blob, filename);
  }

  // PDF de tabela com cabeçalho + autoTable
  // columns: [{ key: 'data', label: 'Data', format?: (v,row)=>... }]
  // rows:    [{ data: '...', valor: 100 }]
  async function tablePdf({ title = 'Relatório', subtitle = '', columns = [], rows = [], filename = 'relatorio.pdf', orientation = 'portrait' } = {}) {
    if (typeof window.jspdf === 'undefined' || !window.jspdf.jsPDF) {
      if (window.RhinoLazy) await window.RhinoLazy.ensure(['jspdf', 'jspdf-autotable']);
    }
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation, compress: true });

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.setTextColor(85, 88, 139);
    pdf.text(title, 14, 16);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(110);
    pdf.text(subtitle || `${rows.length} registro(s) — ${new Date().toLocaleString('pt-BR')}`, 14, 22);

    const head = [columns.map((c) => c.label || c.key)];
    const body = rows.map((r) => columns.map((c) => {
      const raw = r[c.key];
      return c.format ? c.format(raw, r) : (raw == null ? '' : String(raw));
    }));

    pdf.autoTable({
      head, body,
      startY: 28,
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [85, 88, 139], textColor: [255, 255, 255], halign: 'left' },
      alternateRowStyles: { fillColor: [248, 248, 251] },
      margin: { left: 14, right: 14 },
    });

    // Footer com paginação
    const pages = pdf.internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      pdf.setPage(i);
      pdf.setFontSize(8);
      pdf.setTextColor(140);
      pdf.text(`Rhino · página ${i}/${pages}`, 14, pdf.internal.pageSize.getHeight() - 8);
    }

    pdf.save(filename);
  }

  function fmtBRL(v) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0); }
  function fmtDate(s) { return s ? new Date(s + (s.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('pt-BR') : '—'; }

  window.RhinoExport = { csv, tablePdf, fmtBRL, fmtDate, downloadBlob };
})();
