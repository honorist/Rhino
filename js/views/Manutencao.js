// Manutenção de Equipamentos — fluxo de aprovação.
//   1) Solicitante: solicita (equipamento + problema).
//   2) Equipe de compras: avalia — define oficina, prazo e custo.
//   3) Gerência: aprova ou rejeita.
//   4) Encerramento: registra o retorno do equipamento.
// Status: solicitada → pendente_aprovacao → aprovada → retornado
//         (+ rejeitada / cancelada)
window.Manutencao = {
  filtroStatus: '',

  _abas() { return window.perfil?.abas?.() || null; },
  _podeAvaliar() { const a = this._abas(); return !a || a.includes('manutencao:avaliar'); },
  _podeAprovar() { const a = this._abas(); return !a || a.includes('manutencao:aprovar'); },

  async render() {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading-spinner">Carregando...</div>';
    try {
      await Store.loadAll();
      this._renderLista();
    } catch (e) {
      console.error('[Manutencao]', e);
      app.innerHTML = '<div class="card"><p class="text-danger">Erro ao carregar manutenções. Tente novamente.</p></div>';
    }
  },

  // ── Helpers ────────────────────────────────────────────────────────────────
  _fmtDate(s) {
    if (!s) return '—';
    const d = String(s).slice(0, 10).split('-');
    return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : '—';
  },

  _hoje() { return new Date().toISOString().slice(0, 10); },

  _dias(deStr, ateStr) {
    if (!deStr) return null;
    const de = new Date(String(deStr).slice(0, 10) + 'T12:00:00');
    const ate = new Date((ateStr ? String(ateStr).slice(0, 10) : this._hoje()) + 'T12:00:00');
    if (isNaN(de) || isNaN(ate)) return null;
    return Math.floor((ate - de) / 86400000);
  },

  // Em manutenção (aprovada) e já passou da previsão de retorno.
  _isAtrasada(m) {
    return m.status === 'aprovada'
      && m.dataRetornoPrevista
      && String(m.dataRetornoPrevista).slice(0, 10) < this._hoje();
  },

  _statusCfg(status) {
    return {
      solicitada:         { label: '📋 A avaliar',            bg: '#E0E7FF', cor: '#3730A3' },
      pendente_aprovacao: { label: '🟡 Aguardando aprovação', bg: '#FEF3C7', cor: '#92400E' },
      aprovada:           { label: '🔧 Em manutenção',        bg: '#FFEDD5', cor: '#9A3412' },
      retornado:          { label: '✅ Retornado',            bg: '#D1FAE5', cor: '#065F46' },
      rejeitada:          { label: '❌ Rejeitada',            bg: '#FEE2E2', cor: '#991B1B' },
      cancelada:          { label: '⛔ Cancelada',            bg: '#E5E7EB', cor: '#374151' },
    }[status] || { label: status || '—', bg: '#E5E7EB', cor: '#374151' };
  },

  _badgeStatus(status) {
    const c = this._statusCfg(status);
    return `<span class="badge" style="background:${c.bg};color:${c.cor};">${c.label}</span>`;
  },

  _statCard(label, value, cor, icon) {
    return `<div class="card" style="padding:var(--sp-lg);text-align:center;">
      <div style="font-size:26px;color:${cor};margin-bottom:4px;">${icon}</div>
      <div style="font-size:22px;font-weight:700;color:${cor};">${value}</div>
      <div style="font-size:14px;color:var(--color-text-muted);">${label}</div>
    </div>`;
  },

  _nomeContrato(contractId) {
    if (!contractId) return '🏢 Sede';
    const c = (Store.state.contracts || []).find(x => x.id === contractId);
    return c ? '🏗️ ' + escapeHtml(c.name) : '🏗️ Obra';
  },

  _fmtBRL(v) {
    const n = parseFloat(v) || 0;
    return Store.formatBRL ? Store.formatBRL(n) : 'R$ ' + n.toFixed(2);
  },

  // ── Lista ──────────────────────────────────────────────────────────────────
  _renderLista() {
    const app = document.getElementById('app');
    const todas = Store.state.manutencoes || [];
    const filtradas = this.filtroStatus
      ? todas.filter(m => m.status === this.filtroStatus)
      : todas;

    const aAvaliar  = todas.filter(m => m.status === 'solicitada').length;
    const aAprovar  = todas.filter(m => m.status === 'pendente_aprovacao').length;
    const emManut   = todas.filter(m => m.status === 'aprovada').length;
    const atrasadas = todas.filter(m => this._isAtrasada(m)).length;

    const podeAvaliar = this._podeAvaliar();
    const podeAprovar = this._podeAprovar();

    app.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Manutenção de Equipamentos</h1>
          <p class="page-subtitle">${todas.length} registro${todas.length !== 1 ? 's' : ''}${podeAvaliar ? ' · você pode avaliar' : ''}${podeAprovar ? ' · você pode aprovar' : ''}</p>
        </div>
        <button class="btn btn-primary btn-lg" id="btnNovaManutencao">+ Solicitar Manutenção</button>
      </div>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:var(--sp-md);margin-bottom:var(--sp-lg);">
        ${this._statCard('A avaliar', aAvaliar, '#4F46E5', '📋')}
        ${this._statCard('Aguardando aprovação', aAprovar, '#D97706', '🟡')}
        ${this._statCard('Em manutenção', emManut, '#EA580C', '🔧')}
        ${this._statCard('Atrasados', atrasadas, atrasadas > 0 ? '#DC2626' : '#718096', '⏰')}
      </div>

      <div class="card mb-2xl" style="background:rgba(49,130,206,.05);border-left:4px solid var(--color-info);padding:var(--sp-sm) var(--sp-md);">
        <div style="font-size:13px;line-height:1.5;">
          <strong>ℹ️ Como funciona:</strong> qualquer pessoa <strong>solicita</strong> a manutenção (equipamento + problema).
          A <strong>equipe de compras</strong> avalia — define oficina, prazo e custo. A <strong>gerência</strong> aprova.
          Depois, registra-se o retorno do equipamento.
        </div>
      </div>

      <div class="card" style="padding:var(--sp-md);margin-bottom:var(--sp-lg);">
        <select class="form-control" id="filtroStatus" style="width:260px;">
          <option value="">Todos os status</option>
          <option value="solicitada"         ${this.filtroStatus === 'solicitada'         ? 'selected' : ''}>📋 A avaliar</option>
          <option value="pendente_aprovacao" ${this.filtroStatus === 'pendente_aprovacao' ? 'selected' : ''}>🟡 Aguardando aprovação</option>
          <option value="aprovada"           ${this.filtroStatus === 'aprovada'           ? 'selected' : ''}>🔧 Em manutenção</option>
          <option value="retornado"          ${this.filtroStatus === 'retornado'          ? 'selected' : ''}>✅ Retornado</option>
          <option value="rejeitada"          ${this.filtroStatus === 'rejeitada'          ? 'selected' : ''}>❌ Rejeitada</option>
          <option value="cancelada"          ${this.filtroStatus === 'cancelada'          ? 'selected' : ''}>⛔ Cancelada</option>
        </select>
      </div>

      <div class="card" style="padding:0;overflow:hidden;">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Equipamento</th>
                <th scope="col">Origem</th>
                <th scope="col">Oficina</th>
                <th scope="col">Enviado</th>
                <th scope="col">Previsão</th>
                <th scope="col">Retorno</th>
                <th scope="col">Status</th>
                <th scope="col">Ações</th>
              </tr>
            </thead>
            <tbody id="manutTbody">
              ${filtradas.length === 0
                ? `<tr><td colspan="8" class="text-center text-muted" style="padding:var(--sp-xl);">
                    ${this.filtroStatus ? 'Nenhum registro neste status' : 'Nenhuma solicitação. Clique em "+ Solicitar Manutenção".'}
                   </td></tr>`
                : filtradas.map(m => this._renderRow(m, podeAvaliar, podeAprovar)).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('btnNovaManutencao').addEventListener('click', () => this.showModalNova());
    document.getElementById('filtroStatus').addEventListener('change', e => {
      this.filtroStatus = e.target.value;
      this._renderLista();
    });
    this._attachRowListeners();
  },

  _renderRow(m, podeAvaliar, podeAprovar) {
    const atrasada = this._isAtrasada(m);
    const diasFora = m.status === 'aprovada' ? this._dias(m.dataEnvio) : null;

    const previsaoCell = m.dataRetornoPrevista
      ? `<span style="color:${atrasada ? '#DC2626' : 'inherit'};font-weight:${atrasada ? '700' : '400'};">${this._fmtDate(m.dataRetornoPrevista)}${atrasada ? ' ⏰' : ''}</span>`
      : '—';

    const acoes = [];
    if (m.status === 'solicitada') {
      if (podeAvaliar) acoes.push(`<button type="button" class="action-link btn-avaliar-man" data-id="${m.id}" style="color:#4F46E5;">Avaliar</button>`);
      acoes.push(`<button type="button" class="action-link btn-editar-man" data-id="${m.id}">Editar</button>`);
      acoes.push(`<button type="button" class="action-link btn-cancelar-man" data-id="${m.id}" style="color:#D97706;">Cancelar</button>`);
    } else if (m.status === 'pendente_aprovacao') {
      if (podeAprovar) acoes.push(`<button type="button" class="action-link btn-aprovar-man" data-id="${m.id}" style="color:#059669;">Aprovar / rejeitar</button>`);
      acoes.push(`<button type="button" class="action-link btn-cancelar-man" data-id="${m.id}" style="color:#D97706;">Cancelar</button>`);
    } else if (m.status === 'aprovada') {
      acoes.push(`<button type="button" class="action-link btn-retorno" data-id="${m.id}" style="color:#059669;">Registrar retorno</button>`);
      acoes.push(`<button type="button" class="action-link btn-cancelar-man" data-id="${m.id}" style="color:#D97706;">Cancelar</button>`);
    }
    acoes.push(`<button type="button" class="action-link danger btn-excluir-man" data-id="${m.id}">Excluir</button>`);

    return `<tr>
      <td>
        <strong>${escapeHtml(m.equipamento || '—')}</strong>
        ${m.problema ? `<div style="font-size:13px;color:var(--color-text-muted);">${escapeHtml(m.problema)}</div>` : ''}
        ${m.solicitanteNome ? `<div style="font-size:12px;color:var(--color-text-muted);">por ${escapeHtml(m.solicitanteNome)}</div>` : ''}
      </td>
      <td style="font-size:14px;">${this._nomeContrato(m.contractId)}</td>
      <td style="font-size:14px;">${escapeHtml(m.oficina || '—')}</td>
      <td style="font-size:14px;">
        ${this._fmtDate(m.dataEnvio)}
        ${diasFora != null && diasFora >= 0 ? `<div style="font-size:12px;color:var(--color-text-muted);">há ${diasFora} dia${diasFora !== 1 ? 's' : ''}</div>` : ''}
      </td>
      <td style="font-size:14px;">${previsaoCell}</td>
      <td style="font-size:14px;">${m.status === 'retornado' ? this._fmtDate(m.dataRetorno) : '—'}</td>
      <td>${this._badgeStatus(m.status)}</td>
      <td><div class="actions-cell">${acoes.join('')}</div></td>
    </tr>`;
  },

  _attachRowListeners() {
    document.querySelectorAll('.btn-avaliar-man').forEach(b =>
      b.addEventListener('click', e => { e.stopPropagation(); this.showModalAvaliar(e.target.dataset.id); }));
    document.querySelectorAll('.btn-aprovar-man').forEach(b =>
      b.addEventListener('click', e => { e.stopPropagation(); this.showModalAprovar(e.target.dataset.id); }));
    document.querySelectorAll('.btn-retorno').forEach(b =>
      b.addEventListener('click', e => { e.stopPropagation(); this.showModalRetorno(e.target.dataset.id); }));
    document.querySelectorAll('.btn-editar-man').forEach(b =>
      b.addEventListener('click', e => { e.stopPropagation(); this.showModalNova(e.target.dataset.id); }));
    document.querySelectorAll('.btn-cancelar-man').forEach(b =>
      b.addEventListener('click', e => { e.stopPropagation(); this._cancelar(e.target.dataset.id); }));
    document.querySelectorAll('.btn-excluir-man').forEach(b =>
      b.addEventListener('click', e => { e.stopPropagation(); this._excluir(e.target.dataset.id); }));
  },

  _modalShell(id, titulo, sub, corpo, btnId, btnLabel) {
    return `
      <div class="modal-overlay" id="${id}">
        <div class="modal" style="width:560px;max-width:95vw;">
          <div class="modal-header">
            <div>
              <h2 class="modal-title">${titulo}</h2>
              ${sub ? `<div style="font-size:13px;color:var(--color-text-muted);margin-top:4px;">${sub}</div>` : ''}
            </div>
            <button class="modal-close">✕</button>
          </div>
          ${corpo}
          <div class="modal-footer">
            <button class="btn btn-secondary modal-cancel">Cancelar</button>
            <button class="btn btn-primary" id="${btnId}">${btnLabel}</button>
          </div>
        </div>
      </div>`;
  },

  _wire(overlayId, btnId, onSubmit) {
    const overlay = document.getElementById(overlayId);
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    overlay.querySelector('.modal-cancel').addEventListener('click', close);
    const btn = document.getElementById(btnId);
    btn.addEventListener('click', async () => {
      if (btn.disabled) return; // anti-duplo-clique
      const txt = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Salvando…';
      try {
        await onSubmit();
        close();
        this.render();
      } catch (e) {
        window.showToast(e.message, 'error');
        btn.disabled = false;
        btn.textContent = txt;
      }
    });
    return { overlay, close, btn };
  },

  async _fetchJson(url, method, payload) {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    });
    if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
    return res.json();
  },

  // ── 1ª etapa: solicitar / editar ───────────────────────────────────────────
  showModalNova(id) {
    const m = id ? (Store.state.manutencoes || []).find(x => x.id === id) : null;
    const contratos = (Store.state.contracts || []).filter(c => c.status === 'ativo' || c.status === 'pausado');
    const origemAtual = m?.contractId || '';

    const corpo = `
      <form id="formManutencao" class="modal-content">
        <div class="form-group">
          <label class="form-label">Equipamento *</label>
          <input class="form-control" name="equipamento" value="${escapeHtml(m?.equipamento || '')}" placeholder="Ex: Máquina de solda Bambozzi" required>
        </div>
        <div class="form-group">
          <label class="form-label">Problema / defeito relatado</label>
          <textarea class="form-control" name="problema" rows="2" placeholder="O que está acontecendo com o equipamento?">${escapeHtml(m?.problema || '')}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Origem do equipamento</label>
          <select class="form-control" name="contractId">
            <option value="">🏢 Sede</option>
            ${contratos.map(c => `<option value="${escapeHtml(c.id)}" ${origemAtual === c.id ? 'selected' : ''}>🏗️ ${escapeHtml(c.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Observações</label>
          <textarea class="form-control" name="observacoes" rows="2" placeholder="Notas adicionais (opcional)">${escapeHtml(m?.observacoes || '')}</textarea>
        </div>
      </form>`;

    document.body.insertAdjacentHTML('beforeend', this._modalShell(
      'modalManutencao',
      m ? 'Editar Solicitação' : 'Solicitar Manutenção',
      'A equipe de compras vai definir oficina, prazo e custo.',
      corpo, 'btnSalvarManutencao', m ? 'Salvar' : 'Enviar solicitação',
    ));

    this._wire('modalManutencao', 'btnSalvarManutencao', async () => {
      const fd = new FormData(document.getElementById('formManutencao'));
      const equipamento = (fd.get('equipamento') || '').trim();
      if (!equipamento) throw new Error('Informe o equipamento');
      const payload = {
        equipamento,
        problema: (fd.get('problema') || '').trim(),
        contractId: fd.get('contractId') || null,
        observacoes: (fd.get('observacoes') || '').trim(),
      };
      await this._fetchJson(m ? `/api/manutencoes/${m.id}` : '/api/manutencoes', m ? 'PUT' : 'POST', payload);
      window.showToast(m ? 'Solicitação atualizada' : 'Manutenção solicitada', 'success');
    });
  },

  // ── 2ª etapa: equipe de compras avalia ─────────────────────────────────────
  showModalAvaliar(id) {
    const m = (Store.state.manutencoes || []).find(x => x.id === id);
    if (!m) return;

    const corpo = `
      <form id="formAvaliar" class="modal-content">
        <div style="background:var(--color-bg);border-radius:6px;padding:var(--sp-sm) var(--sp-md);margin-bottom:var(--sp-md);font-size:14px;">
          <strong>${escapeHtml(m.equipamento)}</strong>
          ${m.problema ? `<div style="color:var(--color-text-muted);font-size:13px;">${escapeHtml(m.problema)}</div>` : ''}
          <div style="color:var(--color-text-muted);font-size:13px;">Origem: ${this._nomeContrato(m.contractId)}</div>
        </div>
        <div class="form-group">
          <label class="form-label">Oficina / empresa que vai reparar *</label>
          <input class="form-control" name="oficina" value="${escapeHtml(m.oficina || '')}" placeholder="Quem vai consertar" required>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Custo estimado (R$)</label>
            <input class="form-control" name="custoEstimado" type="number" step="0.01" min="0" value="${m.custoEstimado || ''}" placeholder="0,00">
          </div>
          <div class="form-group">
            <label class="form-label">Data de envio</label>
            <input class="form-control" name="dataEnvio" type="date" value="${m.dataEnvio ? String(m.dataEnvio).slice(0,10) : this._hoje()}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Previsão de retorno</label>
          <input class="form-control" name="dataRetornoPrevista" type="date" value="${m.dataRetornoPrevista ? String(m.dataRetornoPrevista).slice(0,10) : ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Observações da avaliação</label>
          <textarea class="form-control" name="observacoes" rows="2" placeholder="Diagnóstico, garantia, prazo combinado...">${escapeHtml(m.observacoes || '')}</textarea>
        </div>
      </form>`;

    document.body.insertAdjacentHTML('beforeend', this._modalShell(
      'modalAvaliar', 'Avaliar Manutenção',
      'Defina oficina, prazo e custo para a aprovação gerencial.',
      corpo, 'btnConfirmarAvaliar', 'Enviar para aprovação',
    ));

    this._wire('modalAvaliar', 'btnConfirmarAvaliar', async () => {
      const fd = new FormData(document.getElementById('formAvaliar'));
      const oficina = (fd.get('oficina') || '').trim();
      if (!oficina) throw new Error('Informe a oficina / empresa');
      await this._fetchJson(`/api/manutencoes/${id}/avaliar`, 'POST', {
        oficina,
        custoEstimado: parseFloat(fd.get('custoEstimado')) || 0,
        dataEnvio: fd.get('dataEnvio') || null,
        dataRetornoPrevista: fd.get('dataRetornoPrevista') || null,
        observacoes: (fd.get('observacoes') || '').trim(),
      });
      window.showToast('Avaliação enviada para aprovação', 'success');
    });
  },

  // ── 3ª etapa: gerência aprova / rejeita ────────────────────────────────────
  showModalAprovar(id) {
    const m = (Store.state.manutencoes || []).find(x => x.id === id);
    if (!m) return;

    const linha = (rot, val) => `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--color-border);font-size:14px;">
      <span style="color:var(--color-text-muted);">${rot}</span><strong>${val}</strong></div>`;

    const corpo = `
      <form id="formAprovar" class="modal-content">
        <div style="margin-bottom:var(--sp-md);">
          ${linha('Equipamento', escapeHtml(m.equipamento))}
          ${m.problema ? linha('Problema', escapeHtml(m.problema)) : ''}
          ${linha('Oficina', escapeHtml(m.oficina || '—'))}
          ${linha('Custo estimado', this._fmtBRL(m.custoEstimado))}
          ${linha('Envio', this._fmtDate(m.dataEnvio))}
          ${linha('Previsão de retorno', this._fmtDate(m.dataRetornoPrevista))}
          ${m.avaliadorNome ? linha('Avaliado por', escapeHtml(m.avaliadorNome)) : ''}
        </div>
        <div class="form-group">
          <label class="form-label">Motivo (preencha apenas se for rejeitar)</label>
          <textarea class="form-control" name="motivo" rows="2" placeholder="Motivo da rejeição..."></textarea>
        </div>
      </form>`;

    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal-overlay" id="modalAprovar">
        <div class="modal" style="width:520px;max-width:95vw;">
          <div class="modal-header">
            <div>
              <h2 class="modal-title">Aprovar Manutenção</h2>
              <div style="font-size:13px;color:var(--color-text-muted);margin-top:4px;">Pré-avaliada pela equipe de compras.</div>
            </div>
            <button class="modal-close">✕</button>
          </div>
          ${corpo}
          <div class="modal-footer">
            <button class="btn btn-secondary modal-cancel">Cancelar</button>
            <button class="btn btn-danger" id="btnRejeitar">Rejeitar</button>
            <button class="btn btn-primary" id="btnAprovar">Aprovar</button>
          </div>
        </div>
      </div>`);

    const overlay = document.getElementById('modalAprovar');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    overlay.querySelector('.modal-cancel').addEventListener('click', close);
    const btnA = document.getElementById('btnAprovar');
    const btnR = document.getElementById('btnRejeitar');
    const trava = () => { btnA.disabled = true; btnR.disabled = true; };
    const destrava = () => { btnA.disabled = false; btnR.disabled = false; };

    btnA.addEventListener('click', async () => {
      if (btnA.disabled) return;
      trava(); btnA.textContent = 'Aprovando…';
      try {
        await this._fetchJson(`/api/manutencoes/${id}/aprovar`, 'POST', {});
        window.showToast('Manutenção aprovada', 'success');
        close(); this.render();
      } catch (e) { window.showToast(e.message, 'error'); destrava(); btnA.textContent = 'Aprovar'; }
    });
    btnR.addEventListener('click', async () => {
      if (btnR.disabled) return;
      const motivo = (new FormData(document.getElementById('formAprovar')).get('motivo') || '').trim();
      if (!confirm('Rejeitar esta solicitação de manutenção?')) return;
      trava(); btnR.textContent = 'Rejeitando…';
      try {
        await this._fetchJson(`/api/manutencoes/${id}/rejeitar`, 'POST', { motivo });
        window.showToast('Manutenção rejeitada', 'success');
        close(); this.render();
      } catch (e) { window.showToast(e.message, 'error'); destrava(); btnR.textContent = 'Rejeitar'; }
    });
  },

  // ── Encerramento: registrar retorno ────────────────────────────────────────
  showModalRetorno(id) {
    const m = (Store.state.manutencoes || []).find(x => x.id === id);
    if (!m) return;

    const corpo = `
      <form id="formRetorno" class="modal-content">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Data de retorno *</label>
            <input class="form-control" name="dataRetorno" type="date" value="${this._hoje()}" required>
          </div>
          <div class="form-group">
            <label class="form-label">Custo final (R$)</label>
            <input class="form-control" name="custo" type="number" step="0.01" min="0" value="${m.custoEstimado || ''}" placeholder="0,00">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Observações do retorno</label>
          <textarea class="form-control" name="observacoes" rows="3" placeholder="O que foi feito, condição do equipamento, garantia...">${escapeHtml(m.observacoes || '')}</textarea>
        </div>
      </form>`;

    document.body.insertAdjacentHTML('beforeend', this._modalShell(
      'modalRetorno', 'Registrar Retorno',
      `${escapeHtml(m.equipamento)} · oficina: ${escapeHtml(m.oficina || '—')}`,
      corpo, 'btnConfirmarRetorno', 'Confirmar retorno',
    ));

    this._wire('modalRetorno', 'btnConfirmarRetorno', async () => {
      const fd = new FormData(document.getElementById('formRetorno'));
      const dataRetorno = fd.get('dataRetorno') || '';
      if (!dataRetorno) throw new Error('Informe a data de retorno');
      await this._fetchJson(`/api/manutencoes/${id}/retorno`, 'POST', {
        dataRetorno,
        custo: parseFloat(fd.get('custo')) || 0,
        observacoes: (fd.get('observacoes') || '').trim(),
      });
      window.showToast('Retorno registrado', 'success');
    });
  },

  async _cancelar(id) {
    if (!confirm('Cancelar esta manutenção?')) return;
    try {
      await this._fetchJson(`/api/manutencoes/${id}/cancelar`, 'POST', {});
      window.showToast('Manutenção cancelada', 'success');
      this.render();
    } catch (e) { window.showToast(e.message, 'error'); }
  },

  async _excluir(id) {
    if (!confirm('Excluir este registro de manutenção? Esta ação não pode ser desfeita.')) return;
    try {
      const res = await fetch(`/api/manutencoes/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      window.showToast('Registro excluído', 'success');
      this.render();
    } catch (e) { window.showToast(e.message, 'error'); }
  },
};
