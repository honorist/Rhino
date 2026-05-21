/**
 * @file Folha de Pagamento — controle mensal de pagamento dos colaboradores.
 *
 * Grade por competência: cada colaborador tem vale (40%, se elegível) e saldo.
 * Pagar/estornar reaproveita a contabilidade existente (Caixa, despesa do
 * contrato, módulo BASE). Tudo rastreável via vínculos + audit_log.
 */
window.FolhaPagamento = {
  competencia: new Date().toISOString().slice(0, 7),

  async render() {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading-spinner">Carregando...</div>';
    try {
      await Store.loadFor(['contracts_lite']);
      await Store.loadFolha(this.competencia);
      this._renderLista();
    } catch (e) {
      console.error('[FolhaPagamento]', e);
      app.innerHTML = '<div class="card"><p class="text-danger">Erro ao carregar a folha. Tente novamente.</p></div>';
    }
  },

  _nomeLocal(row) {
    if (!row.contractId) return 'Sede (BASE)';
    const c = (Store.state.contracts || []).find(x => x.id === row.contractId);
    return c ? (c.name || c.contractNumber || 'Contrato') : 'Contrato';
  },

  _badge(pago) {
    return pago
      ? '<span class="badge" style="background:#D1FAE5;color:#065F46;">Pago</span>'
      : '<span class="badge" style="background:#FEF3C7;color:#92400E;">Pendente</span>';
  },

  _renderLista() {
    const app = document.getElementById('app');
    const folha = Store.state.folha || [];
    const fmt = (v) => Store.formatBRL(parseFloat(v) || 0);
    const esc = window.escapeHtml;

    let totVale = 0, totValePago = 0, totSaldo = 0, totSaldoPago = 0, totProv = 0, totDesc = 0;
    folha.forEach(f => {
      totVale += parseFloat(f.valorVale) || 0;
      totSaldo += parseFloat(f.valorSaldo) || 0;
      if (f.valePago) totValePago += parseFloat(f.valorVale) || 0;
      if (f.saldoPago) totSaldoPago += parseFloat(f.valorSaldo) || 0;
      (f.itens || []).forEach(it => {
        const v = parseFloat(it.valor) || 0;
        if (it.tipo === 'provento') totProv += v;
        else if (it.tipo === 'desconto') totDesc += v;
      });
    });
    const totalGeral = totVale + totSaldo;
    const totalPago = totValePago + totSaldoPago;

    const rows = folha.map(f => {
      const elegivel = !!f.elegivelVale && (parseFloat(f.valorVale) || 0) > 0;
      const acao = (parcela, pago) => pago
        ? `<a class="action-link danger js-estornar" data-id="${f.id}" data-parcela="${parcela}">Estornar</a>`
        : `<a class="action-link js-pagar" data-id="${f.id}" data-parcela="${parcela}">Pagar</a>`;
      const valeCell = elegivel
        ? `${fmt(f.valorVale)} &nbsp;${this._badge(f.valePago)} &nbsp;${acao('vale', f.valePago)}`
        : '<span class="text-muted">—</span>';
      const saldoCell = `${fmt(f.valorSaldo)} &nbsp;${this._badge(f.saldoPago)} &nbsp;${acao('saldo', f.saldoPago)}`;
      const itens = f.itens || [];
      let prov = 0, desc = 0;
      itens.forEach(it => {
        const v = parseFloat(it.valor) || 0;
        if (it.tipo === 'provento') prov += v;
        else if (it.tipo === 'desconto') desc += v;
      });
      const provCell = prov > 0
        ? `<span style="color:#065F46;">+${fmt(prov)}</span>`
        : '<span class="text-muted">—</span>';
      const descCell = desc > 0
        ? `<span style="color:#991B1B;">−${fmt(desc)}</span>`
        : '<span class="text-muted">—</span>';
      const liquido = (parseFloat(f.valorVale) || 0) + (parseFloat(f.valorSaldo) || 0);
      const liquidoCell = `<strong${liquido < 0 ? ' style="color:#991B1B;"' : ''}>${fmt(liquido)}</strong>`;
      const lancCell = `<a class="action-link js-acertos" data-id="${f.id}">Lançamentos${itens.length ? ` (${itens.length})` : ''}</a>`;
      return `<tr class="row-folha" data-id="${f.recursoId}" style="cursor:pointer;" title="Ver dados do colaborador">
        <td><strong>${esc(f.recursoNome) || '—'}</strong></td>
        <td>${esc(this._nomeLocal(f))}</td>
        <td>${fmt(f.salarioBase)}</td>
        <td>${valeCell}</td>
        <td>${provCell}</td>
        <td>${descCell}</td>
        <td>${saldoCell}</td>
        <td>${liquidoCell}</td>
        <td>${lancCell}</td>
      </tr>`;
    }).join('');

    app.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Folha de Pagamento</h1>
          <p class="page-subtitle">${folha.length} colaborador${folha.length !== 1 ? 'es' : ''} ·
            Total ${fmt(totalGeral)} · Pago ${fmt(totalPago)} · Pendente ${fmt(totalGeral - totalPago)}${
            (totProv || totDesc) ? ` · Proventos ${fmt(totProv)} · Descontos ${fmt(totDesc)}` : ''}</p>
        </div>
        <div style="display:flex;gap:var(--sp-sm);align-items:center;">
          <input type="month" class="form-control" id="fpCompetencia" value="${this.competencia}" style="width:170px;">
          ${folha.length > 0 ? '<button class="btn btn-ghost" id="fpLimpar">Limpar folha</button>' : ''}
          <button class="btn btn-primary btn-lg" id="fpGerar">Gerar folha do mês</button>
        </div>
      </div>

      <div class="card">
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Colaborador</th><th>Local de custo</th><th>Salário</th>
              <th>Vale (40%)</th><th>Proventos</th><th>Descontos</th>
              <th>A pagar (5º dia útil)</th><th>Líquido</th><th>Lançamentos</th>
            </tr></thead>
            <tbody>
              ${folha.length === 0
                ? `<tr><td colspan="9" class="text-center text-muted" style="padding:var(--sp-xl);">
                     Folha de ${this.competencia} ainda não gerada — clique em "Gerar folha do mês".
                   </td></tr>`
                : rows}
            </tbody>
          </table>
        </div>
      </div>`;

    document.getElementById('fpCompetencia').addEventListener('change', async (e) => {
      this.competencia = e.target.value || this.competencia;
      try {
        await Store.loadFolha(this.competencia);
      } catch (err) { window.showToast('Erro ao carregar: ' + err.message, 'error'); }
      this._renderLista();
    });
    document.getElementById('fpGerar').addEventListener('click', () => this._gerar());
    const btnLimpar = document.getElementById('fpLimpar');
    if (btnLimpar) btnLimpar.addEventListener('click', () => this._limpar());
    app.querySelectorAll('.js-pagar').forEach(b =>
      b.addEventListener('click', () => this._pagar(b.dataset.id, b.dataset.parcela)));
    app.querySelectorAll('.js-estornar').forEach(b =>
      b.addEventListener('click', () => this._estornar(b.dataset.id, b.dataset.parcela)));
    app.querySelectorAll('.js-acertos').forEach(b =>
      b.addEventListener('click', () => this._acertos(b.dataset.id)));

    // Click na linha → abre o detalhe do colaborador (mesmo modal da aba Recursos).
    app.querySelectorAll('.row-folha').forEach(tr => {
      tr.addEventListener('click', async (e) => {
        if (e.target.closest('.action-link')) return; // não dispara ao clicar em Pagar/Estornar
        const id = tr.dataset.id;
        if (!id) return;
        try {
          // ContratoDetail é lazy — carrega antes de chamar showDetalheColaborador.
          if (typeof _loadLazyForPattern === 'function') {
            await _loadLazyForPattern('#/contratos/:id');
          }
        } catch (err) {
          console.error('[FolhaPagamento] falha ao carregar ContratoDetail:', err);
          if (window.showToast) window.showToast('Não foi possível abrir o detalhe.', 'error');
          return;
        }
        if (window.ContratoDetail?.showDetalheColaborador) {
          window.ContratoDetail.showDetalheColaborador(id);
        }
      });
    });
  },

  async _gerar() {
    try {
      const r = await Store.gerarFolha(this.competencia);
      window.showToast(`Folha de ${this.competencia} gerada — ${r.criadas} novo(s) registro(s)`, 'success');
      this._renderLista();
    } catch (e) { window.showToast('Erro ao gerar folha: ' + e.message, 'error'); }
  },

  async _limpar() {
    if (!confirm(`Limpar a folha de ${this.competencia}?\n\nOs registros ainda NÃO pagos (e suas contas a pagar) serão removidos. Os já pagos são mantidos.`)) return;
    try {
      const r = await Store.limparFolha(this.competencia);
      window.showToast(
        `${r.removidas} registro(s) removido(s)` + (r.mantidas ? ` · ${r.mantidas} mantido(s) (já pago)` : ''),
        'success'
      );
      this._renderLista();
    } catch (e) { window.showToast('Erro ao limpar: ' + e.message, 'error'); }
  },

  _pagar(id, parcela) {
    const f = (Store.state.folha || []).find(x => x.id === id);
    if (!f) return;
    const hoje = new Date().toISOString().split('T')[0];
    const label = parcela === 'vale' ? 'Vale' : 'Saldo';
    const valor = parcela === 'vale' ? f.valorVale : f.valorSaldo;
    const html = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal" style="width:420px;">
          <div class="modal-header">
            <h2 class="modal-title">Pagar ${label} — ${window.escapeHtml(f.recursoNome)}</h2>
            <button class="modal-close">✕</button>
          </div>
          <div class="modal-content">
            <p style="margin-bottom:var(--sp-md);">Valor: <strong>${Store.formatBRL(parseFloat(valor) || 0)}</strong></p>
            <div class="form-group">
              <label class="form-label">Data do pagamento</label>
              <input class="form-control" id="fpDataPag" type="date" value="${hoje}">
            </div>
            <div class="form-group">
              <label class="form-label">Forma de pagamento</label>
              <select class="form-control" id="fpForma">
                <option value="">— não informar —</option>
                <option value="PIX">PIX</option>
                <option value="Transferência">Transferência</option>
                <option value="Dinheiro">Dinheiro</option>
              </select>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" id="fpCancelar">Cancelar</button>
            <button class="btn btn-primary" id="fpConfirmar">Confirmar pagamento</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalOverlay');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('fpCancelar').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.getElementById('fpConfirmar').addEventListener('click', async () => {
      try {
        await Store.pagarFolhaParcela(id, {
          parcela,
          dataPagamento: document.getElementById('fpDataPag').value || hoje,
          formaPagamento: document.getElementById('fpForma').value || null,
        });
        close();
        window.showToast(`${label} pago`, 'success');
        await Store.loadFolha(this.competencia);
        this._renderLista();
      } catch (e) { window.showToast('Erro ao pagar: ' + e.message, 'error'); }
    });
  },

  async _estornar(id, parcela) {
    if (!confirm('Estornar este pagamento? O lançamento no Caixa será removido.')) return;
    try {
      await Store.estornarFolhaParcela(id, parcela);
      window.showToast('Pagamento estornado', 'success');
      await Store.loadFolha(this.competencia);
      this._renderLista();
    } catch (e) { window.showToast('Erro ao estornar: ' + e.message, 'error'); }
  },

  // Modal de lançamentos (descontos e proventos) de um colaborador.
  _acertos(id) {
    const f0 = (Store.state.folha || []).find(x => x.id === id);
    if (!f0) return;
    const esc = window.escapeHtml;
    const fmt = (v) => Store.formatBRL(parseFloat(v) || 0);
    const self = this;

    const html = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal" style="width:540px;">
          <div class="modal-header">
            <h2 class="modal-title">Lançamentos — ${esc(f0.recursoNome)}</h2>
            <button class="modal-close">✕</button>
          </div>
          <div class="modal-content" id="acertosBody" style="max-height:62vh;overflow-y:auto;"></div>
          <div class="modal-footer">
            <button class="btn btn-ghost" id="acFechar">Fechar</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalOverlay');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('acFechar').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    // Recarrega a folha, repinta o modal e a tabela de fundo (o modal vive no
    // <body>, então re-renderizar o #app não o remove).
    const refresh = async () => {
      await Store.loadFolha(self.competencia);
      paint();
      self._renderLista();
    };

    // (re)desenha o corpo do modal a partir do estado atual do Store.
    function paint() {
      const f = (Store.state.folha || []).find(x => x.id === id) || f0;
      const itens = f.itens || [];
      const proventos = itens.filter(i => i.tipo === 'provento');
      const descontos = itens.filter(i => i.tipo === 'desconto');
      const bloqueado = !!f.saldoPago;

      const linhaItem = (it, sinal, cor) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--color-border);">
          <span>${esc(it.descricao)}</span>
          <span style="display:flex;gap:var(--sp-md);align-items:center;">
            <strong style="color:${cor};">${sinal}${fmt(it.valor)}</strong>
            ${bloqueado ? '' : `<a class="action-link danger js-rm-item" data-item="${it.id}" title="Remover">✕</a>`}
          </span>
        </div>`;

      // Linha automática (salário base, vale 40%) — vem da própria folha, não é
      // removível: só exibe o que já compõe o cálculo do saldo.
      const linhaAuto = (titulo, valor, sinal, cor, extra) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px dashed var(--color-border);">
          <span class="text-muted">${titulo} <em style="font-size:11px;">· automático</em></span>
          <span style="display:flex;gap:var(--sp-md);align-items:center;">
            ${extra || ''}
            <strong style="color:${cor};">${sinal}${fmt(valor)}</strong>
          </span>
        </div>`;

      const secao = (titulo, cor, autoHtml, arr, sinal) => `
        <h3 style="margin:var(--sp-md) 0 4px;font-size:13px;color:${cor};">${titulo}</h3>
        ${autoHtml}
        ${arr.length
          ? arr.map(it => linhaItem(it, sinal, cor)).join('')
          : (autoHtml ? '' : '<p class="text-muted" style="padding:6px 0;">Nenhum lançamento.</p>')}`;

      // O Vale (adiantamento 40%) aparece como desconto automático para os
      // elegíveis — já está embutido no saldo, aqui só fica visível no registro.
      const temVale = !!f.elegivelVale && (parseFloat(f.valorVale) || 0) > 0;
      const valeHtml = temVale
        ? linhaAuto('Vale — adiantamento 40%', f.valorVale, '−', '#991B1B', self._badge(f.valePago))
        : '';
      const salarioHtml = linhaAuto('Salário base', f.salarioBase, '+', '#065F46');

      // Opções do seletor de itens prontos (proventos / descontos).
      const optGroup = (tipo) => self._PRESETS.filter(p => p.tipo === tipo)
        .map(p => `<option value="${p.key}">${esc(p.label)}${p.calc === 'outro' ? '…' : ''}</option>`).join('');
      const optsProv = optGroup('provento');
      const optsDesc = optGroup('desconto');

      const body = document.getElementById('acertosBody');
      body.innerHTML = `
        ${bloqueado ? '<p class="text-danger" style="margin-bottom:var(--sp-md);">Saldo já pago — estorne o saldo para editar os lançamentos.</p>' : ''}
        ${secao('Proventos', '#065F46', salarioHtml, proventos, '+')}
        ${secao('Descontos', '#991B1B', valeHtml, descontos, '−')}
        <div style="margin-top:var(--sp-md);padding-top:var(--sp-md);border-top:2px solid var(--color-border);display:flex;justify-content:space-between;">
          <span class="text-muted">Saldo a pagar (com lançamentos)</span>
          <strong${(parseFloat(f.valorSaldo) || 0) < 0 ? ' style="color:#991B1B;"' : ''}>${fmt(f.valorSaldo)}</strong>
        </div>
        ${bloqueado ? '' : `
        <div style="margin-top:var(--sp-lg);">
          <h3 style="margin:0 0 var(--sp-sm);font-size:13px;">Novo lançamento</h3>
          <div class="form-group">
            <label class="form-label">Item</label>
            <select class="form-control" id="acPreset">
              <option value="">— escolha um item —</option>
              <optgroup label="Proventos">${optsProv}</optgroup>
              <optgroup label="Descontos">${optsDesc}</optgroup>
            </select>
          </div>
          <div class="form-group" id="acDescWrap" style="display:none;">
            <label class="form-label">Descrição</label>
            <input class="form-control" id="acDesc" type="text" maxlength="120" placeholder="Descreva o lançamento">
          </div>
          <div class="form-group" id="acQtdWrap" style="display:none;">
            <label class="form-label" id="acQtdLabel">Quantidade</label>
            <input class="form-control" id="acQtd" type="number" step="0.5" min="0" placeholder="0">
          </div>
          <div class="form-group">
            <label class="form-label">Valor (R$)</label>
            <input class="form-control" id="acValor" type="number" step="0.01" min="0" placeholder="0,00">
          </div>
          <p class="text-muted" id="acHint" style="font-size:11px;margin:-6px 0 var(--sp-sm);"></p>
          <button class="btn btn-primary" id="acAdd" style="width:100%;">Adicionar lançamento</button>
        </div>`}`;

      body.querySelectorAll('.js-rm-item').forEach(b =>
        b.addEventListener('click', () => self._removerItem(id, b.dataset.item, refresh)));

      if (!bloqueado) {
        const salario = parseFloat(f.salarioBase) || 0;
        // Ajusta os campos do formulário conforme o item escolhido.
        const aplicarPreset = () => {
          const preset = self._PRESETS.find(p => p.key === document.getElementById('acPreset').value);
          const descWrap = document.getElementById('acDescWrap');
          const qtdWrap = document.getElementById('acQtdWrap');
          const qtdInput = document.getElementById('acQtd');
          const valorInput = document.getElementById('acValor');
          const hint = document.getElementById('acHint');
          descWrap.style.display = 'none';
          qtdWrap.style.display = 'none';
          qtdInput.value = '';
          valorInput.value = '';
          hint.textContent = '';
          if (!preset) return;
          if (preset.calc === 'outro') {
            descWrap.style.display = '';
            document.getElementById('acDesc').value = '';
          } else if (preset.calc === 'sindical') {
            valorInput.value = (Math.round(Math.min(salario * 0.02, 70) * 100) / 100).toFixed(2);
            hint.textContent = '2% do salário, com teto de R$ 70,00.';
          } else if (preset.calc === 'inss') {
            valorInput.value = self._calcInss(salario).toFixed(2);
            hint.textContent = 'INSS progressivo (tabela 2026) sobre ' + fmt(salario) + '. Ajuste se necessário.';
          } else if (preset.calc === 'hora') {
            qtdWrap.style.display = '';
            document.getElementById('acQtdLabel').textContent = 'Horas extras';
            qtdInput.step = '0.5';
            hint.textContent = '(salário ÷ 220) × ' + preset.fator.toFixed(2).replace('.', ',') + ' por hora.';
          } else if (preset.calc === 'falta') {
            qtdWrap.style.display = '';
            document.getElementById('acQtdLabel').textContent = 'Dias de falta';
            qtdInput.step = '1';
            hint.textContent = 'Salário ÷ 30 por dia de falta.';
          } else if (preset.calc === 'atraso') {
            qtdWrap.style.display = '';
            document.getElementById('acQtdLabel').textContent = 'Minutos de atraso';
            qtdInput.step = '1';
            hint.textContent = 'Salário ÷ 220 ÷ 60 por minuto de atraso.';
          }
        };
        // Recalcula o valor sugerido quando a quantidade muda.
        const recalcular = () => {
          const preset = self._PRESETS.find(p => p.key === document.getElementById('acPreset').value);
          if (!preset) return;
          const qtd = parseFloat(document.getElementById('acQtd').value) || 0;
          let v = null;
          if (preset.calc === 'hora') v = (salario / 220) * preset.fator * qtd;
          else if (preset.calc === 'falta') v = (salario / 30) * qtd;
          else if (preset.calc === 'atraso') v = (salario / 220 / 60) * qtd;
          if (v !== null) document.getElementById('acValor').value = (Math.round(v * 100) / 100).toFixed(2);
        };
        document.getElementById('acPreset').addEventListener('change', aplicarPreset);
        document.getElementById('acQtd').addEventListener('input', recalcular);
        document.getElementById('acAdd').addEventListener('click', () => self._adicionarItem(id, refresh));
      }
    }

    paint();
  },

  async _adicionarItem(folhaId, onDone) {
    const presetEl = document.getElementById('acPreset');
    if (!presetEl) return;
    const preset = this._PRESETS.find(p => p.key === presetEl.value);
    if (!preset) { window.showToast('Escolha um item da lista', 'error'); presetEl.focus(); return; }
    const valor = Math.round((parseFloat(document.getElementById('acValor').value) || 0) * 100) / 100;
    if (!(valor > 0)) { window.showToast('Informe um valor maior que zero', 'error'); return; }
    let descricao;
    if (preset.calc === 'outro') {
      descricao = (document.getElementById('acDesc').value || '').trim();
      if (!descricao) { window.showToast('Informe a descrição do lançamento', 'error'); return; }
    } else if (preset.calc === 'hora' || preset.calc === 'falta' || preset.calc === 'atraso') {
      const qtd = parseFloat(document.getElementById('acQtd').value) || 0;
      const unid = preset.calc === 'hora' ? `${qtd}h`
        : preset.calc === 'falta' ? `${qtd} ${qtd === 1 ? 'dia' : 'dias'}`
        : `${qtd} min`;
      descricao = qtd > 0 ? `${preset.label} (${unid})` : preset.label;
    } else {
      descricao = preset.label;
    }
    try {
      await Store.addFolhaItem(folhaId, { tipo: preset.tipo, descricao, valor });
      window.showToast(preset.tipo === 'provento' ? 'Provento lançado' : 'Desconto lançado', 'success');
      await onDone();
    } catch (e) { window.showToast('Erro ao lançar: ' + e.message, 'error'); }
  },

  async _removerItem(folhaId, itemId, onDone) {
    if (!confirm('Remover este lançamento?')) return;
    try {
      await Store.removeFolhaItem(folhaId, itemId);
      window.showToast('Lançamento removido', 'success');
      await onDone();
    } catch (e) { window.showToast('Erro ao remover: ' + e.message, 'error'); }
  },

  // Itens comuns de folha — preenchem descrição/tipo e calculam o valor a
  // partir do salário quando há fórmula. 'outro' libera descrição livre;
  // 'livre' usa a descrição pronta e o valor digitado.
  _PRESETS: [
    { key: 'he50',    tipo: 'provento', label: 'Hora extra 50%',  calc: 'hora', fator: 1.5 },
    { key: 'he60',    tipo: 'provento', label: 'Hora extra 60%',  calc: 'hora', fator: 1.6 },
    { key: 'he70',    tipo: 'provento', label: 'Hora extra 70%',  calc: 'hora', fator: 1.7 },
    { key: 'he100',   tipo: 'provento', label: 'Hora extra 100%', calc: 'hora', fator: 2.0 },
    { key: 'plr',     tipo: 'provento', label: 'Participação nos lucros', calc: 'livre' },
    { key: 'va',      tipo: 'provento', label: 'Vale-alimentação', calc: 'livre' },
    { key: 'outro_p', tipo: 'provento', label: 'Outro provento',  calc: 'outro' },
    { key: 'sind',    tipo: 'desconto', label: 'Contribuição sindical', calc: 'sindical' },
    { key: 'inss',    tipo: 'desconto', label: 'INSS',            calc: 'inss' },
    { key: 'falta',   tipo: 'desconto', label: 'Faltas',          calc: 'falta' },
    { key: 'atraso',  tipo: 'desconto', label: 'Atrasos',         calc: 'atraso' },
    { key: 'dsr',     tipo: 'desconto', label: 'D.S.R.',          calc: 'livre' },
    { key: 'outro_d', tipo: 'desconto', label: 'Outro desconto',  calc: 'outro' },
  ],

  // INSS progressivo do segurado empregado — tabela 2026 (Portaria
  // Interministerial MPS/MF nº 13, vigente desde 01/01/2026). Calcula faixa a
  // faixa. ATENÇÃO: a tabela muda todo ano — revisar os limites e o teto.
  _calcInss(salario) {
    const s = Math.min(parseFloat(salario) || 0, 8475.55); // teto INSS 2026
    if (s <= 0) return 0;
    let inss = Math.min(s, 1621.00) * 0.075;
    if (s > 1621.00) inss += (Math.min(s, 2902.84) - 1621.00) * 0.09;
    if (s > 2902.84) inss += (Math.min(s, 4354.27) - 2902.84) * 0.12;
    if (s > 4354.27) inss += (s - 4354.27) * 0.14;
    return Math.round(inss * 100) / 100;
  },
};
