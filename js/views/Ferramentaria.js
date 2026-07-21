/**
 * View: Ferramentaria + controle de calibração (#/ferramentaria)
 *
 * Catálogo GLOBAL (não por obra) de ferramentas e instrumentos da empresa, com
 * status operacional (disponível / em uso / em calibração / inativa) e, para os
 * instrumentos de medição, o controle de CALIBRAÇÃO: cada linha traz um badge de
 * situação (em dia / vencendo / vencida) e "abrir" mostra os dados + o histórico
 * de calibrações. A regra (próxima calibração, situação, resumo) mora no backend
 * (lib/ferramenta.js) — a view só apresenta o que o servidor já calculou.
 *
 * Busca dados direto via fetch (não depende do Store) para ser autocontida.
 */
window.Ferramentaria = {
  busca: '',
  filtroStatus: 'todos',
  _lista: [],
  _resumo: {},
  _recursos: [],

  STATUS: [
    { v: 'disponivel', l: 'Disponível' },
    { v: 'em_uso', l: 'Em uso' },
    { v: 'em_calibracao', l: 'Em calibração' },
    { v: 'inativa', l: 'Inativa' },
  ],
  RESULTADOS: [
    { v: 'aprovado', l: 'Aprovado' },
    { v: 'reprovado', l: 'Reprovado' },
  ],

  _fmtData(s) {
    if (!s) return '—';
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : escapeHtml(String(s));
  },

  _nomeResp(id) {
    if (!id) return '';
    const r = this._recursos.find((x) => x.id === id);
    return r ? r.nome || r.id : '';
  },

  _pill(label, bg, fg, title) {
    return `<span class="badge" ${title ? `title="${escapeHtml(title)}"` : ''} style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;background:${bg};color:${fg};">${escapeHtml(label)}</span>`;
  },

  _statusBadge(st) {
    const map = {
      disponivel: ['Disponível', '#d1fae5', '#047857'],
      em_uso: ['Em uso', '#dbeafe', '#1e40af'],
      em_calibracao: ['Em calibração', '#fef3c7', '#b45309'],
      inativa: ['Inativa', '#f3f4f6', '#6b7280'],
    };
    const [lbl, bg, fg] = map[st] || [st || '—', 'var(--color-surface-2)', 'var(--color-text-muted)'];
    return this._pill(lbl, bg, fg);
  },

  _situacaoBadge(f) {
    if (!f.requerCalibracao) return this._pill('não calibra', '#f3f4f6', '#6b7280');
    const map = {
      em_dia: ['✓ em dia', '#d1fae5', '#047857'],
      vencendo: ['⚠ vencendo', '#fef3c7', '#b45309'],
      vencida: ['✗ vencida', '#fee2e2', '#b91c1c'],
    };
    const [lbl, bg, fg] = map[f.situacaoCalibracao] || ['—', 'var(--color-surface-2)', 'var(--color-text-muted)'];
    const title = f.proximaCalibracao ? `Próxima calibração: ${this._fmtData(f.proximaCalibracao)}` : 'Sem calibração registrada';
    return this._pill(lbl, bg, fg, title);
  },

  async render() {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading-spinner">Carregando ferramentas...</div>';
    try {
      const [resF, resR] = await Promise.all([
        fetch('/api/ferramentas'),
        fetch('/api/recursos'),
      ]);
      if (!resF.ok) throw new Error('HTTP ' + resF.status);
      const data = await resF.json();
      this._lista = data.ferramentas || [];
      this._resumo = data.resumo || {};
      const rData = resR.ok ? await resR.json() : {};
      this._recursos = Array.isArray(rData) ? rData : rData.recursos || [];

      this._draw();
    } catch (e) {
      console.error('[Ferramentaria] erro:', e);
      app.innerHTML = `<div class="error-banner">Erro ao carregar ferramentas: ${escapeHtml(e.message)}</div>`;
    }
  },

  _draw() {
    const app = document.getElementById('app');
    const termo = (this.busca || '').toLowerCase().trim();
    let lista = this._lista;
    if (termo) {
      lista = lista.filter(
        (f) =>
          (f.nome || '').toLowerCase().includes(termo) ||
          (f.codigo || '').toLowerCase().includes(termo) ||
          (f.tipo || '').toLowerCase().includes(termo)
      );
    }
    if (this.filtroStatus !== 'todos') lista = lista.filter((f) => f.status === this.filtroStatus);

    const total = this._lista.length;
    const sit = this._resumo.porSituacao || {};
    const requer = this._resumo.requerCalibracao || 0;

    const kpis = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:var(--sp-lg);">
        <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;border-left:3px solid #3b82f6;">
          <div class="text-muted font-sm">Ferramentas</div>
          <div style="font-size:18px;font-weight:700;">${total}</div>
        </div>
        <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;border-left:3px solid #8b5cf6;">
          <div class="text-muted font-sm">Exigem calibração</div>
          <div style="font-size:18px;font-weight:700;">${requer}</div>
        </div>
        <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;border-left:3px solid #f59e0b;">
          <div class="text-muted font-sm">Calibração vencendo</div>
          <div style="font-size:18px;font-weight:700;color:${(sit.vencendo || 0) > 0 ? '#b45309' : 'inherit'};">${sit.vencendo || 0}</div>
        </div>
        <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;border-left:3px solid #dc2626;">
          <div class="text-muted font-sm">Calibração vencida</div>
          <div style="font-size:18px;font-weight:700;color:${(sit.vencida || 0) > 0 ? 'var(--color-danger)' : 'inherit'};">${sit.vencida || 0}</div>
        </div>
      </div>
    `;

    app.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Ferramentaria</h1>
          <p class="page-subtitle">${total} ferramenta${total !== 1 ? 's' : ''} · controle de calibração de instrumentos</p>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="btn btn-primary btn-lg" id="btnNovaFerr">+ Nova Ferramenta</button>
        </div>
      </div>

      ${kpis}

      <div class="card" style="padding:var(--sp-md);margin-bottom:var(--sp-lg);display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <input class="form-control" id="inputBuscaFerr" placeholder="🔍 Buscar por nome, código ou tipo..." value="${escapeHtml(this.busca)}" style="flex:1;min-width:220px;">
        <select class="form-control" id="filtroStatusFerr" style="max-width:200px;">
          <option value="todos" ${this.filtroStatus === 'todos' ? 'selected' : ''}>Todos os status</option>
          ${this.STATUS.map((s) => `<option value="${s.v}" ${this.filtroStatus === s.v ? 'selected' : ''}>${escapeHtml(s.l)}</option>`).join('')}
        </select>
      </div>

      ${
        lista.length === 0
          ? `<div class="card" style="padding:var(--sp-xl);text-align:center;color:var(--color-text-muted);">
               <div style="font-size:44px;margin-bottom:8px;opacity:.6;">🔧</div>
               <div style="font-weight:600;font-size:16px;margin-bottom:4px;">Nenhuma ferramenta encontrada</div>
               <div style="font-size:13px;">Cadastre ferramentas e instrumentos — os que exigem calibração terão o vencimento acompanhado aqui.</div>
             </div>`
          : `<div class="card" style="padding:0;">
               <div class="table-wrap">
                 <table>
                   <thead>
                     <tr>
                       <th scope="col">Ferramenta</th>
                       <th scope="col" style="width:110px;">Código</th>
                       <th scope="col" style="width:130px;">Tipo</th>
                       <th scope="col">Localização</th>
                       <th scope="col">Responsável</th>
                       <th scope="col" style="width:130px;text-align:center;">Status</th>
                       <th scope="col" style="width:140px;text-align:center;">Calibração</th>
                       <th scope="col" style="width:170px;">Ações</th>
                     </tr>
                   </thead>
                   <tbody>${lista.map((f) => this._renderRow(f)).join('')}</tbody>
                 </table>
               </div>
             </div>`
      }
    `;
    this._attachEvents();
  },

  _renderRow(f) {
    const resp = this._nomeResp(f.responsavelId);
    const nCal = Array.isArray(f.calibracoes) ? f.calibracoes.length : 0;
    return `
      <tr style="${f.status === 'inativa' ? 'opacity:.6;' : ''}">
        <td><strong>${escapeHtml(f.nome || '—')}</strong>${nCal ? `<div class="text-muted font-sm">${nCal} calibraç${nCal !== 1 ? 'ões' : 'ão'}</div>` : ''}</td>
        <td>${escapeHtml(f.codigo || '—')}</td>
        <td>${escapeHtml(f.tipo || '—')}</td>
        <td>${escapeHtml(f.localizacao || '—')}</td>
        <td>${resp ? escapeHtml(resp) : '<span class="text-muted">—</span>'}</td>
        <td style="text-align:center;">${this._statusBadge(f.status)}</td>
        <td style="text-align:center;">${this._situacaoBadge(f)}</td>
        <td>
          <div class="actions-cell">
            <button type="button" class="action-link btn-detalhe-ferr" data-id="${escapeHtml(f.id)}">Detalhes</button>
            <button type="button" class="action-link btn-editar-ferr" data-id="${escapeHtml(f.id)}">Editar</button>
            <button type="button" class="action-link danger btn-excluir-ferr" data-id="${escapeHtml(f.id)}">Excluir</button>
          </div>
        </td>
      </tr>
    `;
  },

  _attachEvents() {
    const btnNova = document.getElementById('btnNovaFerr');
    if (btnNova) btnNova.addEventListener('click', () => this.showModal(null));

    const inputBusca = document.getElementById('inputBuscaFerr');
    if (inputBusca) {
      let timer;
      inputBusca.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          this.busca = inputBusca.value;
          this._draw();
        }, 250);
      });
    }
    const filtro = document.getElementById('filtroStatusFerr');
    if (filtro) filtro.addEventListener('change', () => {
      this.filtroStatus = filtro.value;
      this._draw();
    });

    document.querySelectorAll('.btn-detalhe-ferr').forEach((b) =>
      b.addEventListener('click', () => this.showDetalhe(b.dataset.id))
    );
    document.querySelectorAll('.btn-editar-ferr').forEach((b) =>
      b.addEventListener('click', () => {
        const f = this._lista.find((x) => x.id === b.dataset.id);
        if (f) this.showModal(f);
      })
    );
    document.querySelectorAll('.btn-excluir-ferr').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirm('Excluir esta ferramenta? O histórico de calibrações será apagado junto.')) return;
        try {
          const res = await fetch('/api/ferramentas/' + b.dataset.id, { method: 'DELETE' });
          if (!res.ok) throw new Error(await res.text());
          if (window.showToast) showToast('Ferramenta excluída', 'success');
          this.render();
        } catch (e) {
          if (window.showToast) showToast('Erro: ' + e.message, 'error');
        }
      })
    );
  },

  showModal(ferramenta) {
    const isEdit = !!ferramenta;
    const f = ferramenta || {
      nome: '', codigo: '', tipo: '', requerCalibracao: false,
      periodicidadeMeses: 12, localizacao: '', responsavelId: '', status: 'disponivel',
    };

    const respOpts = ['<option value="">— sem responsável —</option>']
      .concat(this._recursos.map((r) => `<option value="${escapeHtml(r.id)}" ${f.responsavelId === r.id ? 'selected' : ''}>${escapeHtml(r.nome || r.id)}</option>`))
      .join('');

    const html = `
      <div class="modal-overlay" id="modalFerr">
        <div class="modal" style="width:640px;max-width:96vw;">
          <div class="modal-header">
            <h2 class="modal-title">${isEdit ? 'Editar Ferramenta' : 'Nova Ferramenta'}</h2>
            <button class="modal-close" id="btnFecharFerr">✕</button>
          </div>
          <form id="formFerr" class="modal-content">
            <div class="form-row">
              <div class="form-group" style="flex:2;">
                <label class="form-label">Nome *</label>
                <input type="text" class="form-control" name="nome" required value="${escapeHtml(f.nome || '')}" placeholder="Ex: Torquímetro 1/2&quot;">
              </div>
              <div class="form-group">
                <label class="form-label">Código</label>
                <input type="text" class="form-control" name="codigo" value="${escapeHtml(f.codigo || '')}" placeholder="FER-001">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Tipo</label>
                <input type="text" class="form-control" name="tipo" value="${escapeHtml(f.tipo || '')}" placeholder="Instrumento, manual, elétrica...">
              </div>
              <div class="form-group">
                <label class="form-label">Status</label>
                <select class="form-control" name="status">
                  ${this.STATUS.map((s) => `<option value="${s.v}" ${f.status === s.v ? 'selected' : ''}>${escapeHtml(s.l)}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Localização</label>
                <input type="text" class="form-control" name="localizacao" value="${escapeHtml(f.localizacao || '')}" placeholder="Almoxarifado, obra X...">
              </div>
              <div class="form-group">
                <label class="form-label">Responsável</label>
                <select class="form-control" name="responsavelId">${respOpts}</select>
              </div>
            </div>
            <div class="form-row" style="align-items:center;">
              <div class="form-group" style="display:flex;align-items:center;gap:8px;">
                <input type="checkbox" id="ferrRequer" name="requerCalibracao" ${f.requerCalibracao ? 'checked' : ''} style="width:auto;">
                <label class="form-label" for="ferrRequer" style="margin:0;">Exige calibração</label>
              </div>
              <div class="form-group">
                <label class="form-label">Periodicidade (meses)</label>
                <input type="number" min="1" step="1" class="form-control" name="periodicidadeMeses" value="${escapeHtml(String(f.periodicidadeMeses != null ? f.periodicidadeMeses : 12))}">
              </div>
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelarFerr">Cancelar</button>
            <button class="btn btn-primary" id="btnSalvarFerr">${isEdit ? 'Salvar Alterações' : 'Criar Ferramenta'}</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const close = () => document.getElementById('modalFerr')?.remove();
    document.getElementById('btnFecharFerr').addEventListener('click', close);
    document.getElementById('btnCancelarFerr').addEventListener('click', close);

    document.getElementById('btnSalvarFerr').addEventListener('click', async () => {
      const form = document.getElementById('formFerr');
      const nome = form.nome.value.trim();
      if (!nome) {
        if (window.showToast) showToast('Nome é obrigatório', 'warning');
        return;
      }
      const data = {
        nome,
        codigo: form.codigo.value.trim(),
        tipo: form.tipo.value.trim(),
        localizacao: form.localizacao.value.trim(),
        responsavelId: form.responsavelId.value || null,
        status: form.status.value,
        requerCalibracao: form.requerCalibracao.checked,
        periodicidadeMeses: parseInt(form.periodicidadeMeses.value, 10) || 12,
      };
      try {
        const url = isEdit ? '/api/ferramentas/' + ferramenta.id : '/api/ferramentas';
        const res = await fetch(url, {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'HTTP ' + res.status);
        }
        close();
        this.render();
        if (window.showToast) showToast(isEdit ? 'Ferramenta atualizada' : 'Ferramenta criada', 'success');
      } catch (e) {
        if (window.showToast) showToast('Erro: ' + e.message, 'error');
      }
    });
  },

  // ── Detalhe: dados + histórico de calibrações ──
  async showDetalhe(id) {
    let ferramenta = this._lista.find((x) => x.id === id) || null;
    let calibracoes = ferramenta ? ferramenta.calibracoes || [] : [];

    const fetchDetalhe = async () => {
      try {
        const res = await fetch(`/api/ferramentas/${id}/calibracoes`);
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        ferramenta = data.ferramenta || ferramenta;
        calibracoes = data.calibracoes || [];
      } catch (e) {
        if (window.showToast) showToast('Erro: ' + e.message, 'error');
      }
    };

    await fetchDetalhe();
    if (!ferramenta) return;

    const draw = () => {
      const resp = this._nomeResp(ferramenta.responsavelId);
      const calRows =
        calibracoes.length === 0
          ? `<tr><td colspan="6" class="text-muted" style="text-align:center;padding:var(--sp-md);">Nenhuma calibração registrada.</td></tr>`
          : calibracoes
              .map((c) => {
                const ok = (c.resultado || 'aprovado') !== 'reprovado';
                return `
                <tr>
                  <td style="white-space:nowrap;">${this._fmtData(c.data)}</td>
                  <td style="white-space:nowrap;">${this._fmtData(c.validade)}</td>
                  <td>${escapeHtml(c.certificado || '—')}</td>
                  <td>${ok ? this._pill('aprovado', '#d1fae5', '#047857') : this._pill('reprovado', '#fee2e2', '#b91c1c')}</td>
                  <td class="text-muted font-sm">${escapeHtml(c.observacoes || '')}</td>
                  <td style="text-align:center;"><button type="button" class="action-link danger btn-del-cal" data-id="${escapeHtml(c.id)}">×</button></td>
                </tr>`;
              })
              .join('');

      const info = (label, val) =>
        `<div><div class="text-muted font-sm">${label}</div><div style="font-weight:600;">${val}</div></div>`;

      return `
        <div class="modal-overlay" id="modalDetFerr">
          <div class="modal" style="width:760px;max-width:95vw;max-height:90vh;overflow-y:auto;">
            <div class="modal-header">
              <div>
                <h2 class="modal-title">${escapeHtml(ferramenta.nome || '')}</h2>
                <div style="font-size:13px;color:var(--color-text-muted);">${escapeHtml(ferramenta.codigo || 'sem código')} · ${escapeHtml(ferramenta.tipo || 'sem tipo')}</div>
              </div>
              <button class="modal-close" id="btnFecharDetFerr">✕</button>
            </div>
            <div class="modal-content">
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:var(--sp-md);margin-bottom:var(--sp-lg);">
                ${info('Status', this._statusBadge(ferramenta.status))}
                ${info('Calibração', this._situacaoBadge(ferramenta))}
                ${info('Localização', escapeHtml(ferramenta.localizacao || '—'))}
                ${info('Responsável', resp ? escapeHtml(resp) : '—')}
                ${ferramenta.requerCalibracao ? info('Periodicidade', `${escapeHtml(String(ferramenta.periodicidadeMeses || 12))} meses`) : ''}
                ${ferramenta.requerCalibracao ? info('Próxima calibração', this._fmtData(ferramenta.proximaCalibracao)) : ''}
              </div>

              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--sp-sm);">
                <h3 style="margin:0;font-size:15px;">Histórico de calibrações</h3>
                ${ferramenta.requerCalibracao ? '<button class="btn btn-sm btn-primary" id="btnAddCal">+ Registrar calibração</button>' : ''}
              </div>
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Data</th>
                      <th scope="col">Validade</th>
                      <th scope="col">Certificado</th>
                      <th scope="col">Resultado</th>
                      <th scope="col">Observações</th>
                      <th scope="col" style="width:40px;"></th>
                    </tr>
                  </thead>
                  <tbody>${calRows}</tbody>
                </table>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" id="btnFecharDetFerr2">Fechar</button>
            </div>
          </div>
        </div>
      `;
    };

    const renderModal = () => {
      document.getElementById('modalDetFerr')?.remove();
      document.body.insertAdjacentHTML('beforeend', draw());
      const overlay = document.getElementById('modalDetFerr');
      const close = () => overlay.remove();
      document.getElementById('btnFecharDetFerr').addEventListener('click', close);
      document.getElementById('btnFecharDetFerr2').addEventListener('click', close);

      const btnAdd = document.getElementById('btnAddCal');
      if (btnAdd) btnAdd.addEventListener('click', () => this._showModalCalibracao(id, async () => {
        await fetchDetalhe();
        renderModal();
        this._refreshLista();
      }));

      overlay.querySelectorAll('.btn-del-cal').forEach((b) =>
        b.addEventListener('click', async () => {
          if (!confirm('Excluir esta calibração?')) return;
          try {
            const res = await fetch(`/api/ferramentas/${id}/calibracoes/${b.dataset.id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error(await res.text());
            if (window.showToast) showToast('Calibração excluída', 'success');
            await fetchDetalhe();
            renderModal();
            this._refreshLista();
          } catch (e) {
            if (window.showToast) showToast('Erro: ' + e.message, 'error');
          }
        })
      );
    };

    renderModal();
  },

  // Recarrega a lista/KPIs da tela por trás do modal após mutar calibração
  // (o modal de detalhe vive em document.body, então _draw() não o fecha).
  async _refreshLista() {
    try {
      const res = await fetch('/api/ferramentas');
      if (!res.ok) return;
      const data = await res.json();
      this._lista = data.ferramentas || [];
      this._resumo = data.resumo || {};
      this._draw();
    } catch (_e) { /* silencioso: o detalhe continua válido */ }
  },

  _showModalCalibracao(ferramentaId, onDone) {
    const hoje = new Date().toISOString().slice(0, 10);
    const html = `
      <div class="modal-overlay" id="modalCal" style="z-index:10000;">
        <div class="modal" style="width:520px;">
          <div class="modal-header"><h2 class="modal-title">Registrar calibração</h2><button class="modal-close" id="btnFecharCal">✕</button></div>
          <form id="formCal" class="modal-content">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Data *</label>
                <input class="form-control" type="date" name="data" required value="${hoje}">
              </div>
              <div class="form-group">
                <label class="form-label">Validade</label>
                <input class="form-control" type="date" name="validade">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Certificado</label>
                <input class="form-control" type="text" name="certificado" placeholder="Nº do certificado">
              </div>
              <div class="form-group">
                <label class="form-label">Resultado</label>
                <select class="form-control" name="resultado">
                  ${this.RESULTADOS.map((r) => `<option value="${r.v}">${escapeHtml(r.l)}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Observações</label>
              <textarea class="form-control" name="observacoes" rows="2" placeholder="Laboratório, incertezas, ajustes..."></textarea>
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelarCal">Cancelar</button>
            <button class="btn btn-primary" id="btnSalvarCal">Registrar</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const close = () => document.getElementById('modalCal')?.remove();
    document.getElementById('btnFecharCal').addEventListener('click', close);
    document.getElementById('btnCancelarCal').addEventListener('click', close);

    document.getElementById('btnSalvarCal').addEventListener('click', async () => {
      const form = document.getElementById('formCal');
      const data = {
        data: form.data.value || null,
        validade: form.validade.value || null,
        certificado: form.certificado.value.trim(),
        resultado: form.resultado.value,
        observacoes: form.observacoes.value.trim(),
      };
      try {
        const res = await fetch(`/api/ferramentas/${ferramentaId}/calibracoes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error(await res.text());
        if (window.showToast) showToast('Calibração registrada', 'success');
        close();
        if (onDone) onDone();
      } catch (e) {
        if (window.showToast) showToast('Erro: ' + e.message, 'error');
      }
    });
  },
};
