// Geração de Boletim de Medição (BM) usando o modelo .xlsm da CMPC
// Preenche as células do modelo e gera download em .xlsx

window.BM = {
  /**
   * Gera o BM para uma saída específica.
   * @param {Object} params
   * @param {Object} params.contract  - contrato do sistema
   * @param {Object} params.saida     - saída (com nfId)
   * @param {Object} params.nf        - nota fiscal correspondente (BM)
   * @param {Array}  params.nfsAnteriores - NFs emitidas antes desta (para cálculo do acumulado)
   */
  async gerar({ contract, saida, nf, nfsAnteriores }) {
    if (typeof XLSX === 'undefined') {
      alert('Biblioteca de planilha não carregada. Recarregue a página.');
      return;
    }

    // Carrega o modelo
    const resp = await fetch('assets/modelos/modelo_bm.xlsm');
    if (!resp.ok) {
      alert('Não foi possível carregar o modelo de BM.');
      return;
    }
    const ab = await resp.arrayBuffer();
    const wb = XLSX.read(ab, { type: 'array', cellStyles: true, bookVBA: true });
    const ws = wb.Sheets[wb.SheetNames[0]];

    const valor = parseFloat(saida.value) || 0;
    const valorAcumulado = (nfsAnteriores || []).reduce((s, n) => s + (parseFloat(n.valor) || 0), 0) + valor;
    const saldo = Math.max(0, (contract.value || 0) - valorAcumulado);
    const pctAnterior = contract.value > 0 ? ((valorAcumulado - valor) / contract.value) * 100 : 0;
    const pctMes      = contract.value > 0 ? (valor / contract.value) * 100 : 0;
    const pctTotal    = contract.value > 0 ? (valorAcumulado / contract.value) * 100 : 0;

    // Helper: setar valor preservando o estilo existente
    const setCell = (ref, value, opts = {}) => {
      const cell = ws[ref] || {};
      ws[ref] = { ...cell, v: value, t: opts.type || (typeof value === 'number' ? 'n' : 's') };
      if (opts.fmt) ws[ref].z = opts.fmt;
    };

    // Cabeçalho: OS_XXXX - NOME DA OS
    const osNum = contract.contractNumber || contract.id.slice(-6).toUpperCase();
    setCell('B4', `OS_${osNum} - ${(contract.name || '').toUpperCase()}`);

    // Item único: descrição do serviço
    setCell('B9',  '1.1');
    setCell('D9',  saida.description || 'Serviço executado');
    setCell('G9',  'un');            // unidade
    setCell('H9',  valor, { type: 'n', fmt: '"R$ "#,##0.00' });  // valor unitário
    setCell('I9',  1, { type: 'n' });  // quantitativo
    setCell('J9',  valor, { type: 'n', fmt: '"R$ "#,##0.00' });  // valor contratado

    // Subtotal
    setCell('I12', 1, { type: 'n' });
    setCell('J12', valor, { type: 'n', fmt: '"R$ "#,##0.00' });

    // Total Contratado na OS (linha 13)
    setCell('J13', valor, { type: 'n', fmt: '"R$ "#,##0.00' });

    // Valor Cobrado Nesta Medição (linha 14, coluna E)
    setCell('E14', valor, { type: 'n', fmt: '"R$ "#,##0.00' });

    // Dados contratuais
    setCell('E18', contract.value || 0, { type: 'n', fmt: '"R$ "#,##0.00' });
    setCell('E19', valorAcumulado,      { type: 'n', fmt: '"R$ "#,##0.00' });
    setCell('E20', saldo,               { type: 'n', fmt: '"R$ "#,##0.00' });

    // Avanços %
    setCell('I18', pctAnterior / 100, { type: 'n', fmt: '0.00%' });
    setCell('I19', pctMes / 100,      { type: 'n', fmt: '0.00%' });
    setCell('I20', pctTotal / 100,    { type: 'n', fmt: '0.00%' });

    // Descrição do serviço no cabeçalho — linha 5 coluna B
    if (saida.description) {
      setCell('B5', saida.description);
    }

    // Nome do arquivo: BM-NNN - nome do contrato - data
    const numeroBm = saida.numeroBm || nf?.numero || 'BM';
    const nomeSafe = (contract.name || 'contrato').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40);
    const dataStr = (saida.date || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
    const filename = `${numeroBm}_${nomeSafe}_${dataStr}.xlsx`;

    XLSX.writeFile(wb, filename, { bookType: 'xlsx' });
  },

  /** Gera BM a partir de um ID de saída (busca dados no Store) */
  async gerarPorSaida(saidaId) {
    try {
      const saida = (Store.state.saidas || []).find(s => s.id === saidaId);
      if (!saida) { alert('Saída não encontrada.'); return; }
      const contract = (Store.state.contracts || []).find(c => c.id === saida.contractId);
      if (!contract) { alert('Contrato não encontrado.'); return; }
      const nf = (Store.state.notas_fiscais || []).find(n => n.id === saida.nfId);

      // NFs anteriores do MESMO contrato (para calcular acumulado)
      const nfsAnteriores = (Store.state.notas_fiscais || [])
        .filter(n => n.contractId === saida.contractId && n.id !== saida.nfId)
        .filter(n => new Date(n.dataLimite) <= new Date(saida.date));

      await this.gerar({ contract, saida, nf, nfsAnteriores });
    } catch (e) {
      console.error(e);
      alert('Erro ao gerar BM: ' + e.message);
    }
  }
};
