/* Rhino · ContratoDetail · export-pdf
   Extraído de js/views/ContratoDetail.js (linhas 5376-5486)
   Estende o objeto window.ContratoDetail já definido. */
(function () {
  if (!window.ContratoDetail) { console.error('[contrato/export-pdf] requires ContratoDetail core'); return; }
  Object.assign(window.ContratoDetail, {
  async exportarPDF(contract, ctx) {
    if (!window.jspdf) {
      try { await window.RhinoLazy.ensure(['jspdf', 'jspdf-autotable']); }
      catch { window.showToast('Falha ao carregar biblioteca PDF', 'error'); return; }
    }
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const fmtBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
    const fmtData = (s) => s ? new Date(s + 'T12:00:00').toLocaleDateString('pt-BR') : '—';

    // Cabeçalho verde
    pdf.setFillColor(29, 107, 63);
    pdf.rect(0, 0, 210, 28, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(18); pdf.setFont('helvetica', 'bold');
    pdf.text('Resumo Executivo do Contrato', 14, 13);
    pdf.setFontSize(10); pdf.setFont('helvetica', 'normal');
    pdf.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, 14, 21);

    let y = 38;

    // Título do contrato
    pdf.setTextColor(20, 20, 20);
    pdf.setFontSize(15); pdf.setFont('helvetica', 'bold');
    pdf.text(contract.name || 'Contrato', 14, y); y += 6;
    pdf.setFontSize(10); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(80, 80, 80);
    pdf.text(`Cliente: ${contract.client || '—'}`, 14, y); y += 5;
    if (contract.contractNumber) { pdf.text(`Contrato nº: ${contract.contractNumber}`, 14, y); y += 5; }
    pdf.text(`Período: ${fmtData(contract.startDate)} a ${fmtData(contract.endDate)}`, 14, y); y += 5;
    pdf.text(`Status: ${(contract.status || '—').toUpperCase()}`, 14, y); y += 8;

    // KPIs financeiros
    pdf.setDrawColor(220, 220, 220); pdf.line(14, y, 196, y); y += 6;
    pdf.setTextColor(20, 20, 20); pdf.setFontSize(12); pdf.setFont('helvetica', 'bold');
    pdf.text('Indicadores Financeiros', 14, y); y += 6;

    const kpis = [
      ['Valor do Contrato', fmtBRL(contract.value)],
      ['Já faturado (NFs emitidas)', fmtBRL(ctx.totalEmitido)],
      ['Total medido (BMs lançadas)', fmtBRL(ctx.totalMedido)],
      ['Disponível para BM', fmtBRL(ctx.totalAMedir)],
      ['Total realizado (custos)', fmtBRL(ctx.totalRealizado)],
      ['Resultado parcial', fmtBRL(ctx.margemAtual) + ` (${ctx.pctMargem.toFixed(1)}% do contrato)`],
    ];
    pdf.autoTable({
      startY: y,
      head: [['Indicador', 'Valor']],
      body: kpis,
      theme: 'striped',
      headStyles: { fillColor: [29, 107, 63], textColor: [255, 255, 255], fontStyle: 'bold' },
      bodyStyles: { fontSize: 10 },
      columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
      margin: { left: 14, right: 14 },
    });
    y = pdf.lastAutoTable.finalY + 8;

    // Composição do gasto
    pdf.setTextColor(20, 20, 20); pdf.setFontSize(12); pdf.setFont('helvetica', 'bold');
    pdf.text('Composição do gasto realizado', 14, y); y += 4;
    const tipos = Object.entries(ctx.realizadoPorTipo || {}).filter(([_, v]) => v > 0);
    if (tipos.length > 0) {
      pdf.autoTable({
        startY: y + 2,
        head: [['Categoria', 'Realizado', 'Orçado']],
        body: tipos.map(([k, v]) => [
          ctx.TIPOS_LABEL[k] || k,
          fmtBRL(v),
          fmtBRL(ctx.orcadoPorTipo[k] || 0),
        ]),
        theme: 'striped',
        headStyles: { fillColor: [60, 60, 60], textColor: [255, 255, 255], fontStyle: 'bold' },
        bodyStyles: { fontSize: 10 },
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
        margin: { left: 14, right: 14 },
      });
      y = pdf.lastAutoTable.finalY + 8;
    }

    // Boletins de Medição
    if (Array.isArray(ctx.nfsContrato) && ctx.nfsContrato.length > 0 && y < 240) {
      pdf.setTextColor(20, 20, 20); pdf.setFontSize(12); pdf.setFont('helvetica', 'bold');
      pdf.text(`Boletins de Medição (${ctx.nfsContrato.length})`, 14, y); y += 4;
      const bms = ctx.nfsContrato.slice(0, 12).map(nf => [
        nf.numero || '—',
        fmtData(nf.dataLimite),
        fmtBRL(nf.valor),
        nf.emitida ? 'Emitida' : 'Rascunho',
      ]);
      pdf.autoTable({
        startY: y + 2,
        head: [['Nº BM', 'Data', 'Valor', 'Status']],
        body: bms,
        theme: 'grid',
        headStyles: { fillColor: [60, 60, 60], textColor: [255, 255, 255], fontStyle: 'bold' },
        bodyStyles: { fontSize: 9 },
        columnStyles: { 2: { halign: 'right' } },
        margin: { left: 14, right: 14 },
      });
      y = pdf.lastAutoTable.finalY + 6;
    }

    // Rodapé
    pdf.setTextColor(150, 150, 150); pdf.setFontSize(8);
    pdf.text(`Rhino — Gestão Empresarial · ${contract.name || 'Contrato'}`, 14, 290);
    pdf.text('Página 1', 196, 290, { align: 'right' });

    const filename = `Contrato_${(contract.name || 'sem_nome').replace(/[^a-zA-Z0-9]+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    pdf.save(filename);
    window.showToast('PDF gerado com sucesso', 'success');
  },

  });
})();
