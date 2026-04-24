// Geração do Boletim de Medição (BM) a partir do modelo Excel da CMPC.
// Abre o modelo, preenche apenas as células de dados e adiciona a logo
// da Rhino (contratada) no cabeçalho. Preserva toda a formatação original.

window.BM = {
  async gerar({ contract, saida, nf, nfsAnteriores, nfsContrato }) {
    if (typeof ExcelJS === 'undefined') {
      alert('Biblioteca ExcelJS não carregada. Recarregue a página.');
      return;
    }

    // Carrega o modelo
    const respModelo = await fetch('assets/modelos/modelo_bm.xlsm');
    if (!respModelo.ok) {
      alert('Modelo de BM não encontrado em assets/modelos/modelo_bm.xlsm');
      return;
    }
    const bufferModelo = await respModelo.arrayBuffer();

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bufferModelo);
    const ws = wb.worksheets[0];

    // Valores calculados
    const valor = parseFloat(saida.value) || 0;
    const valorAnterior = (nfsAnteriores || []).reduce((s, n) => s + (parseFloat(n.valor) || 0), 0);
    const valorAcumulado = valorAnterior + valor;
    const saldo = Math.max(0, (contract.value || 0) - valorAcumulado);
    const pctAnterior = contract.value > 0 ? valorAnterior / contract.value : 0;
    const pctMes      = contract.value > 0 ? valor / contract.value : 0;
    const pctTotal    = contract.value > 0 ? valorAcumulado / contract.value : 0;

    const osNum = contract.contractNumber || contract.id.slice(-6).toUpperCase();
    const descServico = saida.description || 'Serviço executado';

    // Helper — preenche preservando o estilo (apenas muda value)
    const set = (addr, val) => {
      const cell = ws.getCell(addr);
      cell.value = val;
    };

    // B4 — OS_XXXX - NOME DA OS
    set('B4', `OS_${osNum} — ${(contract.name || '').toUpperCase()}`);

    // B5 — Descrição do serviço (substitui "DESCRIÇÃO DO SERVIÇO" do template)
    set('B5', descServico);

    // Linha 9 — primeiro item da QQP (Descrição em D, Valor Unit em H, Qtd em I, Total em J)
    set('B9', '1.1');
    set('D9', descServico);
    set('G9', 'un');
    set('H9', valor);
    set('I9', 1);
    set('J9', valor);

    // Linha 12 — Subtotal
    set('I12', 1);
    set('J12', valor);

    // Linha 13 — Total contratado na OS
    set('J13', valor);

    // Linha 14 — Valor Cobrado Nesta Medição (coluna E conforme modelo)
    set('E14', valor);

    // Dados Contratuais
    set('E18', contract.value || 0);  // VALOR CONTRATUAL
    set('E19', valorAcumulado);        // VALOR ACUMULADO
    set('E20', saldo);                  // SALDO CONTRATUAL

    // Avanços (formato percentual — ExcelJS respeita o number format da célula original)
    set('I18', pctAnterior);
    set('I19', pctMes);
    set('I20', pctTotal);

    // ═══ Logo da Rhino no cabeçalho ═══
    try {
      const respLogo = await fetch('assets/logo.png');
      if (respLogo.ok) {
        const bufferLogo = await respLogo.arrayBuffer();
        const imageId = wb.addImage({ buffer: bufferLogo, extension: 'png' });
        // Posição: canto superior direito (colunas Q-S, linhas 1-3)
        ws.addImage(imageId, {
          tl: { col: 16, row: 0 },   // top-left: coluna Q, linha 1
          br: { col: 18.5, row: 2.8 }, // bottom-right: antes da coluna S, linha 3
          editAs: 'oneCell'
        });
      }
    } catch (e) {
      console.warn('Logo da Rhino não carregada:', e);
    }

    // ═══ Gera e baixa ═══
    const numBm = saida.numeroBm || nf?.numero || 'BM-001';
    const nomeSafe = (contract.name || 'contrato').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40);
    const dataStr = (saida.date || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
    const filename = `${numBm}_${nomeSafe}_${dataStr}.xlsx`;

    const outBuf = await wb.xlsx.writeBuffer();
    const blob = new Blob([outBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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

      await this.gerar({ contract, saida, nf, nfsAnteriores, nfsContrato });
    } catch (e) {
      console.error(e);
      alert('Erro ao gerar BM: ' + e.message);
    }
  }
};
