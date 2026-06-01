/* Rhino · ContratoDetail · rdo-pdf
   Extraído de js/views/ContratoDetail.js (linhas 4258-4773)
   Estende o objeto window.ContratoDetail já definido. */
(function () {
  if (!window.ContratoDetail) { console.error('[contrato/rdo-pdf] requires ContratoDetail core'); return; }
  Object.assign(window.ContratoDetail, {
  async exportarRdoPdf(rdo, contract) {
    if (typeof window.jspdf === 'undefined') {
      try { await window.RhinoLazy.ensure(['jspdf', 'jspdf-autotable']); }
      catch { showToast('Falha ao carregar biblioteca PDF', 'error'); return; }
    }
    // Carrega logo (redimensiona pra 300px máx + JPEG com fundo branco → pequeno)
    const carregarLogo = () => new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const MAX = 300;
        let w = img.naturalWidth, h = img.naturalHeight;
        if (w > MAX || h > MAX) {
          const r = w / h;
          if (w >= h) { w = MAX; h = Math.round(MAX / r); }
          else        { h = MAX; w = Math.round(MAX * r); }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        try { resolve({ data: canvas.toDataURL('image/jpeg', 0.8), w, h, fmt: 'JPEG' }); }
        catch { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = 'assets/logo.png';
    });

    carregarLogo().then(logo => this._exportarRdoPdfImpl(rdo, contract, logo));
  },

  _exportarRdoPdfImpl(rdo, contract, logo) {
    const { jsPDF } = window.jspdf;
    // compress: true → compressão FlateDecode nativa do jsPDF (reduz ~70% o tamanho)
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 8;
    const contentW = pageW - 2 * margin;
    let y = margin;

    const fmt = (d) => {
      if (!d) return '';
      const [yy, mm, dd] = d.split('-');
      return `${dd}/${mm}/${yy}`;
    };

    const autoTable = doc.autoTable ? doc.autoTable.bind(doc) : null;
    if (!autoTable) {
      showToast('Biblioteca autoTable não carregada.', 'error');
      return;
    }

    // Helper — garante texto preto sempre que formos desenhar texto fora de autoTable
    const blackText = () => { doc.setTextColor(0, 0, 0); };

    // ═══════════ CABEÇALHO PRINCIPAL (estilo Usiminas) com LOGO ═══════════
    doc.setDrawColor(0);
    doc.setLineWidth(0.3);
    const headerH = 16;
    const logoW = 28;      // largura reservada para o logo (esquerda)
    const rightW = 28;     // largura reservada para número/página (direita)
    const titleX = margin + logoW;
    const titleW = contentW - logoW - rightW;

    // caixa do logo
    doc.rect(margin, y, logoW, headerH);
    if (logo) {
      // Dimensiona o logo preservando proporção, dentro da caixa com padding
      const pad = 2;
      const maxW = logoW - 2 * pad;
      const maxH = headerH - 2 * pad;
      const ratio = logo.w / logo.h;
      let drawW, drawH;
      if (ratio > maxW / maxH) { drawW = maxW; drawH = maxW / ratio; }
      else                      { drawH = maxH; drawW = maxH * ratio; }
      const ix = margin + (logoW - drawW) / 2;
      const iy = y + (headerH - drawH) / 2;
      try { doc.addImage(logo.data, logo.fmt || 'JPEG', ix, iy, drawW, drawH, undefined, 'FAST'); } catch {}
    } else {
      doc.setFontSize(8); doc.setFont(undefined, 'bold');
      doc.text('RHINO', margin + logoW / 2, y + headerH / 2 + 1, { align: 'center' });
    }

    // caixa do título central
    doc.rect(titleX, y, titleW, headerH);
    doc.setFillColor(240, 240, 240);
    doc.rect(titleX, y, titleW, headerH, 'F');
    doc.rect(titleX, y, titleW, headerH); // borda por cima do fill
    doc.setTextColor(0);
    doc.setFontSize(13);
    doc.setFont(undefined, 'bold');
    doc.text('RELATÓRIO DIÁRIO DE OBRA', titleX + titleW / 2, y + 7, { align: 'center' });
    doc.setFontSize(10);
    doc.text('RDO', titleX + titleW / 2, y + 12.5, { align: 'center' });

    // caixa direita (Nº + página)
    doc.rect(titleX + titleW, y, rightW, headerH);
    doc.setFontSize(7);
    doc.setFont(undefined, 'bold');
    doc.text('Nº RDO', titleX + titleW + rightW / 2, y + 4, { align: 'center' });
    doc.setFontSize(12);
    doc.text(`#${rdo.numero}`, titleX + titleW + rightW / 2, y + 9.5, { align: 'center' });
    doc.setFont(undefined, 'normal');
    doc.setFontSize(7);
    doc.text('PÁGINA 1/1', titleX + titleW + rightW / 2, y + 13.5, { align: 'center' });
    y += headerH;

    // Linha OBRA / N° CONTRATO / N° OS (3 colunas)
    blackText();
    const headerRowH = 7;
    const col1W = contentW * 0.5, col2W = contentW * 0.28, col3W = contentW * 0.22;

    const fitText = (txt, maxWidth, fontSize) => {
      doc.setFontSize(fontSize);
      const lines = doc.splitTextToSize(String(txt || '—'), maxWidth - 2);
      return lines[0] + (lines.length > 1 ? '…' : '');
    };

    doc.setFont(undefined, 'bold');
    doc.setFontSize(7);
    doc.rect(margin, y, col1W, headerRowH);
    doc.text('OBRA:', margin + 1, y + 3);
    doc.rect(margin + col1W, y, col2W, headerRowH);
    doc.text('N° DO CONTRATO:', margin + col1W + 1, y + 3);
    doc.rect(margin + col1W + col2W, y, col3W, headerRowH);
    doc.text('Nº ORDEM DE SERVIÇO:', margin + col1W + col2W + 1, y + 3);

    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    doc.text(fitText(contract.name, col1W, 9), margin + 1, y + 5.8);
    doc.text(fitText(contract.contractNumber, col2W, 9), margin + col1W + 1, y + 5.8);
    doc.text(fitText(rdo.osNumero, col3W, 9), margin + col1W + col2W + 1, y + 5.8);
    y += headerRowH;

    // Linha PROJETO / ORDEM DE COMPRA / DATA
    doc.setFont(undefined, 'bold');
    doc.setFontSize(7);
    doc.rect(margin, y, col1W, headerRowH);
    doc.text('PROJETO:', margin + 1, y + 3);
    doc.rect(margin + col1W, y, col2W, headerRowH);
    doc.text('ORDEM DE COMPRA:', margin + col1W + 1, y + 3);
    doc.rect(margin + col1W + col2W, y, col3W, headerRowH);
    doc.text('DATA:', margin + col1W + col2W + 1, y + 3);

    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    doc.text(fitText(rdo.projeto || contract.name, col1W, 9), margin + 1, y + 5.8);
    doc.text(fitText(rdo.ordemCompra, col2W, 9), margin + col1W + 1, y + 5.8);
    doc.text(fitText(`${fmt(rdo.data)} (${rdo.diaSemana || ''})`, col3W, 9), margin + col1W + col2W + 1, y + 5.8);
    y += headerRowH + 1;

    // ═══════════ BLOCO PRAZO + TEMPO (lado a lado) ═══════════
    blackText();
    const prazoW = contentW * 0.45;
    const tempoW = contentW * 0.55;
    const blockTop = y;

    // PRAZO (esquerda)
    doc.setFillColor(230, 230, 240);
    doc.rect(margin, y, prazoW, 5, 'F');
    doc.rect(margin, y, prazoW, 5);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(8);
    doc.text('PRAZO', margin + prazoW / 2, y + 3.5, { align: 'center' });

    // Layout 3 colunas × 2 linhas (igual ao modal web)
    const prazoRowY = y + 5;
    const pw = prazoW / 3;
    const labelH = 4, valueH = 6, rowH = labelH + valueH;
    const atraso = rdo.prazo?.atraso || 0;
    const faltanteTxt = atraso > 0
      ? `ATRASO ${atraso}d`
      : `${rdo.prazo?.faltante || 0} dias`;
    const prazoGrid = [
      [
        { l: 'DATA INICIAL',  v: fmt(rdo.prazo?.dataInicial)   || '—' },
        { l: 'DATA FINAL',    v: fmt(rdo.prazo?.dataFinal)     || '—' },
        { l: 'TENDÊNCIA',     v: fmt(rdo.prazo?.dataTendencia) || '—' }
      ],
      [
        { l: 'DECORRIDO',    v: (rdo.prazo?.decorrido || 0) + ' dias' },
        { l: atraso > 0 ? 'ATRASO' : 'FALTANTE', v: faltanteTxt, alerta: atraso > 0 },
        { l: '% CONCLUÍDA',  v: (rdo.prazo?.pctConcluida || 0) + '%' }
      ]
    ];
    prazoGrid.forEach((linha, r) => {
      linha.forEach((c, i) => {
        const cellY = prazoRowY + r * rowH;
        // label
        if (c.alerta) {
          doc.setFillColor(254, 226, 226);
          doc.rect(margin + i * pw, cellY, pw, labelH, 'F');
        }
        doc.rect(margin + i * pw, cellY, pw, labelH);
        // valor
        if (c.alerta) {
          doc.setFillColor(254, 242, 242);
          doc.rect(margin + i * pw, cellY + labelH, pw, valueH, 'F');
        }
        doc.rect(margin + i * pw, cellY + labelH, pw, valueH);
        doc.setFont(undefined, 'bold');
        doc.setFontSize(6.5);
        if (c.alerta) doc.setTextColor(185, 28, 28); else doc.setTextColor(0, 0, 0);
        doc.text(c.l, margin + i * pw + pw / 2, cellY + 2.8, { align: 'center' });
        doc.setFont(undefined, c.alerta ? 'bold' : 'normal');
        doc.setFontSize(8.5);
        if (c.alerta) doc.setTextColor(185, 28, 28); else doc.setTextColor(0, 0, 0);
        doc.text(String(c.v), margin + i * pw + pw / 2, cellY + labelH + 4, { align: 'center' });
      });
    });
    doc.setTextColor(0, 0, 0);

    // TEMPO (direita)
    const tempoX = margin + prazoW;
    doc.setFillColor(230, 230, 240);
    doc.rect(tempoX, y, tempoW, 5, 'F');
    doc.rect(tempoX, y, tempoW, 5);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(8);
    doc.text('TEMPO / CONDIÇÕES DA ÁREA', tempoX + tempoW / 2, y + 3.5, { align: 'center' });

    const tempoLabel = { bom: 'BOM', chuva: 'CHUVA', nao_houve: 'NÃO HOUVE', sem_expediente: 'S/ EXPEDIENTE' };
    const condLabel  = { operavel: 'OPERÁVEL', parcial: 'OP. PARCIAL', inoperavel: 'INOPERÁVEL' };
    const tempoRowY = y + 5;
    const tw = tempoW / 4;
    // cabeçalho: PERÍODO | TEMPO | CONDIÇÕES | PRECIP.
    ['PERÍODO', 'TEMPO', 'CONDIÇÕES', 'PRECIP.'].forEach((h, i) => {
      doc.rect(tempoX + i * tw, tempoRowY, tw, 4);
      doc.setFont(undefined, 'bold');
      doc.setFontSize(6.5);
      doc.text(h, tempoX + i * tw + tw / 2, tempoRowY + 2.8, { align: 'center' });
    });
    const tempoLinhas = [
      { p: 'MANHÃ',     t: tempoLabel[rdo.tempo?.manha?.tempo] || '—',    c: condLabel[rdo.tempo?.manha?.condicoes] || '—',    pre: '' },
      { p: 'TARDE',     t: tempoLabel[rdo.tempo?.tarde?.tempo] || '—',    c: condLabel[rdo.tempo?.tarde?.condicoes] || '—',    pre: '' },
      { p: 'NOITE ANT.', t: tempoLabel[rdo.tempo?.noiteAnt?.tempo] || '—', c: condLabel[rdo.tempo?.noiteAnt?.condicoes] || '—', pre: (rdo.tempo?.precipitacao || 0) + 'mm' }
    ];
    tempoLinhas.forEach((l, idx) => {
      const yy = tempoRowY + 4 + idx * 4;
      [l.p, l.t, l.c, l.pre].forEach((v, i) => {
        doc.rect(tempoX + i * tw, yy, tw, 4);
        doc.setFont(undefined, i === 0 ? 'bold' : 'normal');
        doc.setFontSize(6.5);
        doc.text(String(v), tempoX + i * tw + tw / 2, yy + 2.8, { align: 'center' });
      });
    });

    y = Math.max(prazoRowY + 2 * rowH, tempoRowY + 4 + 3 * 4) + 1;

    // ═══════════ PERÍODO DE TRABALHO + HORA EXTRA ═══════════
    blackText();
    doc.rect(margin, y, contentW, 5);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(7);
    doc.text('PERÍODO DE TRABALHO:', margin + 1, y + 3.3);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    doc.text(rdo.periodoTrabalho || '—', margin + 40, y + 3.5);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(7);
    doc.text('HORA EXTRA:', margin + contentW - 40, y + 3.3);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    doc.text(rdo.horaExtra ? 'SIM' : 'NÃO', margin + contentW - 18, y + 3.5);
    y += 6;

    // ═══════════ MÃO DE OBRA (MOI + MOD lado a lado) ═══════════
    const moiRows = (rdo.moi  || []).map(x => [x.cargo || '—', String(x.qtd || 0)]);
    const modRows = (rdo.mod  || []).map(x => [x.cargo || '—', String(x.qtd || 0)]);
    const tercRows = (rdo.terc || []).map(x => [`${x.cargo || '—'} (${x.empresa || ''})`, String(x.qtd || 0)]);
    const totalMoi = (rdo.moi  || []).reduce((s, x) => s + (+x.qtd || 0), 0);
    const totalMod = (rdo.mod  || []).reduce((s, x) => s + (+x.qtd || 0), 0);
    const totalTerc = (rdo.terc || []).reduce((s, x) => s + (+x.qtd || 0), 0);
    moiRows.push([{ content: `TOTAL (MOI)`, styles: { fontStyle: 'bold', fillColor: [230, 230, 240] } }, { content: String(totalMoi), styles: { fontStyle: 'bold', fillColor: [230, 230, 240] } }]);
    modRows.push([{ content: `TOTAL (MOD)`, styles: { fontStyle: 'bold', fillColor: [230, 230, 240] } }, { content: String(totalMod), styles: { fontStyle: 'bold', fillColor: [230, 230, 240] } }]);
    tercRows.push([{ content: `TOTAL (TERC.)`, styles: { fontStyle: 'bold', fillColor: [230, 230, 240] } }, { content: String(totalTerc), styles: { fontStyle: 'bold', fillColor: [230, 230, 240] } }]);

    const colMo = (contentW - 4) / 3;
    // MOI
    autoTable({
      startY: y, margin: { left: margin },
      tableWidth: colMo,
      head: [[{ content: 'MÃO DE OBRA INDIRETA', colSpan: 2, styles: { halign: 'center', fillColor: [85, 88, 139], textColor: 255, fontSize: 8 } }]],
      body: [['CARGO', 'QTD.'].map(h => ({ content: h, styles: { fontStyle: 'bold', fontSize: 7, fillColor: [240, 240, 240] } })), ...moiRows],
      styles: { fontSize: 7.5, cellPadding: 1.2, lineColor: [150, 150, 150], lineWidth: 0.2 },
      columnStyles: { 1: { cellWidth: 10, halign: 'center' } }
    });
    const moYEnd = doc.lastAutoTable.finalY;

    // MOD
    autoTable({
      startY: y, margin: { left: margin + colMo + 2 },
      tableWidth: colMo,
      head: [[{ content: 'MÃO DE OBRA DIRETA', colSpan: 2, styles: { halign: 'center', fillColor: [85, 88, 139], textColor: 255, fontSize: 8 } }]],
      body: [['CARGO', 'QTD.'].map(h => ({ content: h, styles: { fontStyle: 'bold', fontSize: 7, fillColor: [240, 240, 240] } })), ...modRows],
      styles: { fontSize: 7.5, cellPadding: 1.2, lineColor: [150, 150, 150], lineWidth: 0.2 },
      columnStyles: { 1: { cellWidth: 10, halign: 'center' } }
    });
    const modYEnd = doc.lastAutoTable.finalY;

    // TERC
    autoTable({
      startY: y, margin: { left: margin + 2 * (colMo + 2) - 2 },
      tableWidth: colMo,
      head: [[{ content: 'TERCEIRIZADOS', colSpan: 2, styles: { halign: 'center', fillColor: [85, 88, 139], textColor: 255, fontSize: 8 } }]],
      body: [['CARGO', 'QTD.'].map(h => ({ content: h, styles: { fontStyle: 'bold', fontSize: 7, fillColor: [240, 240, 240] } })), ...tercRows],
      styles: { fontSize: 7.5, cellPadding: 1.2, lineColor: [150, 150, 150], lineWidth: 0.2 },
      columnStyles: { 1: { cellWidth: 10, halign: 'center' } }
    });
    const tercYEnd = doc.lastAutoTable.finalY;

    y = Math.max(moYEnd, modYEnd, tercYEnd) + 2;

    // ═══════════ EQUIPAMENTOS ═══════════
    if ((rdo.equipamentos || []).length > 0) {
      const eqpRows = (rdo.equipamentos || []).map(e => [e.tipo || '—', String(e.qtd || 0), String(e.horas || 0)]);
      const totalEqp = (rdo.equipamentos || []).reduce((s, e) => s + (+e.qtd || 0), 0);
      eqpRows.push([
        { content: 'TOTAL (EQP)', styles: { fontStyle: 'bold', fillColor: [230, 230, 240] } },
        { content: String(totalEqp), styles: { fontStyle: 'bold', fillColor: [230, 230, 240] } },
        { content: '', styles: { fillColor: [230, 230, 240] } }
      ]);
      autoTable({
        startY: y, margin: { left: margin, right: margin },
        head: [
          [{ content: 'EQUIPAMENTOS', colSpan: 3, styles: { halign: 'center', fillColor: [109, 148, 128], textColor: 255, fontSize: 8 } }],
          [{ content: 'EQUIPAMENTO', styles: { fontStyle: 'bold', fontSize: 7, fillColor: [240, 240, 240] } },
           { content: 'QTD.',         styles: { fontStyle: 'bold', fontSize: 7, fillColor: [240, 240, 240], halign: 'center' } },
           { content: 'HORAS',        styles: { fontStyle: 'bold', fontSize: 7, fillColor: [240, 240, 240], halign: 'center' } }]
        ],
        body: eqpRows,
        styles: { fontSize: 7.5, cellPadding: 1.2, lineColor: [150, 150, 150], lineWidth: 0.2 },
        columnStyles: { 1: { cellWidth: 18, halign: 'center' }, 2: { cellWidth: 18, halign: 'center' } }
      });
      y = doc.lastAutoTable.finalY + 2;
    }

    // ═══════════ TOTAIS DE HORAS ═══════════
    blackText();
    const hh = (rdo.totais?.homensHora) || (
      ['moi','mod','terc'].reduce((s, k) =>
        s + (rdo[k] || []).reduce((a, x) => a + (+x.qtd || 0) * (+x.horas || 0), 0), 0)
    );
    const eqpH = (rdo.totais?.equipamentoHora) || (rdo.equipamentos || []).reduce((a, x) => a + (+x.qtd || 0) * (+x.horas || 0), 0);
    const hpar = rdo.totais?.horasParadas || 0;

    const totH = contentW / 3;
    doc.setFillColor(240, 240, 240);
    doc.rect(margin, y, totH, 6, 'F');
    doc.rect(margin, y, totH, 6);
    doc.rect(margin + totH, y, totH, 6, 'F');
    doc.rect(margin + totH, y, totH, 6);
    doc.rect(margin + 2 * totH, y, totH, 6, 'F');
    doc.rect(margin + 2 * totH, y, totH, 6);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(7);
    doc.text(`HOMENS HORA: ${hh.toFixed(1)}`, margin + 2, y + 4);
    doc.text(`HORAS PARADAS: ${hpar}`, margin + totH + 2, y + 4);
    doc.text(`EQUIPAMENTO HORA: ${eqpH.toFixed(1)}`, margin + 2 * totH + 2, y + 4);
    y += 7;

    // ═══════════ DESCRIÇÃO DE ATIVIDADES ═══════════
    if ((rdo.atividades || []).length > 0) {
      autoTable({
        startY: y, margin: { left: margin, right: margin },
        head: [
          [{ content: 'DESCRIÇÃO DE ATIVIDADES', colSpan: 4, styles: { halign: 'center', fillColor: [85, 88, 139], textColor: 255, fontSize: 8 } }],
          [{ content: 'ÁREA',        styles: { fontStyle: 'bold', fontSize: 7, fillColor: [240, 240, 240] } },
           { content: 'DESCRIÇÃO',   styles: { fontStyle: 'bold', fontSize: 7, fillColor: [240, 240, 240] } },
           { content: '% CONCL.',    styles: { fontStyle: 'bold', fontSize: 7, fillColor: [240, 240, 240], halign: 'center' } },
           { content: 'OCORRÊNCIAS / ALERTAS', styles: { fontStyle: 'bold', fontSize: 7, fillColor: [240, 240, 240] } }]
        ],
        body: (rdo.atividades || []).map(a => [
          a.area || '—',
          a.descricao || '—',
          { content: (a.pctConcluida || 0) + '%', styles: { halign: 'center', fontStyle: 'bold' } },
          a.ocorrencias || '—'
        ]),
        styles: { fontSize: 7.5, cellPadding: 1.5, lineColor: [150, 150, 150], lineWidth: 0.2, valign: 'top' },
        columnStyles: { 0: { cellWidth: 28 }, 1: { cellWidth: 78 }, 2: { cellWidth: 16 } }
      });
      y = doc.lastAutoTable.finalY + 2;
    }

    // ═══════════ EQUIPES POR ATIVIDADE ═══════════
    const _durEq = (eq) => {
      const [hi, mi] = String(eq.horaInicio || '').split(':').map(Number);
      const [hf, mf] = String(eq.horaFim || '').split(':').map(Number);
      if ([hi, mi, hf, mf].some(n => Number.isNaN(n))) return 0;
      const min = (hf * 60 + mf) - (hi * 60 + mi);
      return min > 0 ? min / 60 : 0;
    };
    const _equipeRows = [];
    (rdo.atividades || []).forEach(a => {
      (a.equipes || []).forEach(eq => {
        const hh = _durEq(eq) * ((eq.membros || []).length);
        const membros = (eq.membros || [])
          .map(mm => (mm.nome || '') + (mm.funcao ? ` (${mm.funcao})` : ''))
          .filter(s => s.trim()).join(', ');
        _equipeRows.push([
          a.descricao || a.area || '—',
          eq.nome || '—',
          { content: `${eq.horaInicio || '--'}–${eq.horaFim || '--'}`, styles: { halign: 'center' } },
          { content: hh.toFixed(1), styles: { halign: 'center', fontStyle: 'bold' } },
          membros || '—',
        ]);
      });
    });
    if (_equipeRows.length > 0) {
      autoTable({
        startY: y, margin: { left: margin, right: margin },
        head: [
          [{ content: 'EQUIPES POR ATIVIDADE', colSpan: 5, styles: { halign: 'center', fillColor: [85, 88, 139], textColor: 255, fontSize: 8 } }],
          [{ content: 'ATIVIDADE', styles: { fontStyle: 'bold', fontSize: 7, fillColor: [240, 240, 240] } },
           { content: 'EQUIPE',    styles: { fontStyle: 'bold', fontSize: 7, fillColor: [240, 240, 240] } },
           { content: 'HORÁRIO',   styles: { fontStyle: 'bold', fontSize: 7, fillColor: [240, 240, 240], halign: 'center' } },
           { content: 'H-H',       styles: { fontStyle: 'bold', fontSize: 7, fillColor: [240, 240, 240], halign: 'center' } },
           { content: 'MEMBROS',   styles: { fontStyle: 'bold', fontSize: 7, fillColor: [240, 240, 240] } }]
        ],
        body: _equipeRows,
        styles: { fontSize: 7.5, cellPadding: 1.5, lineColor: [150, 150, 150], lineWidth: 0.2, valign: 'top' },
        columnStyles: { 0: { cellWidth: 34 }, 1: { cellWidth: 26 }, 2: { cellWidth: 22 }, 3: { cellWidth: 12 } }
      });
      y = doc.lastAutoTable.finalY + 2;
    }

    // ═══════════ SEGURANÇA — autoTable pra garantir altura dinâmica e wrap ═══════════
    blackText();
    const acid = rdo.seguranca?.acidente || 'nao_houve';
    const chk = (ok) => ok ? '☒' : '☐';
    const acidLine = `${chk(acid === 'nao_houve')} Não Houve    ${chk(acid === 'sem_afastamento')} Sem Afastamento    ${chk(acid === 'com_afastamento')} Com Afastamento`;

    autoTable({
      startY: y, margin: { left: margin, right: margin },
      head: [[{ content: 'SEGURANÇA DO TRABALHO', colSpan: 2, styles: { halign: 'center', fillColor: [220, 38, 38], textColor: 255, fontSize: 8, fontStyle: 'bold' } }]],
      body: [
        [{ content: 'Acidente', styles: { fontStyle: 'bold', fillColor: [248, 240, 240] } }, acidLine],
        [{ content: 'Tema do DDS', styles: { fontStyle: 'bold', fillColor: [248, 240, 240] } }, rdo.seguranca?.temaDds || '—'],
        [{ content: 'Tema de Meio Ambiente', styles: { fontStyle: 'bold', fillColor: [248, 240, 240] } }, rdo.seguranca?.temaMeioAmbiente || '—'],
        ...(rdo.seguranca?.diagnostico ? [[{ content: 'Diagnóstico', styles: { fontStyle: 'bold', fillColor: [248, 240, 240] } }, rdo.seguranca.diagnostico]] : []),
        [{ content: 'Comentários', styles: { fontStyle: 'bold', fillColor: [248, 240, 240] } }, rdo.seguranca?.comentarios || '—']
      ],
      styles: { fontSize: 8, cellPadding: 1.8, lineColor: [150, 150, 150], lineWidth: 0.2, valign: 'top', overflow: 'linebreak' },
      columnStyles: { 0: { cellWidth: 42 } }
    });
    y = doc.lastAutoTable.finalY + 2;
    blackText();

    // ═══════════ FISCALIZAÇÃO ═══════════
    if (rdo.fiscalizacaoComentarios) {
      autoTable({
        startY: y, margin: { left: margin, right: margin },
        head: [[{ content: 'COMENTÁRIOS DA FISCALIZAÇÃO', styles: { halign: 'center', fillColor: [85, 88, 139], textColor: 255, fontSize: 8, fontStyle: 'bold' } }]],
        body: [[rdo.fiscalizacaoComentarios]],
        styles: { fontSize: 8, cellPadding: 2, lineColor: [150, 150, 150], lineWidth: 0.2, overflow: 'linebreak' }
      });
      y = doc.lastAutoTable.finalY + 2;
      blackText();
    }

    // ═══════════ ASSINATURAS (rodapé) ═══════════
    const assinAtual = Math.max(y, pageH - 30);
    if (assinAtual + 20 > pageH - margin) { doc.addPage(); y = margin; }
    else { y = assinAtual; }

    blackText();
    const assinW = contentW / 3;
    ['Contratada', 'Contratante', 'Fiscalização'].forEach((papel, i) => {
      doc.rect(margin + i * assinW, y, assinW, 18);
      doc.setDrawColor(150);
      doc.line(margin + i * assinW + 5, y + 12, margin + (i + 1) * assinW - 5, y + 12);
      doc.setDrawColor(0);
      doc.setFont(undefined, 'bold');
      doc.setFontSize(7);
      doc.setTextColor(0, 0, 0);
      doc.text(papel.toUpperCase(), margin + i * assinW + assinW / 2, y + 16, { align: 'center' });
      doc.setFont(undefined, 'normal');
      doc.setFontSize(6);
      doc.text('VISTO / DATA', margin + i * assinW + assinW / 2, y + 3.5, { align: 'center' });
    });
    y += 20;

    // Fotos — nova página, grid 2 colunas
    const fotos = rdo.fotos || [];
    if (fotos.length > 0) {
      // Redimensiona a foto para no máximo 900px no lado maior + JPEG 0.55 → PDFs enxutos
      const MAX_DIM = 900;
      const JPEG_Q  = 0.55;
      const carregarImagem = (url) => new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          let w = img.naturalWidth, h = img.naturalHeight;
          if (w > MAX_DIM || h > MAX_DIM) {
            const ratio = w / h;
            if (w >= h) { w = MAX_DIM; h = Math.round(MAX_DIM / ratio); }
            else        { h = MAX_DIM; w = Math.round(MAX_DIM * ratio); }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, w, h);
          try { resolve({ data: canvas.toDataURL('image/jpeg', JPEG_Q), w, h }); }
          catch { resolve(null); }
        };
        img.onerror = () => resolve(null);
        img.src = url;
      });

      Promise.all(fotos.map(f => carregarImagem(f.url))).then(imgs => {
        doc.addPage();
        let py = margin;
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text(`Fotos — RDO #${rdo.numero} (${fmt(rdo.data)})`, margin, py);
        py += 8;

        const cols = 2;
        const gap = 4;
        const cellW = (pageW - 2 * margin - gap) / cols;
        const cellH = cellW * 0.7;

        fotos.forEach((f, i) => {
          const img = imgs[i];
          const col = i % cols;
          const row = Math.floor(i / cols);
          if (row > 0 && col === 0 && py + cellH + 20 > doc.internal.pageSize.getHeight()) {
            doc.addPage(); py = margin;
          }
          const x = margin + col * (cellW + gap);
          const yy = py + Math.floor(((i - (i % cols)) / cols) * 0) + row * (cellH + 14);
          if (img) {
            try {
              doc.addImage(img.data, 'JPEG', x, yy, cellW, cellH, undefined, 'FAST');
            } catch {}
          } else {
            doc.setDrawColor(200);
            doc.rect(x, yy, cellW, cellH);
          }
          if (f.legenda) {
            doc.setFontSize(8);
            doc.setFont(undefined, 'normal');
            doc.text(f.legenda.substring(0, 80), x + 1, yy + cellH + 4, { maxWidth: cellW - 2 });
          }
        });

        doc.save(`RDO-${rdo.numero}-${rdo.data}.pdf`);
      });
    } else {
      doc.save(`RDO-${rdo.numero}-${rdo.data}.pdf`);
    }
  },
  });
})();
