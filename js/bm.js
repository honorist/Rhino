// Geração do Boletim de Medição (BM) em PDF, replicando o modelo CMPC
// (703-F-CRG-0129 Anexo V) com a marca Rhino como contratada.

window.BM = {
  _logoDataUrl: null,

  fmt(v) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parseFloat(v) || 0);
  },
  pct(v) {
    return (parseFloat(v) || 0).toFixed(2).replace('.', ',') + '%';
  },

  async _loadLogo() {
    if (this._logoDataUrl) return this._logoDataUrl;
    try {
      const resp = await fetch('assets/logo.png');
      if (!resp.ok) return null;
      const blob = await resp.blob();
      return await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => { this._logoDataUrl = reader.result; resolve(this._logoDataUrl); };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch { return null; }
  },

  async gerar({ contract, saida, nf, nfsAnteriores, nfsContrato, saidasDoDia }) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // Cores
    const VERDE = [29, 107, 63];
    const VERDE_CLARO = [230, 242, 235];
    const PRETO = [20, 20, 20];
    const CINZA_ESC = [60, 60, 60];
    const CINZA = [130, 130, 130];
    const CINZA_CLARO = [235, 235, 235];
    const BRANCO = [255, 255, 255];

    // Saídas do dia (múltiplas saídas no mesmo BM)
    const itens = (saidasDoDia && saidasDoDia.length) ? saidasDoDia : [saida];
    const valorTotal = itens.reduce((s, it) => s + (parseFloat(it.value) || 0), 0);

    // Cálculos (usa o valor da NF como autoridade, pois ela agrega todas as saídas do dia)
    const valor = nf ? (parseFloat(nf.valor) || 0) : valorTotal;
    const valorAnterior = (nfsAnteriores || []).reduce((s, n) => s + (parseFloat(n.valor) || 0), 0);
    const valorAcumulado = valorAnterior + valor;
    const saldo = Math.max(0, (contract.value || 0) - valorAcumulado);
    const pctAnterior = contract.value > 0 ? (valorAnterior / contract.value) * 100 : 0;
    const pctMes      = contract.value > 0 ? (valor / contract.value) * 100 : 0;
    const pctTotal    = contract.value > 0 ? (valorAcumulado / contract.value) * 100 : 0;

    const osNum = contract.contractNumber || contract.id.slice(-6).toUpperCase();
    const descServico = itens.length > 1
      ? `Serviços executados em ${new Date(saida.date + 'T12:00:00').toLocaleDateString('pt-BR')} (${itens.length} itens)`
      : (saida.description || 'Serviço executado');
    const numBm = nf?.numero || saida.numeroBm || 'BM-001';

    const pw = doc.internal.pageSize.getWidth();  // 210mm
    const ph = doc.internal.pageSize.getHeight(); // 297mm
    const mgn = 10;
    const W = pw - 2 * mgn;
    let y = mgn;

    // ═══════════ Cabeçalho (logo + título) ═══════════
    const logo = await this._loadLogo();
    const headerH = 22;
    // Caixa branca com borda
    doc.setDrawColor(...PRETO);
    doc.setLineWidth(0.3);
    doc.rect(mgn, y, W, headerH);

    // Logo Rhino (esquerda)
    if (logo) {
      try { doc.addImage(logo, 'PNG', mgn + 2, y + 2, 34, 18); } catch (e) {}
    }

    // Título central
    doc.setTextColor(...PRETO);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('BOLETIM DE MEDIÇÃO DOS SERVIÇOS', pw / 2, y + 10, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Rhino Manutenções', pw / 2, y + 16, { align: 'center' });

    // Número do BM (direita)
    doc.setFillColor(...VERDE);
    doc.setDrawColor(...VERDE);
    doc.roundedRect(pw - mgn - 34, y + 4, 32, 14, 2, 2, 'F');
    doc.setTextColor(...BRANCO);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Nº DO BM', pw - mgn - 18, y + 8, { align: 'center' });
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(numBm, pw - mgn - 18, y + 15, { align: 'center' });

    y += headerH + 2;

    // ═══════════ Linha OS ═══════════
    doc.setFillColor(...VERDE);
    doc.rect(mgn, y, W, 8, 'F');
    doc.setTextColor(...BRANCO);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`OS ${osNum} — ${(contract.name || '').toUpperCase()}`, mgn + 3, y + 5.5);
    y += 10;

    // ═══════════ Descrição do serviço ═══════════
    doc.setFillColor(...VERDE_CLARO);
    doc.setDrawColor(...VERDE);
    doc.rect(mgn, y, W, 6, 'F');
    doc.rect(mgn, y, W, 6);
    doc.setTextColor(...VERDE);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('DESCRIÇÃO DO SERVIÇO', mgn + 2, y + 4);
    y += 6;

    doc.setDrawColor(...PRETO);
    doc.setLineWidth(0.2);
    doc.rect(mgn, y, W, 10);
    doc.setTextColor(...CINZA_ESC);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const descLines = doc.splitTextToSize(descServico, W - 4);
    doc.text(descLines.slice(0, 3), mgn + 2, y + 4);
    y += 12;

    // ═══════════ Tabela: Contratado na OS ═══════════
    doc.setFillColor(...VERDE_CLARO);
    doc.setDrawColor(...VERDE);
    doc.rect(mgn, y, W, 6, 'F');
    doc.rect(mgn, y, W, 6);
    doc.setTextColor(...VERDE);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('CONTRATADO NA OS — ORDEM DE SERVIÇO', mgn + 2, y + 4);
    y += 6;

    const linhasItens = itens.map((it, i) => [
      `1.${i + 1}`,
      it.description || 'Serviço',
      'un',
      this.fmt(it.value || 0),
      '1,00',
      this.fmt(it.value || 0)
    ]);

    doc.autoTable({
      startY: y,
      head: [['Item', 'Descrição', 'Unid.', 'Valor Unitário', 'Qtd.', 'Valor Total']],
      body: linhasItens,
      foot: [
        [{ content: 'Subtotal', colSpan: 4, styles: { halign: 'right' } },
         String(itens.length).replace('.', ',') + ',00', this.fmt(valor)],
        [{ content: 'TOTAL CONTRATADO NA OS', colSpan: 5, styles: { halign: 'right', fontStyle: 'bold' } },
         { content: this.fmt(valor), styles: { fontStyle: 'bold' } }]
      ],
      theme: 'grid',
      headStyles: { fillColor: VERDE, textColor: BRANCO, fontSize: 9, halign: 'center', fontStyle: 'bold', cellPadding: 1.8 },
      footStyles: { fillColor: CINZA_CLARO, textColor: PRETO, fontSize: 9, cellPadding: 1.8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 9, cellPadding: 1.8, textColor: PRETO, lineColor: CINZA, lineWidth: 0.1 },
      columnStyles: {
        0: { cellWidth: 15, halign: 'center' },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 15, halign: 'center' },
        3: { cellWidth: 28, halign: 'right' },
        4: { cellWidth: 18, halign: 'center' },
        5: { cellWidth: 28, halign: 'right' }
      },
      margin: { left: mgn, right: mgn },
      tableLineColor: PRETO,
      tableLineWidth: 0.3
    });
    y = doc.lastAutoTable.finalY + 3;

    // ═══════════ VALOR COBRADO NESTA MEDIÇÃO ═══════════
    doc.setFillColor(...VERDE);
    doc.setDrawColor(...VERDE);
    doc.rect(mgn, y, W, 12, 'F');
    doc.setTextColor(...BRANCO);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('VALOR COBRADO NESTA MEDIÇÃO', mgn + 3, y + 5);
    doc.setFontSize(15);
    doc.text(this.fmt(valor), pw - mgn - 3, y + 8, { align: 'right' });
    y += 14;

    // ═══════════ Dados Contratuais | Avanço do Projeto ═══════════
    doc.setFillColor(...VERDE_CLARO);
    doc.setDrawColor(...VERDE);
    const halfW = W / 2;
    // cabeçalhos
    doc.rect(mgn, y, halfW, 6, 'F');
    doc.rect(mgn, y, halfW, 6);
    doc.rect(mgn + halfW, y, halfW, 6, 'F');
    doc.rect(mgn + halfW, y, halfW, 6);
    doc.setTextColor(...VERDE);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('DADOS CONTRATUAIS', mgn + 2, y + 4);
    doc.text('AVANÇO DO PROJETO', mgn + halfW + 2, y + 4);
    y += 6;

    // linhas
    const linhas = [
      ['VALOR CONTRATUAL',  this.fmt(contract.value || 0),  '% Avanço Anterior', this.pct(pctAnterior)],
      ['VALOR ACUMULADO',   this.fmt(valorAcumulado),        '% Avanço do Mês',    this.pct(pctMes)],
      ['SALDO CONTRATUAL',  this.fmt(saldo),                  '% Avanço Total',     this.pct(pctTotal)]
    ];
    const rowH = 7;
    doc.setDrawColor(...PRETO);
    doc.setLineWidth(0.2);
    linhas.forEach((l, i) => {
      const ry = y + i * rowH;
      // esq label
      doc.rect(mgn, ry, halfW * 0.55, rowH);
      doc.rect(mgn + halfW * 0.55, ry, halfW * 0.45, rowH);
      // dir label
      doc.rect(mgn + halfW, ry, halfW * 0.55, rowH);
      doc.rect(mgn + halfW + halfW * 0.55, ry, halfW * 0.45, rowH);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...PRETO);
      doc.text(l[0], mgn + 2, ry + 4.5);
      doc.text(l[2], mgn + halfW + 2, ry + 4.5);

      doc.setFont('helvetica', 'bold');
      const corValor = (i === 2 && saldo <= 0) ? [180, 0, 0] : (i === 2 ? VERDE : PRETO);
      doc.setTextColor(...corValor);
      doc.text(l[1], mgn + halfW - 2, ry + 4.5, { align: 'right' });
      const corPct = i === 2 ? VERDE : PRETO;
      doc.setTextColor(...corPct);
      doc.text(l[3], mgn + W - 2, ry + 4.5, { align: 'right' });
    });
    y += linhas.length * rowH + 3;

    // ═══════════ Acompanhamento por Medição ═══════════
    doc.setFillColor(...VERDE_CLARO);
    doc.setDrawColor(...VERDE);
    doc.rect(mgn, y, W, 6, 'F');
    doc.rect(mgn, y, W, 6);
    doc.setTextColor(...VERDE);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('ACOMPANHAMENTO POR MEDIÇÃO', mgn + 2, y + 4);
    y += 6;

    const colsPorLinha = 4;
    const linhasMed = 3;  // 4x3 = 12 medições
    const cellW = W / colsPorLinha;
    const medRowH = 12;
    doc.setLineWidth(0.2);
    doc.setDrawColor(...PRETO);
    for (let r = 0; r < linhasMed; r++) {
      for (let c = 0; c < colsPorLinha; c++) {
        const idx = r * colsPorLinha + c;
        const x = mgn + c * cellW;
        const ry = y + r * medRowH;
        const medNum = String(idx + 1).padStart(2, '0');
        const nfDoMes = (nfsContrato || [])[idx];

        doc.rect(x, ry, cellW, medRowH);
        // Rótulo
        doc.setFillColor(...CINZA_CLARO);
        doc.rect(x, ry, 18, medRowH, 'F');
        doc.rect(x, ry, 18, medRowH);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(...PRETO);
        doc.text(`MED ${medNum}`, x + 9, ry + medRowH / 2 + 1, { align: 'center' });

        // Valor / data
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        if (nfDoMes) {
          doc.text(this.fmt(nfDoMes.valor || 0), x + 20, ry + 5);
          if (nfDoMes.dataEmissaoReal) {
            doc.setTextColor(...CINZA);
            const d = new Date(nfDoMes.dataEmissaoReal + 'T12:00:00').toLocaleDateString('pt-BR');
            doc.text(d, x + 20, ry + 9);
          }
        } else {
          doc.setTextColor(...CINZA);
          doc.text('—', x + 20, ry + medRowH / 2 + 1);
        }
      }
    }
    y += linhasMed * medRowH + 6;

    // ═══════════ Aprovações ═══════════
    if (y > ph - 60) { doc.addPage(); y = mgn + 5; }
    doc.setFillColor(...VERDE);
    doc.setDrawColor(...VERDE);
    doc.rect(mgn, y, W, 7, 'F');
    doc.setTextColor(...BRANCO);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('APROVAÇÕES', mgn + 3, y + 5);
    y += 12;

    const colW = (W - 4) / 2;
    [
      { titulo: 'CONTRATADA',      subt: 'Gestor / Rhino Manutenções' },
      { titulo: 'CMPC — FISCAL',   subt: 'Fiscal do Contrato' }
    ].forEach((a, i) => {
      const x = mgn + i * (colW + 4);
      doc.setDrawColor(...PRETO);
      doc.setLineWidth(0.2);
      doc.rect(x, y, colW, 34);
      doc.setTextColor(...PRETO);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(a.titulo, x + 3, y + 5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...CINZA_ESC);
      doc.text(a.subt, x + 3, y + 9);
      // linha de assinatura
      doc.setDrawColor(...CINZA);
      doc.line(x + 6, y + 25, x + colW - 6, y + 25);
      doc.setFontSize(8);
      doc.setTextColor(...CINZA);
      doc.text('Assinatura', (x + colW / 2), y + 29, { align: 'center' });
      doc.text('Data: ___/___/______', (x + colW / 2), y + 32, { align: 'center' });
    });
    y += 38;

    // ═══════════ Rodapé ═══════════
    const total = doc.internal.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...CINZA);
      doc.text(
        `Gerado por Rhino em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR').slice(0, 5)}`,
        mgn, ph - 5
      );
      doc.text(`Pág. ${i}/${total}`, pw - mgn, ph - 5, { align: 'right' });
    }

    const nomeSafe = (contract.name || 'contrato').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40);
    const dataStr = (saida.date || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
    doc.save(`${numBm}_${nomeSafe}_${dataStr}.pdf`);
  },

  async gerarPorSaida(saidaId) {
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

      // Todas as saídas que caem no MESMO BM (mesma NF)
      const saidasDoDia = (Store.state.saidas || [])
        .filter(s => s.nfId === saida.nfId)
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

      await this.gerar({ contract, saida, nf, nfsAnteriores, nfsContrato, saidasDoDia });
    } catch (e) {
      console.error(e);
      alert('Erro ao gerar BM: ' + e.message);
    }
  }
};
