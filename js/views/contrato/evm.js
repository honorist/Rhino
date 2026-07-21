/* Rhino · ContratoDetail · EVM — Curva S / Valor Agregado por obra (item 2)
   Estende window.ContratoDetail. Consome GET /api/contracts/:id/evm — a conta
   (BAC/PV/EV/AC, SPI/CPI, EAC/ETC/VAC) mora no servidor (lib/evm.js), fonte
   única; aqui é só apresentação. */
(function () {
  if (!window.ContratoDetail) { console.error('[contrato/evm] requires ContratoDetail core'); return; }

  // Índices (SPI/CPI) com 2 casas, em pt-BR.
  const _idx2 = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // Verde ≥ 1 (bom), vermelho < 1 (atenção).
  const _corIdx = (v) => (Number(v) >= 1 ? 'var(--color-success)' : 'var(--color-danger)');

  Object.assign(window.ContratoDetail, {

    // Data de referência corrente (YYYY-MM-DD); null = servidor usa "hoje".
    _evmDataRef: null,

    renderEvmSection(contract) {
      return `
        <div class="card mb-2xl">
          <div class="card-header">
            <div>
              <h3 class="card-title"><span style="display:inline-flex;align-items:center;gap:8px;">${window.rhIcon('trending-up', 18)}Curva S / Valor Agregado (EVM)</span></h3>
              <span class="text-muted font-sm">Planejado × executado × custo real — SPI, CPI e projeção de custo (EAC) numa data de referência</span>
            </div>
          </div>
          <div id="evmConteudo" style="padding:var(--sp-md);">
            <div class="text-muted" style="text-align:center;padding:var(--sp-lg);">Calculando EVM...</div>
          </div>
        </div>
      `;
    },

    async _loadEvm(contract) {
      const box = document.getElementById('evmConteudo');
      if (!box) return;
      try {
        const qs = this._evmDataRef ? `?data=${encodeURIComponent(this._evmDataRef)}` : '';
        const r = await fetch(`/api/contracts/${contract.id}/evm${qs}`);
        if (!r.ok) throw new Error(await r.text());
        const { evm } = await r.json();
        box.innerHTML = this._renderEvm(evm || {});
        this._attachEvmListeners(contract);
      } catch (e) {
        box.innerHTML = `<p class="text-danger">Erro ao calcular EVM: ${escapeHtml(e.message)}</p>`;
      }
    },

    _renderEvm(evm) {
      const fmt = (v) => Store.formatBRL(v);
      const spi = Number(evm.spi || 0);
      const cpi = Number(evm.cpi || 0);
      const dataRef = evm.dataRef || '';
      this._evmDataRef = dataRef || this._evmDataRef;

      const porAtividade = Array.isArray(evm.porAtividade) ? evm.porAtividade : [];

      // Seletor de data de referência (reprocessa a curva no servidor).
      const controls = `
        <div style="display:flex;justify-content:flex-end;align-items:center;gap:8px;margin-bottom:var(--sp-md);flex-wrap:wrap;">
          <label class="text-muted font-sm" for="evmDataRef">Data de referência</label>
          <input class="form-control" type="date" id="evmDataRef" value="${escapeHtml(dataRef)}" style="max-width:180px;">
        </div>
      `;

      // Índices de desempenho em destaque (SPI = prazo, CPI = custo).
      const idxCards = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:16px;">
          <div class="card" style="padding:var(--sp-md);border-left:4px solid ${_corIdx(spi)};">
            <div class="text-muted font-sm" title="Schedule Performance Index — EV ÷ PV. ≥1 adiantado, <1 atrasado.">SPI — desempenho de prazo</div>
            <div style="font-weight:800;font-size:1.6em;color:${_corIdx(spi)};">${_idx2(spi)}</div>
            <div class="text-muted font-sm">${spi >= 1 ? 'no prazo / adiantado' : 'atrasado'}</div>
          </div>
          <div class="card" style="padding:var(--sp-md);border-left:4px solid ${_corIdx(cpi)};">
            <div class="text-muted font-sm" title="Cost Performance Index — EV ÷ AC. ≥1 dentro do custo, <1 estourado.">CPI — desempenho de custo</div>
            <div style="font-weight:800;font-size:1.6em;color:${_corIdx(cpi)};">${_idx2(cpi)}</div>
            <div class="text-muted font-sm">${cpi >= 1 ? 'dentro do custo' : 'acima do custo'}</div>
          </div>
        </div>
      `;

      // Valores base e variações.
      const svCor = Number(evm.sv) < 0 ? 'var(--color-danger)' : 'var(--color-success)';
      const cvCor = Number(evm.cv) < 0 ? 'var(--color-danger)' : 'var(--color-success)';
      const vacCor = Number(evm.vac) < 0 ? 'var(--color-danger)' : 'var(--color-success)';

      const baseCards = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:12px;">
          ${this._evmKpi('PV — valor planejado', fmt(evm.pv), 'Quanto do orçamento deveria estar concluído nesta data (planejado, curva linear).')}
          ${this._evmKpi('EV — valor agregado', fmt(evm.ev), 'Orçamento "ganho" pelo avanço físico real (% executado das etapas).')}
          ${this._evmKpi('AC — custo real', fmt(evm.ac), 'Custo realizado da obra (base caixa, a mesma conta do DRE).')}
          ${this._evmKpi('SV — variação de prazo', fmt(evm.sv), 'EV − PV. Positivo = adiantado; negativo = atrasado.', svCor)}
          ${this._evmKpi('CV — variação de custo', fmt(evm.cv), 'EV − AC. Positivo = economia; negativo = estouro.', cvCor)}
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px;">
          ${this._evmKpi('BAC — orçamento total', fmt(evm.bac), 'Budget At Completion — Σ do custo planejado das etapas.')}
          ${this._evmKpi('EAC — custo projetado', fmt(evm.eac), 'Estimate At Completion — projeção do custo final mantendo o CPI atual.')}
          ${this._evmKpi('ETC — falta gastar', fmt(evm.etc), 'Estimate To Complete — EAC − AC.')}
          ${this._evmKpi('VAC — folga projetada', fmt(evm.vac), 'BAC − EAC. Negativo = estouro projetado no fim da obra.', vacCor)}
        </div>
      `;

      const linhas = porAtividade.map((a) => {
        const exec = Number(a.execPct || 0);
        return `
          <tr>
            <td>${escapeHtml(a.nome || '—')}</td>
            <td style="text-align:right;">${fmt(a.custoPlan)}</td>
            <td style="text-align:right;">${exec.toFixed(0)}%</td>
            <td style="text-align:right;">${fmt(a.pv)}</td>
            <td style="text-align:right;font-weight:600;">${fmt(a.ev)}</td>
          </tr>
        `;
      }).join('');

      const tabela = porAtividade.length === 0
        ? `<div style="text-align:center;padding:var(--sp-xl);color:var(--color-text-muted);">
             <div style="font-size:44px;margin-bottom:8px;opacity:.6;">📈</div>
             <div style="font-weight:600;font-size:16px;margin-bottom:4px;">Sem etapas no cronograma</div>
             <div style="font-size:13px;">Cadastre etapas com custo planejado e datas no Cronograma para ver a Curva S / EVM.</div>
           </div>`
        : `<div class="table-wrap">
            <table>
              <thead><tr>
                <th scope="col">Etapa</th>
                <th scope="col" style="text-align:right;">Custo plan.</th>
                <th scope="col" style="text-align:right;">% Real</th>
                <th scope="col" style="text-align:right;" title="Planned Value — orçamento planejado até a data">PV</th>
                <th scope="col" style="text-align:right;" title="Earned Value — orçamento ganho pelo avanço real">EV</th>
              </tr></thead>
              <tbody>${linhas}</tbody>
            </table>
          </div>`;

      return `${controls}${idxCards}${baseCards}${tabela}`;
    },

    _evmKpi(label, value, hint, cor) {
      return `
        <div class="card" style="padding:var(--sp-md);">
          <div class="text-muted font-sm" title="${escapeHtml(hint || '')}">${escapeHtml(label)}</div>
          <div style="font-weight:700;font-size:1.15em;margin-top:2px;${cor ? `color:${cor};` : ''}">${value}</div>
        </div>
      `;
    },

    _attachEvmListeners(contract) {
      const inp = document.getElementById('evmDataRef');
      if (!inp) return;
      inp.addEventListener('change', () => {
        this._evmDataRef = inp.value || null;
        const box = document.getElementById('evmConteudo');
        if (box) box.innerHTML = `<div class="text-muted" style="text-align:center;padding:var(--sp-lg);">Calculando EVM...</div>`;
        this._loadEvm(contract);
      });
    },

  });
})();
