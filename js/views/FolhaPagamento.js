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

    let totVale = 0, totValePago = 0, totSaldo = 0, totSaldoPago = 0;
    folha.forEach(f => {
      totVale += parseFloat(f.valorVale) || 0;
      totSaldo += parseFloat(f.valorSaldo) || 0;
      if (f.valePago) totValePago += parseFloat(f.valorVale) || 0;
      if (f.saldoPago) totSaldoPago += parseFloat(f.valorSaldo) || 0;
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
      return `<tr class="row-folha" data-id="${f.recursoId}" style="cursor:pointer;" title="Ver dados do colaborador">
        <td><strong>${esc(f.recursoNome) || '—'}</strong></td>
        <td>${esc(this._nomeLocal(f))}</td>
        <td>${fmt(f.salarioBase)}</td>
        <td>${valeCell}</td>
        <td>${saldoCell}</td>
        <td><strong>${fmt((parseFloat(f.valorVale) || 0) + (parseFloat(f.valorSaldo) || 0))}</strong></td>
      </tr>`;
    }).join('');

    app.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Folha de Pagamento</h1>
          <p class="page-subtitle">${folha.length} colaborador${folha.length !== 1 ? 'es' : ''} ·
            Total ${fmt(totalGeral)} · Pago ${fmt(totalPago)} · Pendente ${fmt(totalGeral - totalPago)}</p>
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
              <th>Vale (40%)</th><th>Saldo</th><th>Total</th>
            </tr></thead>
            <tbody>
              ${folha.length === 0
                ? `<tr><td colspan="6" class="text-center text-muted" style="padding:var(--sp-xl);">
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
};
