// Geração de Boletim de Medição (BM) em PDF, baseado no modelo CMPC
// (703-F-CRG-0129 Anexo V). Usa jsPDF + autoTable.

window.BM = {
  fmt(v) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parseFloat(v) || 0);
  },
  pct(v) {
    return (parseFloat(v) || 0).toFixed(2).replace('.', ',') + '%';
  },

  /**
   * Gera o BM em PDF para uma saída específica.
   * @param {Object} params
   * @param {Object} params.contract  - contrato
   * @param {Object} params.saida     - saída (com nfId)
   * @param {Object} params.nf        - NF vinculada (BM)
   * @param {Array}  params.nfsAnteriores - NFs do mesmo contrato anteriores a esta
   * @param {Array}  params.nfsContrato   - todas NFs do contrato (para MED 01..12)
   */
  gerar({ contract, saida, nf, nfsAnteriores, nfsContrato }) {
    if (typeof window.jspdf === 'undefined') {
      alert('Biblioteca jsPDF não carregada.');
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // Cores e estilos (paleta CMPC aproximada)
    const VERDE = [29, 107, 63];          // #1D6B3F
    const VERDE_CLARO = [230, 242, 235];
    const CINZA_ESC = [51, 51, 51];
    const CINZA = [120, 120, 120];
    const CINZA_CLARO = [240, 240, 240];

    // Valores calculados
    const valor = parseFloat(saida.value) || 0;
    const valorAnterior = (nfsAnteriores || []).reduce((s, n) => s + (parseFloat(n.valor) || 0), 0);
    const valorAcumulado = valorAnterior + valor;
    const saldo = Math.max(0, (contract.value || 0) - valorAcumulado);
    const pctAnterior = contract.value > 0 ? (valorAnterior / contract.value) * 100 : 0;
    const pctMes      = contract.value > 0 ? (valor / contract.value) * 100 : 0;
    const pctTotal    = contract.value > 0 ? (valorAcumulado / contract.value) * 100 : 0;

    const osNum = contract.contractNumber || contract.id.slice(-6).toUpperCase();
    const descServico = saida.description || 'Serviço executado';

    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 10;
    let y = margin;

    // ═══ Cabeçalho ═══
    doc.setFillColor(...VERDE);
    doc.rect(margin, y, pageWidth - 2 * margin, 14, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('CMPC - Guaíba', margin + 4, y + 5.5);
    doc.setFontSize(11);
    doc.text('BOLETIM DE MEDIÇÃO DOS SERVIÇOS', margin + 4, y + 11);

    // Número do BM no canto direito
    doc.setFontSize(14);
    const numBm = saida.numeroBm || nf?.numero || 'BM-001';
    doc.text(numBm, pageWidth - margin - 4, y + 9, { align: 'right' });

    y += 18;

    // ═══ OS ═══
    doc.setFillColor(...VERDE_CLARO);
    doc.rect(margin, y, pageWidth - 2 * margin, 8, 'F');
    doc.setTextColor(...VERDE);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`OS_${osNum} — ${(contract.name || '').toUpperCase()}`, margin + 3, y + 5.5);
    y += 12;

    // ═══ Descrição do serviço ═══
    doc.setTextColor(...CINZA_ESC);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('DESCRIÇÃO DO SERVIÇO', margin, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const descLines = doc.splitTextToSize(descServico, pageWidth - 2 * margin);
    doc.text(descLines, margin, y + 4);
    y += 4 + descLines.length * 5 + 4;

    // ═══ Tabela de itens (contratado na OS) ═══
    doc.autoTable({
      startY: y,
      head: [['Item', 'Descrição', 'Unid.', 'Valor Unitário', 'Qtd.', 'Valor Total']],
      body: [
        ['1.1', descServico, 'un', this.fmt(valor), '1,00', this.fmt(valor)]
      ],
      foot: [
        [{ content: 'Subtotal', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold' } },
         '1,00', { content: this.fmt(valor), styles: { fontStyle: 'bold' } }],
        [{ content: 'Total Contratado na OS', colSpan: 5, styles: { halign: 'right', fontStyle: 'bold', fillColor: CINZA_CLARO } },
         { content: this.fmt(valor), styles: { fontStyle: 'bold', fillColor: CINZA_CLARO } }]
      ],
      theme: 'grid',
      headStyles: { fillColor: VERDE, textColor: [255, 255, 255], fontSize: 9, halign: 'center' },
      styles: { fontSize: 9, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 14, halign: 'center' },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 14, halign: 'center' },
        3: { cellWidth: 28, halign: 'right' },
        4: { cellWidth: 18, halign: 'center' },
        5: { cellWidth: 28, halign: 'right' }
      },
      margin: { left: margin, right: margin }
    });
    y = doc.lastAutoTable.finalY + 4;

    // ═══ Valor Cobrado Nesta Medição ═══
    doc.setFillColor(...VERDE);
    doc.rect(margin, y, pageWidth - 2 * margin, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('VALOR COBRADO NESTA MEDIÇÃO', margin + 3, y + 6.5);
    doc.setFontSize(13);
    doc.text(this.fmt(valor), pageWidth - margin - 3, y + 6.5, { align: 'right' });
    y += 14;

    // ═══ Dados Contratuais + Avanço (2 colunas) ═══
    doc.autoTable({
      startY: y,
      body: [
        [
          { content: 'Dados Contratuais', colSpan: 2, styles: { fillColor: CINZA_CLARO, fontStyle: 'bold', textColor: CINZA_ESC } },
          { content: 'Avanço do Projeto', colSpan: 2, styles: { fillColor: CINZA_CLARO, fontStyle: 'bold', textColor: CINZA_ESC } }
        ],
        [
          'VALOR CONTRATUAL',  { content: this.fmt(contract.value || 0), styles: { halign: 'right', fontStyle: 'bold' } },
          '% Avanço Anterior', { content: this.pct(pctAnterior),         styles: { halign: 'right', fontStyle: 'bold' } }
        ],
        [
          'VALOR ACUMULADO',   { content: this.fmt(valorAcumulado), styles: { halign: 'right', fontStyle: 'bold' } },
          '% Avanço do Mês',   { content: this.pct(pctMes),         styles: { halign: 'right', fontStyle: 'bold' } }
        ],
        [
          'SALDO CONTRATUAL',  { content: this.fmt(saldo), styles: { halign: 'right', fontStyle: 'bold', textColor: saldo > 0 ? VERDE : [180, 0, 0] } },
          '% Avanço Total',    { content: this.pct(pctTotal), styles: { halign: 'right', fontStyle: 'bold', textColor: VERDE } }
        ]
      ],
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 2.5 },
      columnStyles: {
        0: { cellWidth: 48 },
        1: { cellWidth: 45 },
        2: { cellWidth: 48 },
        3: { cellWidth: 'auto' }
      },
      margin: { left: margin, right: margin }
    });
    y = doc.lastAutoTable.finalY + 5;

    // ═══ Acompanhamento por Medição (12 medições) ═══
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...CINZA_ESC);
    doc.text('Acompanhamento por Medição', margin, y);
    y += 3;

    const medLinhas = [];
    for (let linha = 0; linha < 4; linha++) {
      const l = [];
      for (let col = 0; col < 3; col++) {
        const idx = linha * 3 + col;
        const medNum = String(idx + 1).padStart(2, '0');
        const nfDoMes = (nfsContrato || [])[idx];
        const valorMed = nfDoMes ? this.fmt(nfDoMes.valor) : '—';
        const dataMed = nfDoMes && nfDoMes.dataEmissaoReal ? new Date(nfDoMes.dataEmissaoReal + 'T12:00:00').toLocaleDateString('pt-BR') : '';
        l.push(`MED ${medNum}`);
        l.push(dataMed ? `${valorMed}\n${dataMed}` : valorMed);
      }
      medLinhas.push(l);
    }

    doc.autoTable({
      startY: y,
      body: medLinhas,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 1.5, halign: 'center', valign: 'middle' },
      columnStyles: {
        0: { cellWidth: 20, fontStyle: 'bold', fillColor: CINZA_CLARO },
        1: { cellWidth: 38 },
        2: { cellWidth: 20, fontStyle: 'bold', fillColor: CINZA_CLARO },
        3: { cellWidth: 38 },
        4: { cellWidth: 20, fontStyle: 'bold', fillColor: CINZA_CLARO },
        5: { cellWidth: 'auto' }
      },
      margin: { left: margin, right: margin }
    });
    y = doc.lastAutoTable.finalY + 8;

    // ═══ Aprovações ═══
    if (y > 230) { doc.addPage(); y = margin + 5; }
    doc.setFillColor(...CINZA_CLARO);
    doc.rect(margin, y, pageWidth - 2 * margin, 7, 'F');
    doc.setTextColor(...CINZA_ESC);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('APROVAÇÕES', margin + 3, y + 5);
    y += 12;

    // 2 colunas de assinatura
    const colW = (pageWidth - 2 * margin - 4) / 2;
    const assinaturas = [
      { titulo: 'CONTRATADA', subtitulo: 'Gestor da Contratada' },
      { titulo: 'CMPC',       subtitulo: 'Fiscal do Contrato' }
    ];
    assinaturas.forEach((a, i) => {
      const x = margin + i * (colW + 4);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(a.titulo, x, y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(a.subtitulo, x, y + 4);
      // linha de assinatura
      doc.setDrawColor(...CINZA);
      doc.line(x, y + 25, x + colW, y + 25);
      doc.setFontSize(8);
      doc.setTextColor(...CINZA);
      doc.text('Assinatura e Data', x, y + 29);
      doc.setTextColor(...CINZA_ESC);
    });

    // Rodapé
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(...CINZA);
      doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR').slice(0,5)}`,
        margin, doc.internal.pageSize.getHeight() - 4);
      doc.text(`Pág. ${i}/${totalPages}`,
        pageWidth - margin, doc.internal.pageSize.getHeight() - 4, { align: 'right' });
    }

    const nomeSafe = (contract.name || 'contrato').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40);
    const dataStr = (saida.date || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
    doc.save(`${numBm}_${nomeSafe}_${dataStr}.pdf`);
  },

  gerarPorSaida(saidaId) {
    try {
      const saida = (Store.state.saidas || []).find(s => s.id === saidaId);
      if (!saida) { alert('Saída não encontrada.'); return; }
      const contract = (Store.state.contracts || []).find(c => c.id === saida.contractId);
      if (!contract) { alert('Contrato não encontrado.'); return; }
      const nf = (Store.state.notas_fiscais || []).find(n => n.id === saida.nfId);

      const nfsContrato = (Store.state.notas_fiscais || [])
        .filter(n => n.contractId === saida.contractId)
        .sort((a, b) => new Date(a.dataLimite) - new Date(b.dataLimite));

      const idxEsta = nfsContrato.findIndex(n => n.id === saida.nfId);
      const nfsAnteriores = idxEsta > 0 ? nfsContrato.slice(0, idxEsta) : [];

      this.gerar({ contract, saida, nf, nfsAnteriores, nfsContrato });
    } catch (e) {
      console.error(e);
      alert('Erro ao gerar BM: ' + e.message);
    }
  }
};
