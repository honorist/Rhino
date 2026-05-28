'use strict';
// Recrutamento — solicitações de contratação (US-05 a US-09)

window.Recrutamento = {
  _store: (window.UIKit?.persistFilter?.('recrut', { filtro: 'todas', contrato: '', view: 'list' })) || null,
  get _filtro()      { return this._store?.get('filtro')   ?? 'todas'; },
  set _filtro(v)     { this._store?.set('filtro', v); },
  get _contrato()    { return this._store?.get('contrato') ?? ''; },
  set _contrato(v)   { this._store?.set('contrato', v); },
  get _view()        { return this._store?.get('view')     ?? 'list'; },
  set _view(v)       { this._store?.set('view', v); },

  async render() {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading-spinner">Carregando...</div>';
    try {
      await this._load();
    } catch (e) {
      console.error(e);
      app.innerHTML = '<div class="card"><p class="text-danger">Erro ao carregar. Tente novamente.</p></div>';
    }
  },

  async _load() {
    // No modo Kanban, sempre busca TUDO (as colunas fazem o split por status).
    // No modo Lista, respeita o filtro selecionado.
    const qs = (this._view === 'kanban' || this._filtro === 'todas') ? '' : `?status=${this._filtro}`;
    const resp = await fetch(`/api/recrutamento/solicitacoes${qs}`, { credentials: 'same-origin' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    this._renderLista(data.solicitacoes || []);
  },

  _renderLista(lista) {
    const app = document.getElementById('app');
    // Filtro adicional por contrato (cliente-side)
    if (this._contrato) lista = lista.filter(s => s.contractId === this._contrato);
    const total      = lista.length;
    const abertas    = lista.filter(s => s.status === 'aberta').length;
    const prenchidas = lista.filter(s => s.status === 'preenchida').length;
    const canceladas = lista.filter(s => s.status === 'cancelada').length;
    const contratos  = (window.Store?.state?.contracts || []).filter(c => c.status === 'ativo' || c.status === 'pausado');
    const filtroAtivo = this._filtro !== 'todas' || !!this._contrato;

    const headerHtml = window.UIKit?.pageHeader ? window.UIKit.pageHeader({
      title: 'Recrutamento',
      subtitle: 'Solicitações de contratação dos encarregados',
      actions: `
        ${window.UIKit?.viewToggle ? window.UIKit.viewToggle({ current: this._view, options: [
          { value:'list', label:'☰ Lista' },
          { value:'kanban', label:'▦ Kanban' },
        ]}) : ''}
        <button class="btn btn-primary btn-lg" id="btnNovaSolicitacao">+ Nova solicitação</button>`,
    }) : '';

    const kpisHtml = window.UIKit?.kpiGrid ? window.UIKit.kpiGrid([
      { label: 'Total',       value: total,      color: 'var(--color-primary)' },
      { label: '🔵 Abertas',  value: abertas,    color: 'var(--color-info)' },
      { label: '✅ Preenchidas', value: prenchidas, color: 'var(--color-success)' },
      { label: '✗ Canceladas',  value: canceladas, color: 'var(--color-gray)' },
    ]) : '';

    const toolbarHtml = window.UIKit?.toolbar ? window.UIKit.toolbar({
      selects: [
        { id: 'recrutFiltroStatus', label: 'Status', options: [
          { value: 'todas',     label: 'Todas',       selected: this._filtro === 'todas' },
          { value: 'aberta',    label: '🔵 Abertas',    selected: this._filtro === 'aberta' },
          { value: 'preenchida',label: '✅ Preenchidas', selected: this._filtro === 'preenchida' },
          { value: 'cancelada', label: '✗ Canceladas',  selected: this._filtro === 'cancelada' },
        ]},
        { id: 'recrutFiltroContrato', label: 'Contrato', options: [
          { value: '', label: `Todos (${contratos.length})`, selected: !this._contrato },
          ...contratos.map(c => ({ value: c.id, label: c.name, selected: this._contrato === c.id })),
        ]},
      ],
      showClear: filtroAtivo, clearId: 'btnLimparRecrut',
    }) : '';

    // Card do Kanban
    const renderCard = (s) => {
      const totalVagas  = (s.vagas || []).reduce((a, v) => a + v.qtdTotal, 0);
      const preenchidas = (s.vagas || []).reduce((a, v) => a + v.qtdPreenchida, 0);
      const cargos      = (s.vagas || []).map(v => `${v.qtdTotal}× ${escapeHtml(v.cargo)}`).join(', ');
      const data        = new Date(s.createdAt).toLocaleDateString('pt-BR');
      return `
        <div class="ui-kanban__card btn-abrir-sol" data-id="${s.id}">
          <div class="ui-kanban__card-title">${escapeHtml(s.solicitanteNome || '—')}</div>
          <div class="ui-kanban__card-meta">
            <span>📅 ${data}</span>
            ${s.contractName ? `<span>🏗️ ${escapeHtml(s.contractName)}</span>` : ''}
            ${s.dataDesejadaObra ? `<span style="color:var(--color-warning-dark);font-weight:600;">🏁 ${s.dataDesejadaObra.slice(8,10)}/${s.dataDesejadaObra.slice(5,7)}</span>` : ''}
          </div>
          <div style="font-size:13px;">
            <strong>${preenchidas}/${totalVagas}</strong> vagas
            ${cargos ? `<div style="color:var(--color-text-muted);margin-top:2px;">${cargos}</div>` : ''}
          </div>
        </div>`;
    };

    let contentHtml = '';
    if (this._view === 'kanban') {
      const COLS = [
        { key:'aberta',     title:'Abertas',     icon:'🔵', variant:'info' },
        { key:'preenchida', title:'Preenchidas', icon:'✅', variant:'success' },
        { key:'cancelada',  title:'Canceladas',  icon:'✗',  variant:'gray' },
      ];
      const columns = COLS.map(c => ({ ...c, items: lista.filter(s => s.status === c.key), emptyMsg: 'Sem solicitações' }));
      contentHtml = window.UIKit?.kanban ? window.UIKit.kanban({ columns, renderCard }) : '';
    } else {
      contentHtml = `
        <div class="card" style="padding:0;">
          ${lista.length === 0 ? `
            <p class="text-muted" style="padding:var(--sp-xl);text-align:center;">
              Nenhuma solicitação ${filtroAtivo ? 'com este filtro' : 'cadastrada'}.
            </p>
          ` : `
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Solicitante</th><th>Data</th><th>Obra / Contrato</th>
                    <th>Vagas</th><th>Obra em</th><th>Status</th><th></th>
                  </tr>
                </thead>
                <tbody>${lista.map(s => this._tr(s)).join('')}</tbody>
              </table>
            </div>
          `}
        </div>`;
    }

    app.innerHTML = `
      ${headerHtml}
      ${kpisHtml}
      ${toolbarHtml}
      ${contentHtml}
    `;

    document.getElementById('btnNovaSolicitacao').addEventListener('click', () => this._showModalNova());
    document.getElementById('recrutFiltroStatus')?.addEventListener('change', e => {
      this._filtro = e.target.value; this._load();
    });
    document.getElementById('recrutFiltroContrato')?.addEventListener('change', e => {
      this._contrato = e.target.value; this._load();
    });
    document.getElementById('btnLimparRecrut')?.addEventListener('click', () => {
      this._filtro = 'todas'; this._contrato = ''; this._load();
    });
    document.querySelectorAll('.ui-view-toggle button[data-view]').forEach(b => {
      b.addEventListener('click', () => { this._view = b.dataset.view; this._load(); });
    });

    app.querySelectorAll('.btn-abrir-sol').forEach(btn => {
      btn.addEventListener('click', () => this._showDetalhe(btn.dataset.id));
    });
  },

  _tr(s) {
    const totalVagas   = (s.vagas || []).reduce((a, v) => a + v.qtdTotal, 0);
    const preenchidas  = (s.vagas || []).reduce((a, v) => a + v.qtdPreenchida, 0);
    const cargos       = (s.vagas || []).map(v => `${v.qtdTotal}× ${escapeHtml(v.cargo)}`).join(', ');
    const data         = new Date(s.createdAt).toLocaleDateString('pt-BR');
    const { bg, fg }   = this._statusCor(s.status);
    const label        = this._statusLabel(s.status);

    const fmtDate = v => v ? v.slice(8,10)+'/'+v.slice(5,7)+'/'+v.slice(0,4) : '—';
    return `
      <tr style="cursor:pointer;" class="btn-abrir-sol" data-id="${s.id}">
        <td><strong>${escapeHtml(s.solicitanteNome || '—')}</strong></td>
        <td>${data}</td>
        <td>${escapeHtml(s.contractName || '—')}</td>
        <td>${preenchidas}/${totalVagas} · <span class="text-muted" style="font-size:13px;">${cargos || '—'}</span></td>
        <td>${s.dataDesejadaObra ? `<span style="color:var(--color-warning-dark);font-weight:600;">🏁 ${fmtDate(s.dataDesejadaObra)}</span>` : '<span class="text-muted">—</span>'}</td>
        <td><span style="padding:2px 9px;border-radius:12px;font-size:11px;font-weight:700;background:${bg};color:${fg};">${label}</span></td>
        <td><a class="action-link">Abrir</a></td>
      </tr>
    `;
  },

  // ─── Modal: Nova Solicitação ─────────────────────────────────────────────────

  _showModalNova() {
    const contratos = (window.Store?.state?.contracts || [])
      .filter(c => c.status === 'ativo')
      .map(c => `<option value="${c.id}">${escapeHtml(c.name)}${c.client ? ` · ${escapeHtml(c.client)}` : ''}</option>`)
      .join('');

    const html = `
      <div class="modal-overlay" id="recrutModalOverlay">
        <div class="modal" style="width:640px;max-width:95vw;">
          <div class="modal-header">
            <h2 class="modal-title">Nova solicitação de contratação</h2>
            <button class="modal-close" id="recrutBtnFechar">✕</button>
          </div>
          <form id="recrutFormNova" class="modal-content">
            <div class="form-group">
              <label class="form-label">Obra / Contrato (opcional)</label>
              <select class="form-control" name="contractId">
                <option value="">— Sem contrato específico —</option>
                ${contratos}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Quando precisa na obra?</label>
              <input class="form-control" type="date" name="dataDesejadaObra" style="max-width:200px;">
              <div style="font-size:12px;color:var(--color-text-muted);margin-top:4px;">Prazo que o RH deve ter como meta para a contratação.</div>
            </div>

            <div class="form-group" style="border:1px solid var(--color-border);border-radius:6px;padding:var(--sp-md);">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--sp-sm);">
                <h3 style="margin:0;font-size:15px;font-weight:600;">Vagas necessárias</h3>
                <button type="button" class="btn btn-sm btn-secondary" id="recrutBtnAddVaga">+ Vaga</button>
              </div>
              <table style="width:100%;font-size:14px;" id="recrutTabelaVagas">
                <thead>
                  <tr>
                    <th style="text-align:left;font-size:12px;color:#64748B;padding-bottom:4px;">Cargo</th>
                    <th style="width:90px;text-align:left;font-size:12px;color:#64748B;padding-bottom:4px;">Qtd</th>
                    <th style="width:32px;"></th>
                  </tr>
                </thead>
                <tbody id="recrutVagasBody">
                  ${this._vagaRow(0)}
                </tbody>
              </table>
            </div>

            <div class="form-group">
              <label class="form-label">Observações</label>
              <textarea class="form-control" name="observacoes" rows="3"
                placeholder="Urgência, requisitos especiais, jornada, etc."></textarea>
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="recrutBtnCancelar">Cancelar</button>
            <button class="btn btn-primary" id="recrutBtnCriar">Criar solicitação</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

    const close = () => document.getElementById('recrutModalOverlay')?.remove();
    document.getElementById('recrutBtnFechar').addEventListener('click', close);
    document.getElementById('recrutBtnCancelar').addEventListener('click', close);
    document.getElementById('recrutModalOverlay').addEventListener('click', e => {
      if (e.target.id === 'recrutModalOverlay') close();
    });

    document.getElementById('recrutBtnAddVaga').addEventListener('click', () => {
      const tbody = document.getElementById('recrutVagasBody');
      const idx   = tbody.querySelectorAll('tr').length;
      tbody.insertAdjacentHTML('beforeend', this._vagaRow(idx));
      this._bindVagaRm();
    });
    this._bindVagaRm();

    document.getElementById('recrutBtnCriar').addEventListener('click', () => this._submitNova(close));
  },

  _vagaRow(idx) {
    return `
      <tr data-vaga-row>
        <td style="padding:4px 0;">
          <input class="form-control" name="cargo[]" placeholder="Ex.: Pedreiro, Servente, Eletricista" required>
        </td>
        <td style="padding:4px 0;">
          <input class="form-control" name="qtd[]" type="number" min="1" value="1" style="width:80px;">
        </td>
        <td style="padding:4px 0;text-align:center;">
          ${idx > 0 ? `<button type="button" class="btn-rm-vaga" style="background:none;border:none;cursor:pointer;color:#dc2626;font-size:16px;padding:0 6px;">✕</button>` : ''}
        </td>
      </tr>
    `;
  },

  _bindVagaRm() {
    document.querySelectorAll('.btn-rm-vaga').forEach(btn => {
      btn.onclick = () => btn.closest('[data-vaga-row]').remove();
    });
  },

  async _submitNova(close) {
    const form = document.getElementById('recrutFormNova');
    const contractId       = form.querySelector('[name=contractId]').value;
    const observacoes      = form.querySelector('[name=observacoes]').value.trim();
    const dataDesejadaObra = form.querySelector('[name=dataDesejadaObra]').value || null;
    const cargos = [...form.querySelectorAll('[name="cargo[]"]')].map(i => i.value.trim());
    const qtds   = [...form.querySelectorAll('[name="qtd[]"]')].map(i => parseInt(i.value) || 0);

    const vagas = cargos
      .map((c, i) => ({ cargo: c, qtdTotal: qtds[i] }))
      .filter(v => v.cargo);

    if (!vagas.length) { window.showToast('Informe pelo menos uma vaga com cargo.', 'warning'); return; }
    if (vagas.some(v => v.qtdTotal <= 0)) { window.showToast('Quantidade de cada vaga deve ser maior que zero.', 'warning'); return; }

    const btn = document.getElementById('recrutBtnCriar');
    btn.disabled = true;
    btn.textContent = 'Enviando…';

    try {
      const resp = await fetch('/api/recrutamento/solicitacoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ contractId: contractId || null, observacoes: observacoes || undefined, vagas, dataDesejadaObra }),
      });
      if (!resp.ok) { const d = await resp.json().catch(() => ({})); throw new Error(d.error || `HTTP ${resp.status}`); }
      window.showToast('Solicitação criada. RH foi notificado.', 'success');
      close();
      this._load();
    } catch (e) {
      window.showToast(e.message, 'danger');
      btn.disabled = false;
      btn.textContent = 'Criar solicitação';
    }
  },

  // ─── Modal: Detalhe da Solicitação ──────────────────────────────────────────

  async _showDetalhe(id) {
    try {
      const resp = await fetch(`/api/recrutamento/solicitacoes/${id}`, { credentials: 'same-origin' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const { solicitacao } = await resp.json();
      this._renderDetalhe(solicitacao);
    } catch (e) {
      window.showToast('Erro ao carregar solicitação: ' + e.message, 'danger');
    }
  },

  _renderDetalhe(sol) {
    document.getElementById('recrutDetalheOverlay')?.remove();

    const { bg, fg } = this._statusCor(sol.status);
    const label      = this._statusLabel(sol.status);
    const data       = new Date(sol.createdAt).toLocaleDateString('pt-BR');

    const vagasHtml = (sol.vagas || []).map(v => `
      <div class="card" style="padding:var(--sp-md);margin-bottom:var(--sp-md);">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:var(--sp-sm);">
          <h3 style="margin:0;font-size:16px;font-weight:600;">
            ${escapeHtml(v.cargo)}
            <span class="text-muted" style="font-size:13px;font-weight:400;"> — ${v.qtdPreenchida}/${v.qtdTotal} preenchidas</span>
          </h3>
          ${sol.status === 'aberta' && v.qtdPreenchida < v.qtdTotal
            ? `<button class="btn btn-sm btn-secondary btn-add-cand" data-vaga="${v.id}">+ Candidato</button>`
            : ''}
        </div>
        ${this._candidatosTable(v.candidatos || [], sol.id)}
      </div>
    `).join('');

    const html = `
      <div class="modal-overlay" id="recrutDetalheOverlay">
        <div class="modal" style="width:900px;max-width:96vw;max-height:90vh;overflow-y:auto;">
          <div class="modal-header">
            <h2 class="modal-title">Solicitação #${sol.id.slice(-6).toUpperCase()}</h2>
            <button class="modal-close" id="recrutDetBtnFechar">✕</button>
          </div>
          <div class="modal-content">
            <div style="display:flex;align-items:center;gap:var(--sp-sm);margin-bottom:var(--sp-sm);">
              <span style="padding:4px 10px;border-radius:12px;font-size:12px;font-weight:700;background:${bg};color:${fg};">${label}</span>
              <span class="text-muted" style="font-size:13px;">
                Aberta por <strong>${escapeHtml(sol.solicitanteNome || '—')}</strong> em ${data}
              </span>
            </div>
            ${sol.observacoes ? `<p class="text-muted" style="font-size:14px;margin-bottom:var(--sp-md);"><strong>Obs:</strong> ${escapeHtml(sol.observacoes)}</p>` : ''}
            ${vagasHtml}
          </div>
          <div class="modal-footer">
            ${sol.status === 'aberta'
              ? `<button class="btn btn-secondary" id="recrutBtnCancelarSol">Cancelar solicitação</button>`
              : ''}
            <button class="btn btn-primary" id="recrutDetBtnFecharOk">Fechar</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

    const close = () => document.getElementById('recrutDetalheOverlay')?.remove();
    document.getElementById('recrutDetBtnFechar').addEventListener('click', close);
    document.getElementById('recrutDetBtnFecharOk').addEventListener('click', close);
    document.getElementById('recrutDetalheOverlay').addEventListener('click', e => {
      if (e.target.id === 'recrutDetalheOverlay') close();
    });

    document.getElementById('recrutBtnCancelarSol')?.addEventListener('click', async () => {
      if (!confirm('Cancelar esta solicitação?')) return;
      try {
        const resp = await fetch(`/api/recrutamento/solicitacoes/${sol.id}/cancelar`, {
          method: 'POST', credentials: 'same-origin',
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        window.showToast('Solicitação cancelada.', 'info');
        close();
        this._load();
      } catch (e) { window.showToast(e.message, 'danger'); }
    });

    document.querySelectorAll('.btn-add-cand').forEach(btn => {
      btn.addEventListener('click', () => this._showModalCandidato(sol.id, btn.dataset.vaga, sol));
    });

    document.querySelectorAll('.btn-abrir-cand').forEach(btn => {
      btn.addEventListener('click', () => {
        const cand = JSON.parse(decodeURIComponent(btn.dataset.cand));
        this._showModalTriagem(cand, sol.id, sol);
      });
    });
  },

  _candidatosTable(candidatos, solId) {
    if (!candidatos.length) {
      return `<p class="text-muted" style="font-size:13px;">Nenhum candidato adicionado ainda.</p>`;
    }
    const rows = candidatos.map(c => {
      const { bg, fg } = this._candStatusCor(c.status);
      const label      = this._candStatusLabel(c.status);
      const nDocs      = Object.keys(c.documentos || {}).length;
      const antIco     = c.antecedentesStatus === 'ok' ? '✅' : c.antecedentesStatus === 'reprovado' ? '❌' : '⏳';
      const encoded    = encodeURIComponent(JSON.stringify(c));
      return `
        <tr style="border-bottom:1px solid var(--color-border);">
          <td style="padding:8px 6px;"><strong>${escapeHtml(c.nome)}</strong></td>
          <td style="padding:8px 6px;">${escapeHtml(c.telefone || '—')}</td>
          <td style="padding:8px 6px;">
            <span style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;background:${bg};color:${fg};">${label}</span>
          </td>
          <td style="padding:8px 6px;">${antIco} ${c.antecedentesStatus}</td>
          <td style="padding:8px 6px;">${nDocs}/5 docs</td>
          <td style="padding:8px 6px;">
            <a class="action-link btn-abrir-cand" style="cursor:pointer;" data-cand="${encoded}">Abrir</a>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <table style="width:100%;font-size:14px;">
        <thead>
          <tr style="border-bottom:1px solid var(--color-border);">
            <th style="padding:6px;font-size:12px;font-weight:600;color:#64748B;text-transform:uppercase;">Nome</th>
            <th style="padding:6px;font-size:12px;font-weight:600;color:#64748B;text-transform:uppercase;">Telefone</th>
            <th style="padding:6px;font-size:12px;font-weight:600;color:#64748B;text-transform:uppercase;">Status</th>
            <th style="padding:6px;font-size:12px;font-weight:600;color:#64748B;text-transform:uppercase;">Antecedentes</th>
            <th style="padding:6px;font-size:12px;font-weight:600;color:#64748B;text-transform:uppercase;">Docs</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  },

  // ─── Modal: Novo Candidato ───────────────────────────────────────────────────

  _showModalCandidato(solId, vagaId, sol) {
    document.getElementById('recrutCandOverlay')?.remove();

    const html = `
      <div class="modal-overlay" id="recrutCandOverlay">
        <div class="modal" style="width:520px;max-width:95vw;">
          <div class="modal-header">
            <h2 class="modal-title">Adicionar candidato</h2>
            <button class="modal-close" id="recrutCandBtnFechar">✕</button>
          </div>
          <form id="recrutFormCand" class="modal-content">
            <div class="form-group">
              <label class="form-label">Nome *</label>
              <input class="form-control" name="nome" required placeholder="Nome completo">
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">CPF</label>
                <input class="form-control" name="cpf" placeholder="000.000.000-00">
              </div>
              <div class="form-group">
                <label class="form-label">Telefone</label>
                <input class="form-control" name="telefone" placeholder="(00) 00000-0000">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Email</label>
              <input class="form-control" name="email" type="email" placeholder="email@exemplo.com">
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="recrutCandBtnCancelar">Cancelar</button>
            <button class="btn btn-primary" id="recrutCandBtnSalvar">Adicionar</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

    const close = () => document.getElementById('recrutCandOverlay')?.remove();
    document.getElementById('recrutCandBtnFechar').addEventListener('click', close);
    document.getElementById('recrutCandBtnCancelar').addEventListener('click', close);

    document.getElementById('recrutCandBtnSalvar').addEventListener('click', async () => {
      const form     = document.getElementById('recrutFormCand');
      const nome     = form.querySelector('[name=nome]').value.trim();
      const cpf      = form.querySelector('[name=cpf]').value.trim();
      const telefone = form.querySelector('[name=telefone]').value.trim();
      const email    = form.querySelector('[name=email]').value.trim();

      if (!nome) { window.showToast('Nome é obrigatório.', 'warning'); return; }

      const btn = document.getElementById('recrutCandBtnSalvar');
      btn.disabled = true; btn.textContent = 'Adicionando…';

      try {
        const resp = await fetch(`/api/recrutamento/vagas/${vagaId}/candidatos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ nome, cpf: cpf || undefined, telefone: telefone || undefined, email: email || undefined }),
        });
        if (!resp.ok) { const d = await resp.json().catch(() => ({})); throw new Error(d.error || `HTTP ${resp.status}`); }
        window.showToast('Candidato adicionado.', 'success');
        close();
        this._showDetalhe(solId);
      } catch (e) {
        window.showToast(e.message, 'danger');
        btn.disabled = false; btn.textContent = 'Adicionar';
      }
    });
  },

  // ─── Modal: Triagem / Detalhe do Candidato ──────────────────────────────────

  _showModalTriagem(cand, solId, sol) {
    document.getElementById('recrutTriagemOverlay')?.remove();

    const STATUS_OPT = [
      { v: 'contatado',              l: 'Contatado' },
      { v: 'interessado',            l: 'Interessado' },
      { v: 'sem_interesse',          l: 'Sem interesse' },
      { v: 'reprovado_antecedentes', l: 'Reprovado nos antecedentes' },
      { v: 'aprovado',               l: 'Aprovado' },
    ];
    const ANT_OPT = [
      { v: 'pendente',   l: 'Pendente' },
      { v: 'ok',         l: 'Aprovado' },
      { v: 'reprovado',  l: 'Reprovado' },
    ];
    const DOCS = [
      { t: 'rg',          l: 'RG' },
      { t: 'cpf',         l: 'CPF' },
      { t: 'residencia',  l: 'Comprovante de residência' },
      { t: 'ctps',        l: 'CTPS digital' },
      { t: 'antecedentes',l: 'Antecedentes criminais' },
    ];

    const docsHtml = DOCS.map(d => {
      const doc = (cand.documentos || {})[d.t];
      return `
        <tr>
          <td style="padding:6px 0;">${d.l}</td>
          <td style="padding:6px 0;">
            ${doc
              ? `<span style="color:#16A34A;font-weight:600;">✅ Enviado</span>
                 <span class="text-muted" style="font-size:12px;"> ${escapeHtml(doc.filename || '')}</span>`
              : `<span class="text-muted">—</span>`}
          </td>
        </tr>
      `;
    }).join('');

    const html = `
      <div class="modal-overlay" id="recrutTriagemOverlay">
        <div class="modal" style="width:620px;max-width:95vw;">
          <div class="modal-header">
            <h2 class="modal-title">${escapeHtml(cand.nome)}</h2>
            <button class="modal-close" id="recrutTriBtnFechar">✕</button>
          </div>
          <div class="modal-content">
            <div class="form-row" style="margin-bottom:var(--sp-md);">
              <div class="form-group">
                <label class="form-label">Status do candidato</label>
                <select class="form-control" id="recrutTriStatus">
                  ${STATUS_OPT.map(o => `<option value="${o.v}"${cand.status === o.v ? ' selected' : ''}>${o.l}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Antecedentes</label>
                <select class="form-control" id="recrutTriAnt">
                  ${ANT_OPT.map(o => `<option value="${o.v}"${cand.antecedentesStatus === o.v ? ' selected' : ''}>${o.l}</option>`).join('')}
                </select>
              </div>
            </div>

            <h3 style="font-size:14px;font-weight:600;margin-bottom:var(--sp-sm);">Documentos</h3>
            <table style="width:100%;font-size:14px;margin-bottom:var(--sp-md);">
              <tbody>${docsHtml}</tbody>
            </table>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="recrutTriBtnFechar2">Fechar</button>
            <button class="btn btn-primary" id="recrutTriBtnSalvar">Salvar triagem</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

    const close = () => {
      document.getElementById('recrutTriagemOverlay')?.remove();
      this._showDetalhe(solId);
    };
    document.getElementById('recrutTriBtnFechar').addEventListener('click', close);
    document.getElementById('recrutTriBtnFechar2').addEventListener('click', close);

    document.getElementById('recrutTriBtnSalvar').addEventListener('click', async () => {
      const status           = document.getElementById('recrutTriStatus').value;
      const antecedentesStatus = document.getElementById('recrutTriAnt').value;
      const btn = document.getElementById('recrutTriBtnSalvar');
      btn.disabled = true; btn.textContent = 'Salvando…';

      try {
        const [r1, r2] = await Promise.all([
          fetch(`/api/recrutamento/candidatos/${cand.id}/triagem`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ status }),
          }),
          fetch(`/api/recrutamento/candidatos/${cand.id}/antecedentes`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ antecedentesStatus }),
          }),
        ]);
        if (!r1.ok || !r2.ok) throw new Error('Erro ao salvar');
        window.showToast('Triagem atualizada.', 'success');
        document.getElementById('recrutTriagemOverlay')?.remove();
        this._showDetalhe(solId);
      } catch (e) {
        window.showToast(e.message, 'danger');
        btn.disabled = false; btn.textContent = 'Salvar triagem';
      }
    });
  },

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  _stat(label, valor, cor, ico) {
    return `
      <div class="card" style="padding:var(--sp-md);">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <div class="rh-label" style="margin-bottom:4px;">${label}</div>
            <div class="rh-kpi-value" style="font-size:28px;font-weight:700;color:${cor};">${valor}</div>
          </div>
          <span style="font-size:22px;">${ico}</span>
        </div>
      </div>
    `;
  },

  _statusCor(status) {
    return {
      aberta:     { bg: '#FEF3C7', fg: '#D97706' },
      preenchida: { bg: '#DCFCE7', fg: '#16A34A' },
      cancelada:  { bg: '#F1F5F9', fg: '#64748B' },
    }[status] || { bg: '#F1F5F9', fg: '#64748B' };
  },

  _statusLabel(status) {
    return { aberta: 'Aberta', preenchida: 'Preenchida', cancelada: 'Cancelada' }[status] || status;
  },

  _candStatusCor(status) {
    return {
      contatado:              { bg: '#DBEAFE', fg: '#3182CE' },
      interessado:            { bg: '#DCFCE7', fg: '#16A34A' },
      sem_interesse:          { bg: '#F1F5F9', fg: '#64748B' },
      reprovado_antecedentes: { bg: '#FEE2E2', fg: '#DC2626' },
      aprovado:               { bg: '#CCFBF1', fg: '#0F766E' },
    }[status] || { bg: '#F1F5F9', fg: '#64748B' };
  },

  _candStatusLabel(status) {
    return {
      contatado: 'Contatado', interessado: 'Interessado', sem_interesse: 'Sem interesse',
      reprovado_antecedentes: 'Rep. antecedentes', aprovado: 'Aprovado',
    }[status] || status;
  },
};
