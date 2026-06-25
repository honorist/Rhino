/* Rhino · Manutencao · romaneio
   Estende window.Manutencao com a geração do PDF do Romaneio de Material.
   Mantido em arquivo separado (padrão de contrato/rdo-pdf.js). */
(function () {
  if (!window.Manutencao) { console.error('[manutencao-romaneio] requires Manutencao core'); return; }
  Object.assign(window.Manutencao, {
    // Carrega assets/logo.png e devolve dataURL (fundo branco), p/ o cabeçalho.
    _carregarLogo() {
      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const MAX = 320;
          let w = img.naturalWidth, h = img.naturalHeight;
          if (w > MAX || h > MAX) { const r = w / h; if (w >= h) { w = MAX; h = Math.round(MAX / r); } else { h = MAX; w = Math.round(MAX * r); } }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          try { resolve({ data: canvas.toDataURL('image/png'), w, h }); } catch { resolve(null); }
        };
        img.onerror = () => resolve(null);
        img.src = 'assets/logo.png';
      });
    },

    async imprimirRomaneio(id) {
      const m = (Store.state.manutencoes || []).find((x) => x.id === id);
      if (!m) return;
      if (typeof window.jspdf === 'undefined') {
        try { await window.RhinoLazy.ensure(['jspdf', 'jspdf-autotable']); }
        catch { window.showToast('Falha ao carregar biblioteca PDF', 'error'); return; }
      }
      const logo = await this._carregarLogo();
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 14;
      let y = margin;

      // Cabeçalho: logo à esquerda + título central.
      if (logo) {
        const lw = 42, lh = Math.max(10, Math.round((logo.h / logo.w) * lw));
        doc.addImage(logo.data, 'PNG', margin, y, lw, lh);
      }
      doc.setFontSize(18); doc.setFont(undefined, 'bold');
      doc.text('ROMANEIO DE MATERIAL', pageW / 2 + 14, y + 10, { align: 'center' });
      y += 22;

      const ano = String(m.dataEnvio || m.createdAt || new Date().toISOString()).slice(0, 4);
      const rm = 'RM-' + String(m.numero || 0).padStart(3, '0') + '-' + ano;

      // Bloco de dados (rótulos em negrito) + número à direita.
      const origem = this._nomeContrato(m.contractId).replace(/^\u{1F3E2} |^\u{1F3D7}\u{FE0F} /u, '');
      const dataEnvio = this._fmtDate(m.dataEnvio) === '—'
        ? new Date().toLocaleDateString('pt-BR')
        : this._fmtDate(m.dataEnvio);
      const dados = [
        ['Empresa:', 'RHINO CONSTRUÇÕES E MONTAGENS'],
        ['Obra/Setor:', origem],
        ['Responsável:', m.solicitanteNome || ''],
        ['Data:', dataEnvio],
      ];
      doc.setFontSize(10);
      let yd = y;
      for (const [rot, val] of dados) {
        doc.setFont(undefined, 'bold'); doc.text(rot, margin, yd);
        doc.setFont(undefined, 'normal'); doc.text(String(val || ''), margin + 26, yd);
        yd += 5.5;
      }
      doc.setFont(undefined, 'bold');
      doc.text(rm, pageW - margin, y + 6, { align: 'right' });
      doc.setFont(undefined, 'normal');
      y = yd + 3;

      // Tabela de materiais (fallback: 1 linha com o equipamento).
      let itens = this._itens(m);
      if (!itens.length) itens = [{ descricao: m.equipamento || '', patrimonio: '', qtd: 1 }];
      const total = itens.reduce((s, it) => s + (parseFloat(it.qtd) || 0), 0);
      const body = itens.map((it, i) => [String(i + 1), it.descricao || '', it.patrimonio || '', String(parseFloat(it.qtd) || 0)]);

      if (doc.autoTable) {
        doc.autoTable({
          startY: y,
          head: [['Nº', 'Descrição da Ferramenta', 'Patrimônio / Código', 'Quantidade (Unid.)']],
          body,
          foot: [['', '', 'TOTAL:', String(total)]],
          styles: { fontSize: 10, cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.2 },
          headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center', lineColor: [0, 0, 0], lineWidth: 0.3 },
          footStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'right', lineColor: [0, 0, 0], lineWidth: 0.3 },
          columnStyles: {
            0: { cellWidth: 14, halign: 'center' },
            2: { cellWidth: 40, halign: 'center' },
            3: { cellWidth: 34, halign: 'center' },
          },
          margin: { left: margin, right: margin },
        });
        y = doc.lastAutoTable.finalY;
      }

      // Rodapé: "Data: __/__/____" à direita e assinatura de recebimento à esquerda.
      y += 18;
      doc.setFontSize(10);
      doc.text('Data: ____/____/______', pageW - margin, y, { align: 'right' });
      y += 14;
      doc.line(margin, y, margin + 110, y);
      y += 4;
      doc.text('ASSINATURA DE RECEBIMENTO', margin, y);

      doc.save(rm + '.pdf');
    },
  });
})();
