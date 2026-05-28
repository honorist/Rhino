/* Rhino · ContratoDetail · rdos-pdf-batch
   Exportação em lote de RDOs de um período como único PDF. */
(function () {
  if (!window.ContratoDetail) { console.error('[contrato/rdos-pdf-batch] requires ContratoDetail core'); return; }
  Object.assign(window.ContratoDetail, {

  showModalExportarPeriodo(rdos, contract) {
    if (!rdos || rdos.length === 0) { window.showToast('Nenhum RDO para exportar', 'warning'); return; }
    const datas = rdos.map(r => r.data).filter(Boolean).sort();
    const minDate = datas[0] || '';
    const maxDate = datas[datas.length - 1] || '';

    const html = `
      <div class="modal-overlay" id="modalExportarPeriodo">
        <div class="modal" style="width:420px;">
          <div class="modal-header">
            <h2 class="modal-title">Exportar RDOs por período</h2>
            <button class="modal-close">✕</button>
          </div>
          <div class="modal-content">
            <div class="form-row" style="gap:var(--sp-md);">
              <div class="form-group" style="flex:1;">
                <label class="form-label">Data início</label>
                <input class="form-control" type="date" id="exportDtInicio" value="${minDate}">
              </div>
              <div class="form-group" style="flex:1;">
                <label class="form-label">Data fim</label>
                <input class="form-control" type="date" id="exportDtFim" value="${maxDate}">
              </div>
            </div>
            <p id="exportCount" style="font-size:14px;color:var(--color-text-muted);margin:0;"></p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnExportCancelar">Cancelar</button>
            <button class="btn btn-primary" id="btnExportGerar">📄 Gerar PDF</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalExportarPeriodo');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnExportCancelar').addEventListener('click', close);

    const updateCount = () => {
      const di = document.getElementById('exportDtInicio').value;
      const df = document.getElementById('exportDtFim').value;
      const n = rdos.filter(r => r.data && r.data >= di && r.data <= df).length;
      const el = document.getElementById('exportCount');
      if (el) el.textContent = n > 0 ? `${n} RDO(s) no período selecionado` : 'Nenhum RDO neste período';
    };

    document.getElementById('exportDtInicio').addEventListener('change', updateCount);
    document.getElementById('exportDtFim').addEventListener('change', updateCount);
    updateCount();

    document.getElementById('btnExportGerar').addEventListener('click', async () => {
      const di = document.getElementById('exportDtInicio').value;
      const df = document.getElementById('exportDtFim').value;
      if (!di || !df) { window.showToast('Informe as datas de início e fim', 'warning'); return; }
      const filtered = rdos.filter(r => r.data && r.data >= di && r.data <= df).sort((a, b) => a.data.localeCompare(b.data));
      if (!filtered.length) { window.showToast('Nenhum RDO no período selecionado', 'warning'); return; }
      close();
      await this.exportarRdosBatchPdf(filtered, contract, di, df);
    });
  },

  async exportarRdosBatchPdf(rdos, contract, di, df) {
    if (typeof window.jspdf === 'undefined') {
      try { await window.RhinoLazy.ensure(['jspdf', 'jspdf-autotable']); }
      catch { window.showToast('Falha ao carregar biblioteca PDF', 'error'); return; }
    }
    window.showToast(`Gerando PDF de ${rdos.length} RDO(s)…`, 'info');

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

    const logo = await carregarLogo();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 14;
    const contentW = pageW - 2 * margin;

    const fmt = (d) => { if (!d) return '—'; const [yy, mm, dd] = d.split('-'); return `${dd}/${mm}/${yy}`; };
    const autoTable = doc.autoTable.bind(doc);

    // ═══════ CAPA ═══════
    let y = 35;
    if (logo) {
      const maxW = 40, maxH = 20;
      const ratio = logo.w / logo.h;
      let drawW, drawH;
      if (ratio > maxW / maxH) { drawW = maxW; drawH = maxW / ratio; }
      else { drawH = maxH; drawW = maxH * ratio; }
      try { doc.addImage(logo.data, logo.fmt || 'JPEG', pageW / 2 - drawW / 2, y, drawW, drawH, undefined, 'FAST'); y += drawH + 8; }
      catch { y += 8; }
    }
    doc.setFontSize(20); doc.setFont(undefined, 'bold'); doc.setTextColor(30, 64, 175);
    doc.text('RELATÓRIOS DIÁRIOS DE OBRA', pageW / 2, y, { align: 'center' }); y += 10;
    doc.setFontSize(14); doc.setFont(undefined, 'normal'); doc.setTextColor(0);
    doc.text(contract.name || '—', pageW / 2, y, { align: 'center' }); y += 8;
    doc.setFontSize(11); doc.setTextColor(80);
    doc.text(`Período: ${fmt(di)} a ${fmt(df)}`, pageW / 2, y, { align: 'center' }); y += 6;
    doc.text(`${rdos.length} relatório(s)`, pageW / 2, y, { align: 'center' }); y += 6;
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, pageW / 2, y, { align: 'center' });

    // ═══════ SUMÁRIO ═══════
    doc.addPage();
    doc.setFontSize(13); doc.setFont(undefined, 'bold'); doc.setTextColor(0);
    doc.text('SUMÁRIO', margin, 16);
    autoTable({
      startY: 20,
      margin: { left: margin, right: margin },
      head: [['Nº', 'Data', 'Dia', 'MO Total', 'Atividades', 'Segurança']],
      body: rdos.map(r => {
        const mo = ((r.moi||[]).reduce((s,x)=>s+(parseFloat(x.qtd)||0),0))
                 + ((r.mod||[]).reduce((s,x)=>s+(parseFloat(x.qtd)||0),0))
                 + ((r.terc||[]).reduce((s,x)=>s+(parseFloat(x.qtd)||0),0));
        const ac = r.seguranca?.acidente || 'nao_houve';
        const seg = ac === 'nao_houve' ? 'OK' : ac === 'sem_afastamento' ? 'Incid. s/ afas.' : 'ACIDENTE';
        return [`#${r.numero}`, fmt(r.data), r.diaSemana || '—', mo, (r.atividades||[]).length, seg];
      }),
      headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold', fontSize: 9 },
      styles: { fontSize: 9, cellPadding: 2 },
      alternateRowStyles: { fillColor: [240, 245, 255] },
      columnStyles: {
        0: { cellWidth: 18 }, 1: { cellWidth: 24 }, 2: { cellWidth: 26 },
        3: { cellWidth: 20, halign: 'center' }, 4: { cellWidth: 22, halign: 'center' }, 5: {},
      },
    });

    // ═══════ UM RDO POR PÁGINA ═══════
    for (const rdo of rdos) {
      doc.addPage();
      this._renderRdoBatch(doc, rdo, contract, logo, autoTable, margin, contentW, pageW, fmt);
    }

    const mesAno = di ? di.slice(0, 7) : 'periodo';
    const safeName = (contract.name || 'contrato').replace(/[^a-zA-Z0-9]/g, '-').slice(0, 30);
    doc.save(`RDOs-${safeName}-${mesAno}.pdf`);
    window.showToast('PDF gerado com sucesso!', 'success');
  },

  _renderRdoBatch(doc, rdo, contract, logo, autoTable, margin, contentW, pageW, fmt) {
    let y = margin;

    // Cabeçalho da página do RDO
    doc.setFillColor(30, 64, 175);
    doc.rect(margin, y, contentW, 10, 'F');
    doc.setTextColor(255); doc.setFontSize(10); doc.setFont(undefined, 'bold');
    doc.text(`RDO #${rdo.numero} — ${(contract.name || '').slice(0, 50)}`, margin + 3, y + 7);
    doc.setFont(undefined, 'normal'); doc.setFontSize(9);
    doc.text(`${fmt(rdo.data)}${rdo.diaSemana ? ' (' + rdo.diaSemana + ')' : ''}`, pageW - margin - 3, y + 7, { align: 'right' });
    doc.setTextColor(0);
    y += 14;

    // MO (Indireta + Direta + Terceiros)
    const moRows = [
      ...(rdo.moi||[]).filter(x=>x.funcao&&parseFloat(x.qtd)>0).map(x=>['MO Ind.', x.funcao, String(parseFloat(x.qtd)||0)]),
      ...(rdo.mod||[]).filter(x=>x.funcao&&parseFloat(x.qtd)>0).map(x=>['MO Dir.', x.funcao, String(parseFloat(x.qtd)||0)]),
      ...(rdo.terc||[]).filter(x=>x.funcao&&parseFloat(x.qtd)>0).map(x=>['Terc.', x.funcao, String(parseFloat(x.qtd)||0)]),
    ];
    const eqpRows = (rdo.equipamentos||[]).filter(x=>x.descricao&&parseFloat(x.qtd)>0).map(x=>[x.descricao, String(parseFloat(x.qtd)||0)]);
    const halfW = (contentW - 4) / 2;

    if (moRows.length > 0) {
      autoTable({
        startY: y, margin: { left: margin, right: margin + halfW + 4 },
        head: [['Tipo', 'Função', 'Qtd']],
        body: moRows,
        headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold', fontSize: 7 },
        styles: { fontSize: 7, cellPadding: 1.2 },
        columnStyles: { 0: { cellWidth: 14 }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 12, halign: 'center' } },
      });
    }
    if (eqpRows.length > 0) {
      autoTable({
        startY: y, margin: { left: margin + halfW + 4, right: margin },
        head: [['Equipamento', 'Qtd']],
        body: eqpRows,
        headStyles: { fillColor: [124, 58, 237], textColor: 255, fontStyle: 'bold', fontSize: 7 },
        styles: { fontSize: 7, cellPadding: 1.2 },
        columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 14, halign: 'center' } },
      });
    }

    y = (doc.lastAutoTable?.finalY || y) + 5;
    if (y > 255) { doc.addPage(); y = margin; }

    // Atividades
    const atvRows = (rdo.atividades||[]).map(a=>[a.descricao||'—', a.unidade||'—', String(a.progresso||0)+'%']);
    if (atvRows.length > 0) {
      autoTable({
        startY: y, margin: { left: margin, right: margin },
        head: [['Atividade', 'Unidade', 'Progresso']],
        body: atvRows,
        headStyles: { fillColor: [5, 150, 105], textColor: 255, fontStyle: 'bold', fontSize: 7 },
        styles: { fontSize: 7, cellPadding: 1.2 },
        columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 22 }, 2: { cellWidth: 22, halign: 'center' } },
      });
      y = (doc.lastAutoTable?.finalY || y) + 5;
    }
    if (y > 255) { doc.addPage(); y = margin; }

    // Observações
    if (rdo.observacoes) {
      doc.setFontSize(8); doc.setFont(undefined, 'bold'); doc.setTextColor(0);
      doc.text('Observações:', margin, y + 4);
      doc.setFont(undefined, 'normal');
      const lines = doc.splitTextToSize(String(rdo.observacoes), contentW);
      doc.text(lines, margin, y + 9);
      y += 9 + lines.length * 4.5;
    }

    // Segurança
    if (y > 265) { doc.addPage(); y = margin; }
    const ac = rdo.seguranca?.acidente || 'nao_houve';
    const segLabel = ac === 'nao_houve' ? 'Nenhum acidente/incidente' : ac === 'sem_afastamento' ? 'Incidente sem afastamento' : 'ACIDENTE COM AFASTAMENTO';
    const segColor = ac === 'nao_houve' ? [5, 150, 105] : ac === 'sem_afastamento' ? [180, 83, 9] : [185, 28, 28];
    doc.setFontSize(8); doc.setFont(undefined, 'bold'); doc.setTextColor(...segColor);
    doc.text(`Segurança: ${segLabel}`, margin, y + 5);
    doc.setTextColor(0);
  },

  });
})();
