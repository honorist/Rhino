/* Rhino · Relatório Gerencial PDF
   Gera um relatório gerencial completo em PDF usando jsPDF + autoTable.
   Exposto como window.RhinoRelatorio.gerar()
*/

(function () {
  'use strict';

  // ── Paleta de cores ──────────────────────────────────────────
  const PRIMARY  = [85, 88, 139];
  const SUCCESS  = [16, 185, 129];
  const DANGER   = [220, 38, 38];
  const WARNING  = [245, 158, 11];
  const MUTED    = [107, 114, 128];
  const BG_LIGHT = [249, 250, 251];

  // ── Helper: cabeçalho de página ─────────────────────────────
  function _drawHeader(doc, titulo, n) {
    doc.setFillColor(...PRIMARY);
    doc.rect(0, 0, 210, 18, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Rhino — ' + titulo, 10, 12);
    doc.setFont('helvetica', 'normal');
    doc.text('Página ' + n, 200, 12, { align: 'right' });
    doc.setTextColor(0, 0, 0);
  }

  // ── Helper: rodapé geral ─────────────────────────────────────
  function _drawFooter(doc) {
    const hoje = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
    doc.setDrawColor(...MUTED);
    doc.setLineWidth(0.3);
    doc.line(10, 287, 200, 287);
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.setFont('helvetica', 'normal');
    doc.text('Gerado por Rhino · Confidencial · ' + hoje, 105, 292, { align: 'center' });
    doc.setTextColor(0, 0, 0);
  }

  // ── Helper: card KPI ─────────────────────────────────────────
  function _drawKpiCard(doc, x, y, w, h, label, value, valueColor) {
    doc.setFillColor(...BG_LIGHT);
    doc.setDrawColor(220, 220, 228);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, w, h, 3, 3, 'FD');

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text(label, x + w / 2, y + 10, { align: 'center' });

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...valueColor);
    doc.text(value, x + w / 2, y + 22, { align: 'center' });

    doc.setDrawColor(220, 220, 228);
    doc.setLineWidth(0.2);
    doc.line(x + 4, y + h - 2, x + w - 4, y + h - 2);

    doc.setTextColor(0, 0, 0);
  }

  // ── Cálculo: saldo do caixa ──────────────────────────────────
  function _calcSaldoCaixa(caixaEntries) {
    return (caixaEntries || []).reduce((s, e) => {
      const v = parseFloat(e.value) || 0;
      return s + (e.type === 'entrada' ? v : -v);
    }, 0);
  }

  // ── Cálculo: saídas agrupadas por contrato ───────────────────
  function _saidasByContract(saidas) {
    const map = {};
    (saidas || []).forEach(s => {
      const id = s.contractId || s.contract_id;
      if (!id) return;
      map[id] = (map[id] || 0) + (parseFloat(s.value) || 0);
    });
    return map;
  }

  // ── Cálculo: fluxo mensal (últimos 6 meses) ──────────────────
  function _calcFluxoMensal(caixaEntries) {
    const meses = [];
    const hoje = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      meses.push({
        ano: d.getFullYear(),
        mes: d.getMonth() + 1,
        label: d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
          .replace('.', '')
          .replace(' de ', ' '),
        entradas: 0,
        saidas: 0,
      });
    }

    (caixaEntries || []).forEach(e => {
      if (!e.date) return;
      const [ano, mes] = e.date.split('-').map(Number);
      const bucket = meses.find(m => m.ano === ano && m.mes === mes);
      if (!bucket) return;
      const v = parseFloat(e.value) || 0;
      if (e.type === 'entrada') bucket.entradas += v;
      else bucket.saidas += v;
    });

    return meses;
  }

  // ── Formatação BRL ───────────────────────────────────────────
  function _brl(v) {
    if (window.Store && typeof Store.formatBRL === 'function') return Store.formatBRL(v);
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  }

  // ── Página 1: Capa ───────────────────────────────────────────
  function _paginaCapa(doc) {
    doc.setFillColor(...PRIMARY);
    doc.rect(0, 0, 210, 297, 'F');

    // Logo placeholder — retângulo branco com "R"
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(85, 40, 40, 40, 5, 5, 'F');
    doc.setTextColor(...PRIMARY);
    doc.setFontSize(28);
    doc.setFont('helvetica', 'bold');
    doc.text('R', 105, 68, { align: 'center' });

    // Título
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(32);
    doc.setFont('helvetica', 'bold');
    doc.text('Rhino', 105, 110, { align: 'center' });

    doc.setFontSize(16);
    doc.setFont('helvetica', 'normal');
    doc.text('Relatório Gerencial', 105, 124, { align: 'center' });

    const hoje = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit', month: 'long', year: 'numeric'
    });
    doc.setFontSize(13);
    doc.text('Emitido em ' + hoje, 105, 145, { align: 'center' });

    // Rodapé da capa
    doc.setFontSize(11);
    doc.setTextColor(180, 180, 220);
    doc.text('Gestão Empresarial · Versão Confidencial', 105, 270, { align: 'center' });
  }

  // ── Página 2: Resumo Executivo ───────────────────────────────
  function _paginaResumo(doc, dados) {
    doc.addPage();
    _drawHeader(doc, 'Resumo Executivo', 2);

    const { saldoCaixa, contratosAtivos, totalContratado, margemMedia } = dados;

    // Subtítulo da seção
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...PRIMARY);
    doc.text('Indicadores Principais', 10, 30);
    doc.setTextColor(0, 0, 0);

    // 4 KPI cards em grid 2x2
    const cardW = 90;
    const cardH = 34;
    const col1 = 10, col2 = 110;
    const row1 = 38, row2 = 80;

    const margemColor = margemMedia > 20 ? SUCCESS : margemMedia > 0 ? WARNING : DANGER;
    const saldoColor  = saldoCaixa >= 0 ? SUCCESS : DANGER;

    _drawKpiCard(doc, col1, row1, cardW, cardH, 'Saldo em Caixa',       _brl(saldoCaixa),       saldoColor);
    _drawKpiCard(doc, col2, row1, cardW, cardH, 'Contratos Ativos',     String(contratosAtivos), PRIMARY);
    _drawKpiCard(doc, col1, row2, cardW, cardH, 'Total Contratado',     _brl(totalContratado),   PRIMARY);
    _drawKpiCard(doc, col2, row2, cardW, cardH, 'Margem Média',   margemMedia.toFixed(1) + '%', margemColor);

    _drawFooter(doc);
  }

  // ── Página 3+: Contratos Ativos ──────────────────────────────
  function _paginaContratos(doc, contracts, saidasMap, paginaInicial) {
    doc.addPage();
    _drawHeader(doc, 'Contratos em Andamento', paginaInicial);

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...PRIMARY);
    doc.text('Contratos em Andamento', 10, 30);
    doc.setTextColor(0, 0, 0);

    const ativos = contracts.filter(c => c.status === 'ativo');

    const body = ativos.map(c => {
      const saidas = saidasMap[c.id] || 0;
      const margem = c.value > 0
        ? ((c.value - saidas) / c.value * 100).toFixed(1) + '%'
        : '—';
      return [
        (c.name  || '').slice(0, 35),
        (c.client || '').slice(0, 25),
        _brl(c.value),
        _brl(saidas),
        margem,
        c.status || '—',
        c.endDate
          ? new Date(c.endDate + 'T12:00:00').toLocaleDateString('pt-BR')
          : '—',
      ];
    });

    doc.autoTable({
      head: [['Contrato', 'Cliente', 'Valor', 'Medido', 'Margem', 'Status', 'Término']],
      body: body.length > 0 ? body : [['Nenhum contrato ativo', '', '', '', '', '', '']],
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: PRIMARY, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: BG_LIGHT },
      columnStyles: {
        0: { cellWidth: 50 },
        1: { cellWidth: 38 },
        2: { cellWidth: 24, halign: 'right' },
        3: { cellWidth: 24, halign: 'right' },
        4: { cellWidth: 18, halign: 'right' },
        5: { cellWidth: 18 },
        6: { cellWidth: 22 },
      },
      startY: 38,
      margin: { left: 10, right: 10 },
      didParseCell(data) {
        if (data.section === 'body' && data.column.index === 4) {
          const raw = (data.cell.raw || '').toString().replace('%', '');
          const v = parseFloat(raw);
          if (!isNaN(v)) {
            data.cell.styles.textColor = v < 0 ? DANGER : v < 10 ? WARNING : SUCCESS;
          }
        }
      },
      didDrawPage(data) {
        _drawHeader(doc, 'Contratos em Andamento', paginaInicial + data.pageNumber - 1);
      },
    });
  }

  // ── Página: Fluxo de Caixa ───────────────────────────────────
  function _paginaFluxo(doc, fluxo, paginaNum) {
    doc.addPage();
    _drawHeader(doc, 'Fluxo de Caixa', paginaNum);

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...PRIMARY);
    doc.text('Fluxo de Caixa — Últimos 6 Meses', 10, 30);
    doc.setTextColor(0, 0, 0);

    const totEntradas = fluxo.reduce((s, m) => s + m.entradas, 0);
    const totSaidas   = fluxo.reduce((s, m) => s + m.saidas,   0);
    const totSaldo    = totEntradas - totSaidas;

    const body = fluxo.map(m => [
      m.label,
      _brl(m.entradas),
      _brl(m.saidas),
      _brl(m.entradas - m.saidas),
    ]);

    doc.autoTable({
      head: [['Mês', 'Entradas', 'Saídas', 'Saldo']],
      body,
      foot: [['Total', _brl(totEntradas), _brl(totSaidas), _brl(totSaldo)]],
      styles: { fontSize: 10, cellPadding: 4 },
      headStyles: { fillColor: PRIMARY, textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: PRIMARY, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: BG_LIGHT },
      columnStyles: {
        0: { cellWidth: 40 },
        1: { cellWidth: 50, halign: 'right' },
        2: { cellWidth: 50, halign: 'right' },
        3: { cellWidth: 50, halign: 'right' },
      },
      startY: 38,
      margin: { left: 10, right: 10 },
      didParseCell(data) {
        if (data.section === 'body' && data.column.index === 3) {
          const raw = (data.cell.raw || '').toString().replace(/[R$\s.]/g, '').replace(',', '.');
          const v = parseFloat(raw);
          if (!isNaN(v)) {
            data.cell.styles.textColor = v < 0 ? DANGER : SUCCESS;
          }
        }
      },
      didDrawPage(data) {
        _drawHeader(doc, 'Fluxo de Caixa', paginaNum + data.pageNumber - 1);
      },
    });

    _drawFooter(doc);
  }

  // ── Página: Contas a Receber e a Pagar ───────────────────────
  function _paginaContasResumo(doc, nfsList, cpList, paginaNum) {
    doc.addPage();
    _drawHeader(doc, 'Contas a Receber e a Pagar', paginaNum);

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...PRIMARY);
    doc.text('Resumo Financeiro', 10, 30);
    doc.setTextColor(0, 0, 0);

    const hojeStr = new Date().toISOString().split('T')[0];
    const em30str = (() => {
      const d = new Date();
      d.setDate(d.getDate() + 30);
      return d.toISOString().split('T')[0];
    })();

    // A Receber
    const nfsPendentes = (nfsList || []).filter(n => !n.emitida && n.status !== 'emitida');
    const nfsVencidas  = nfsPendentes.filter(n => n.dataLimite && n.dataLimite < hojeStr);
    const totalAReceber = nfsPendentes.reduce((s, n) => s + (parseFloat(n.valor || n.totalLiquido || n.valorTotal) || 0), 0);

    // A Pagar
    const cpPendentes = (cpList || []).filter(c => c.status === 'pendente' || c.status === 'aberto');
    const cpVencidas  = cpPendentes.filter(c => {
      const v = c.dataVencimento || c.data_vencimento;
      return v && v < hojeStr;
    });
    const cp30d = cpPendentes.filter(c => {
      const v = c.dataVencimento || c.data_vencimento;
      return v && v <= em30str;
    });
    const totalAPagar = cpPendentes.reduce((s, c) => s + (parseFloat(c.valor) || 0), 0);

    // Box A Receber (esquerda)
    const boxY = 38, boxH = 55;
    doc.setFillColor(...BG_LIGHT);
    doc.setDrawColor(220, 220, 228);
    doc.setLineWidth(0.3);
    doc.roundedRect(10, boxY, 90, boxH, 3, 3, 'FD');

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...PRIMARY);
    doc.text('A Receber (NFs)', 55, boxY + 10, { align: 'center' });

    doc.setFontSize(16);
    doc.setTextColor(...(totalAReceber > 0 ? SUCCESS : MUTED));
    doc.text(_brl(totalAReceber), 55, boxY + 23, { align: 'center' });

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text(nfsPendentes.length + ' nota(s) pendente(s)', 55, boxY + 33, { align: 'center' });
    doc.text(nfsVencidas.length + ' vencida(s)', 55, boxY + 41, { align: 'center' });

    // Box A Pagar (direita)
    doc.setFillColor(...BG_LIGHT);
    doc.setDrawColor(220, 220, 228);
    doc.roundedRect(110, boxY, 90, boxH, 3, 3, 'FD');

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...PRIMARY);
    doc.text('A Pagar (Contas)', 155, boxY + 10, { align: 'center' });

    doc.setFontSize(16);
    doc.setTextColor(...(totalAPagar > 0 ? DANGER : MUTED));
    doc.text(_brl(totalAPagar), 155, boxY + 23, { align: 'center' });

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text(cpPendentes.length + ' conta(s) pendente(s)', 155, boxY + 33, { align: 'center' });
    doc.text(cp30d.length + ' vencem nos próx. 30d', 155, boxY + 41, { align: 'center' });
    doc.text(cpVencidas.length + ' vencida(s)', 155, boxY + 49, { align: 'center' });

    doc.setTextColor(0, 0, 0);

    // Tabela NFs pendentes
    if (nfsPendentes.length > 0) {
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...PRIMARY);
      doc.text('Notas Fiscais Pendentes', 10, boxY + boxH + 16);
      doc.setTextColor(0, 0, 0);

      const nfBody = nfsPendentes.slice(0, 15).map(n => {
        const venc = n.dataLimite
          ? new Date(n.dataLimite + 'T12:00:00').toLocaleDateString('pt-BR')
          : '—';
        const status = n.dataLimite && n.dataLimite < hojeStr ? 'Vencida' : 'Pendente';
        return [
          (n.numero || '—').toString().slice(0, 20),
          (n.contratoNome || n.contrato_nome || '—').slice(0, 30),
          venc,
          _brl(parseFloat(n.valor || n.totalLiquido || n.valorTotal) || 0),
          status,
        ];
      });

      doc.autoTable({
        head: [['Número', 'Contrato', 'Vencimento', 'Valor', 'Status']],
        body: nfBody,
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: PRIMARY, textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: BG_LIGHT },
        columnStyles: {
          0: { cellWidth: 30 },
          1: { cellWidth: 65 },
          2: { cellWidth: 28, halign: 'center' },
          3: { cellWidth: 38, halign: 'right' },
          4: { cellWidth: 25, halign: 'center' },
        },
        startY: boxY + boxH + 22,
        margin: { left: 10, right: 10 },
        didParseCell(data) {
          if (data.section === 'body' && data.column.index === 4) {
            if ((data.cell.raw || '') === 'Vencida') {
              data.cell.styles.textColor = DANGER;
              data.cell.styles.fontStyle = 'bold';
            }
          }
        },
        didDrawPage(data) {
          _drawHeader(doc, 'Contas a Receber e a Pagar', paginaNum + data.pageNumber - 1);
        },
      });
    }

    _drawFooter(doc);
  }

  // ── API pública ──────────────────────────────────────────────
  window.RhinoRelatorio = {
    async gerar() {
      window.showToast('Gerando relatório…', 'info');
      try {
        await RhinoLazy.ensure(['jspdf', 'jspdf-autotable']);
        await Store.loadAll();

        // Carrega NFs e contas a pagar via fetch (igual ao Dashboard)
        let nfsList = [], cpList = [];
        try {
          const [nfR, cpR] = await Promise.all([
            fetch('/api/notas-fiscais').then(r => r.ok ? r.json() : { notasFiscais: [] }).catch(() => ({ notasFiscais: [] })),
            fetch('/api/contas-pagar').then(r => r.ok ? r.json() : { contasPagar: [] }).catch(() => ({ contasPagar: [] })),
          ]);
          nfsList = nfR.notasFiscais || nfR.notas_fiscais || [];
          cpList  = cpR.contasPagar  || cpR.contas        || [];
        } catch (_) {}

        const { jsPDF } = window.jspdf;
        // autotable UMD procura window.jsPDF — garante que esteja exposto
        if (!window.jsPDF) window.jsPDF = jsPDF;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        const contracts   = Store.state.contracts  || [];
        const saidas      = Store.state.saidas      || [];
        const caixaRaw    = Store.state.caixa;
        const caixaEntries = Array.isArray(caixaRaw)
          ? caixaRaw
          : (caixaRaw?.entries || []);

        const saidasMap      = _saidasByContract(saidas);
        const saldoCaixa     = _calcSaldoCaixa(caixaEntries);
        const ativos         = contracts.filter(c => c.status === 'ativo');
        const contratosAtivos = ativos.length;
        const totalContratado = ativos.reduce((s, c) => s + (parseFloat(c.value) || 0), 0);

        // Margem média: só contratos com valor > 0
        const margens = ativos
          .filter(c => c.value > 0)
          .map(c => {
            const s = saidasMap[c.id] || 0;
            return (c.value - s) / c.value * 100;
          });
        const margemMedia = margens.length > 0
          ? margens.reduce((a, b) => a + b, 0) / margens.length
          : 0;

        const fluxo = _calcFluxoMensal(caixaEntries);

        // Página 1: Capa
        _paginaCapa(doc);

        // Página 2: Resumo Executivo
        _paginaResumo(doc, {
          saldoCaixa,
          contratosAtivos,
          totalContratado,
          margemMedia,
        });

        // Página 3+: Contratos Ativos
        _paginaContratos(doc, contracts, saidasMap, 3);

        // Próxima página após autoTable de contratos
        _paginaFluxo(doc, fluxo, doc.internal.getCurrentPageInfo().pageNumber + 1);

        // Página final: Contas a Receber e a Pagar
        _paginaContasResumo(doc, nfsList, cpList, doc.internal.getCurrentPageInfo().pageNumber + 1);

        const nomeArquivo = 'relatorio-rhino-' + new Date().toISOString().slice(0, 10) + '.pdf';
        doc.save(nomeArquivo);
        window.showToast('Relatório gerado com sucesso!', 'success');

      } catch (e) {
        console.error('[RhinoRelatorio]', e);
        window.showToast('Erro ao gerar relatório: ' + e.message, 'error');
      }
    },
  };
})();
