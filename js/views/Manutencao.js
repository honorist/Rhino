// Manutenção de Equipamentos — registra equipamentos enviados para reparo e
// acompanha o retorno. Ciclo: em_manutencao → retornado (ou cancelada).
window.Manutencao = {
  filtroStatus: '',

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

  // Dias entre duas datas (de → até; até default = hoje).
  _dias(deStr, ateStr) {
    if (!deStr) return null;
    const de = new Date(String(deStr).slice(0, 10) + 'T12:00:00');
    const ate = new Date((ateStr ? String(ateStr).slice(0, 10) : this._hoje()) + 'T12:00:00');
    if (isNaN(de) || isNaN(ate)) return null;
    return Math.floor((ate - de) / 86400000);
  },

  // Em manutenção e já passou da previsão de retorno.
  _isAtrasada(m) {
    return m.status === 'em_manutencao'
      && m.dataRetornoPrevista
      && String(m.dataRetornoPrevista).slice(0, 10) < this._hoje();
  },

  _statusCfg(status) {
    return {
      em_manutencao: { label: '🔧 Em manutenção', bg: '#FEF3C7', cor: '#92400E' },
      retornado:     { label: '✅ Retornado',     bg: '#D1FAE5', cor: '#065F46' },
      cancelada:     { label: '⛔ Cancelada',     bg: '#E5E7EB', cor: '#374151' },
    }[status] || { label: status || '—', bg: '#E5E7EB', cor: '#374151' };
  },

  _badgeStatus(status) {
    const c = this._statusCfg(status);
    return `<span class="badge" style="background:${c.bg};color:${c.cor};">${c.label}</span>`;
  },

  _statCard(label, value, cor, icon) {
    return `<div class="card" style="padding:var(--sp-lg);text-align:center;">
      <div style="font-size:28px;color:${cor};margin-bottom:4px;">${icon}</div>
      <div style="font-size:22px;font-weight:700;color:${cor};">${value}</div>
      <div style="font-size:15px;color:var(--color-text-muted);">${label}</div>
    </div>`;
  },

  _nomeContrato(contractId) {
    if (!contractId) return '🏢 Sede';
    const c = (Store.state.contracts || []).find(x => x.id === contractId);
    return c ? '🏗️ ' + escapeHtml(c.name) : '🏗️ Obra';
  },

  // ── Lista ──────────────────────────────────────────────────────────────────
  _renderLista() {
    const app = document.getElementById('app');
    const todas = Store.state.manutencoes || [];
    const filtradas = this.filtroStatus
      ? todas.filter(m => m.status === this.filtroStatus)
      : todas;

    const emManutencao = todas.filter(m => m.status === 'em_manutencao').length;
    const atrasadas    = todas.filter(m => this._isAtrasada(m)).length;
    const retornadas   = todas.filter(m => m.status === 'retornado').length;

    app.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Manutenção de Equipamentos</h1>
          <p class="page-subtitle">${todas.length} registro${todas.length !== 1 ? 's' : ''}</p>
        </div>
        <button class="btn btn-primary btn-lg" id="btnNovaManutencao">+ Nova Manutenção</button>
      </div>

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:var(--sp-md);margin-bottom:var(--sp-lg);">
        ${this._statCard('Em manutenção', emManutencao, '#D97706', '🔧')}
        ${this._statCard('Atrasados', atrasadas, atrasadas > 0 ? '#DC2626' : '#718096', '⏰')}
        ${this._statCard('Retornados', retornadas, '#059669', '✅')}
      </div>

      <div class="card" style="padding:var(--sp-md);margin-bottom:var(--sp-lg);">
        <div style="display:flex;gap:var(--sp-md);align-items:center;flex-wrap:wrap;">
          <select class="form-control" id="filtroStatus" style="width:240px;">
            <option value="">Todos os status</option>
            <option value="em_manutencao" ${this.filtroStatus === 'em_manutencao' ? 'selected' : ''}>🔧 Em manutenção</option>
            <option value="retornado"     ${this.filtroStatus === 'retornado'     ? 'selected' : ''}>✅ Retornado</option>
            <option value="cancelada"     ${this.filtroStatus === 'cancelada'     ? 'selected' : ''}>⛔ Cancelada</option>
          </select>
        </div>
      </div>

      <div class="card" style="padding:0;overflow:hidden;">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Equipamento</th>
                <th>Origem</th>
                <th>Oficina</th>
                <th>Enviado em</th>
                <th>Previsão</th>
                <th>Retornou em</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              ${filtradas.length === 0
                ? `<tr><td colspan="8" class="text-center text-muted" style="padding:var(--sp-xl);">
                    ${this.filtroStatus ? 'Nenhum registro neste status' : 'Nenhum equipamento em manutenção. Clique em "+ Nova Manutenção".'}
                   </td></tr>`
                : filtradas.map(m => this._renderRow(m)).join('')}
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

  _renderRow(m) {
    const atrasada = this._isAtrasada(m);
    const diasFora = m.status === 'em_manutencao' ? this._dias(m.dataEnvio) : null;

    const previsaoCell = m.dataRetornoPrevista
      ? `<span style="color:${atrasada ? '#DC2626' : 'inherit'};font-weight:${atrasada ? '700' : '400'};">${this._fmtDate(m.dataRetornoPrevista)}${atrasada ? ' ⏰' : ''}</span>`
      : '—';

    const acoes = [];
    if (m.status === 'em_manutencao') {
      acoes.push(`<a class="action-link btn-retorno" data-id="${m.id}" style="color:#059669;">Registrar retorno</a>`);
      acoes.push(`<a class="action-link btn-editar-man" data-id="${m.id}">Editar</a>`);
      acoes.push(`<a class="action-link btn-cancelar-man" data-id="${m.id}" style="color:#D97706;">Cancelar</a>`);
    }
    acoes.push(`<a class="action-link danger btn-excluir-man" data-id="${m.id}">Excluir</a>`);

    return `<tr>
      <td>
        <strong>${escapeHtml(m.equipamento || '—')}</strong>
        ${m.problema ? `<div style="font-size:13px;color:var(--color-text-muted);">${escapeHtml(m.problema)}</div>` : ''}
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
    document.querySelectorAll('.btn-retorno').forEach(b =>
      b.addEventListener('click', e => { e.stopPropagation(); this.showModalRetorno(e.target.dataset.id); }));
    document.querySelectorAll('.btn-editar-man').forEach(b =>
      b.addEventListener('click', e => { e.stopPropagation(); this.showModalNova(e.target.dataset.id); }));
    document.querySelectorAll('.btn-cancelar-man').forEach(b =>
      b.addEventListener('click', e => { e.stopPropagation(); this._cancelar(e.target.dataset.id); }));
    document.querySelectorAll('.btn-excluir-man').forEach(b =>
      b.addEventListener('click', e => { e.stopPropagation(); this._excluir(e.target.dataset.id); }));
  },

  // ── Modal: nova / editar manutenção ────────────────────────────────────────
  showModalNova(id) {
    const m = id ? (Store.state.manutencoes || []).find(x => x.id === id) : null;
    const contratos = (Store.state.contracts || []).filter(c => c.status === 'ativo' || c.status === 'pausado');
    const origemAtual = m?.contractId || '';

    const html = `
      <div class="modal-overlay" id="modalManutencao">
        <div class="modal" style="width:640px;max-width:95vw;">
          <div class="modal-header">
            <h2 class="modal-title">${m ? 'Editar Manutenção' : 'Nova Manutenção'}</h2>
            <button class="modal-close">✕</button>
          </div>
          <form id="formManutencao" class="modal-content">
            <div class="form-group">
              <label class="form-label">Equipamento *</label>
              <input class="form-control" name="equipamento" value="${escapeHtml(m?.equipamento || '')}" placeholder="Ex: Máquina de solda Bambozzi" required>
            </div>
            <div class="form-group">
              <label class="form-label">Problema / defeito relatado</label>
              <textarea class="form-control" name="problema" rows="2" placeholder="O que precisa ser reparado?">${escapeHtml(m?.problema || '')}</textarea>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Origem do equipamento</label>
                <select class="form-control" name="contractId">
                  <option value="">🏢 Sede</option>
                  ${contratos.map(c => `<option value="${escapeHtml(c.id)}" ${origemAtual === c.id ? 'selected' : ''}>🏗️ ${escapeHtml(c.name)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Oficina / empresa</label>
                <input class="form-control" name="oficina" value="${escapeHtml(m?.oficina || '')}" placeholder="Quem vai consertar">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Data de envio *</label>
                <input class="form-control" name="dataEnvio" type="date" value="${m ? String(m.dataEnvio || '').slice(0, 10) : this._hoje()}" required>
              </div>
              <div class="form-group">
                <label class="form-label">Previsão de retorno</label>
                <input class="form-control" name="dataRetornoPrevista" type="date" value="${m ? String(m.dataRetornoPrevista || '').slice(0, 10) : ''}">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Observações</label>
              <textarea class="form-control" name="observacoes" rows="2" placeholder="Notas adicionais (opcional)">${escapeHtml(m?.observacoes || '')}</textarea>
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelarModal">Cancelar</button>
            <button class="btn btn-primary" id="btnSalvarManutencao">${m ? 'Salvar' : 'Registrar envio'}</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalManutencao');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnCancelarModal').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    const btn = document.getElementById('btnSalvarManutencao');
    btn.addEventListener('click', async () => {
      if (btn.disabled) return; // anti-duplo-clique
      const fd = new FormData(document.getElementById('formManutencao'));
      const equipamento = (fd.get('equipamento') || '').trim();
      if (!equipamento) { window.showToast('Informe o equipamento', 'error'); return; }
      const dataEnvio = fd.get('dataEnvio') || '';
      if (!dataEnvio) { window.showToast('Informe a data de envio', 'error'); return; }

      const payload = {
        equipamento,
        problema: (fd.get('problema') || '').trim(),
        contractId: fd.get('contractId') || null,
        oficina: (fd.get('oficina') || '').trim(),
        dataEnvio,
        dataRetornoPrevista: fd.get('dataRetornoPrevista') || null,
        observacoes: (fd.get('observacoes') || '').trim(),
      };

      const txtOrig = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Salvando…';
      try {
        const url = m ? `/api/manutencoes/${m.id}` : '/api/manutencoes';
        const res = await fetch(url, {
          method: m ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
        window.showToast(m ? 'Manutenção atualizada' : 'Manutenção registrada', 'success');
        close();
        this.render();
      } catch (e) {
        window.showToast(e.message, 'error');
        btn.disabled = false;
        btn.textContent = txtOrig;
      }
    });
  },

  // ── Modal: registrar retorno ───────────────────────────────────────────────
  showModalRetorno(id) {
    const m = (Store.state.manutencoes || []).find(x => x.id === id);
    if (!m) return;

    const html = `
      <div class="modal-overlay" id="modalRetorno">
        <div class="modal" style="width:520px;max-width:95vw;">
          <div class="modal-header">
            <div>
              <h2 class="modal-title">Registrar Retorno</h2>
              <div style="font-size:13px;color:var(--color-text-muted);margin-top:4px;">${escapeHtml(m.equipamento)} · enviado em ${this._fmtDate(m.dataEnvio)}</div>
            </div>
            <button class="modal-close">✕</button>
          </div>
          <form id="formRetorno" class="modal-content">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Data de retorno *</label>
                <input class="form-control" name="dataRetorno" type="date" value="${this._hoje()}" required>
              </div>
              <div class="form-group">
                <label class="form-label">Custo do reparo (R$)</label>
                <input class="form-control" name="custo" type="number" step="0.01" min="0" placeholder="0,00">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Observações do retorno</label>
              <textarea class="form-control" name="observacoes" rows="3" placeholder="O que foi feito, condição do equipamento, garantia...">${escapeHtml(m.observacoes || '')}</textarea>
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelarRetorno">Cancelar</button>
            <button class="btn btn-primary" id="btnConfirmarRetorno">Confirmar retorno</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalRetorno');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnCancelarRetorno').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    const btn = document.getElementById('btnConfirmarRetorno');
    btn.addEventListener('click', async () => {
      if (btn.disabled) return; // anti-duplo-clique
      const fd = new FormData(document.getElementById('formRetorno'));
      const dataRetorno = fd.get('dataRetorno') || '';
      if (!dataRetorno) { window.showToast('Informe a data de retorno', 'error'); return; }

      const txtOrig = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Salvando…';
      try {
        const res = await fetch(`/api/manutencoes/${id}/retorno`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dataRetorno,
            custo: parseFloat(fd.get('custo')) || 0,
            observacoes: (fd.get('observacoes') || '').trim(),
          }),
        });
        if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
        window.showToast('Retorno registrado', 'success');
        close();
        this.render();
      } catch (e) {
        window.showToast(e.message, 'error');
        btn.disabled = false;
        btn.textContent = txtOrig;
      }
    });
  },

  async _cancelar(id) {
    if (!confirm('Cancelar esta manutenção?')) return;
    try {
      const res = await fetch(`/api/manutencoes/${id}/cancelar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
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
