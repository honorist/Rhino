/* Rhino · view Sugestões (RaiaPro História 2) — canal de sugestões do colaborador.
   Qualquer usuário envia; gerentes movem o status. FAB global em qualquer tela. */
(function () {
  const STATUS = {
    pendente:   { label: 'Pendente',   cor: '#6B7280', bg: '#6B728022' },
    em_analise: { label: 'Em análise', cor: '#B45309', bg: '#F59E0B22' },
    aprovada:   { label: 'Aprovada',   cor: '#047857', bg: '#10B98122' },
    descartada: { label: 'Descartada', cor: '#B91C1C', bg: '#EF444422' },
  };
  const ORDEM_STATUS = ['pendente', 'em_analise', 'aprovada', 'descartada'];
  const AREAS = ['RDO', 'Equipes', 'Relatórios', 'Financeiro', 'Frota', 'Recursos', 'Estoque', 'Outro'];
  const esc = (s) => (window.escapeHtml ? window.escapeHtml(String(s ?? '')) : String(s ?? ''));
  const toast = (m, t) => (window.showToast ? window.showToast(m, t) : null);

  function _fmtData(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleDateString('pt-BR'); } catch { return ''; }
  }

  window.Sugestoes = {
    _data: { sugestoes: [], podeGerir: false },
    _meuId: null,
    _filtro: 'todas',

    async render() {
      const root = document.getElementById('app');
      if (root) root.innerHTML = `<div style="padding:var(--sp-lg);color:var(--color-text-muted);">Carregando sugestões…</div>`;
      await this._load();
      if (root) { root.innerHTML = this._html(); this._bind(); }
    },

    async _load() {
      try {
        const [rs, rm] = await Promise.all([
          fetch('/api/sugestoes', { credentials: 'same-origin' }),
          fetch('/api/auth/me', { credentials: 'same-origin' }),
        ]);
        const js = await rs.json();
        this._data = { sugestoes: js.sugestoes || [], podeGerir: !!js.podeGerir };
        try { const jm = await rm.json(); this._meuId = jm.user?.id || null; } catch { this._meuId = null; }
      } catch (e) {
        this._data = { sugestoes: [], podeGerir: false };
      }
    },

    _badge(status) {
      const s = STATUS[status] || STATUS.pendente;
      return `<span style="font-size:12px;font-weight:700;padding:2px 8px;border-radius:999px;color:${s.cor};background:${s.bg};">${s.label}</span>`;
    },

    _card(s, comControles) {
      const anexo = s.temAnexo
        ? `<a href="/api/sugestoes/${esc(s.id)}/anexo" target="_blank" rel="noopener" style="font-size:13px;color:var(--color-primary);">📎 ver foto</a>` : '';
      const meta = [s.autorNome ? esc(s.autorNome) : null, s.area ? esc(s.area) : null, _fmtData(s.createdAt)].filter(Boolean).join(' · ');
      const justif = s.status === 'descartada' && s.justificativaDescarte
        ? `<div style="font-size:13px;color:var(--color-text-muted);margin-top:6px;"><strong>Motivo do descarte:</strong> ${esc(s.justificativaDescarte)}</div>` : '';
      const coment = s.comentarioGestor && s.status !== 'descartada'
        ? `<div style="font-size:13px;color:var(--color-text-muted);margin-top:6px;"><strong>Comentário:</strong> ${esc(s.comentarioGestor)}</div>` : '';
      return `
        <div style="padding:var(--sp-md);background:var(--color-surface);border:1px solid var(--color-border);border-radius:8px;margin-bottom:var(--sp-md);">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:var(--sp-sm);">
            <div style="font-weight:700;font-size:15px;">${esc(s.titulo)}</div>
            ${this._badge(s.status)}
          </div>
          <div style="font-size:13px;color:var(--color-text-muted);margin:2px 0 8px;">${meta}</div>
          <div style="font-size:14px;line-height:1.6;white-space:pre-wrap;">${esc(s.descricao)}</div>
          ${anexo ? `<div style="margin-top:6px;">${anexo}</div>` : ''}
          ${coment}${justif}
          ${comControles ? this._controles(s) : ''}
        </div>`;
    },

    _controles(s) {
      const botoes = ORDEM_STATUS
        .filter(st => st !== s.status)
        .map(st => `<button type="button" class="btn btn-sm btn-secondary" data-sug-status="${esc(s.id)}" data-novo="${st}">${STATUS[st].label}</button>`)
        .join('');
      return `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:var(--sp-sm);border-top:1px dashed var(--color-border);padding-top:var(--sp-sm);">
        <span style="font-size:12px;color:var(--color-text-muted);align-self:center;">Mover para:</span>${botoes}
      </div>`;
    },

    _html() {
      const { sugestoes, podeGerir } = this._data;
      const header = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--sp-lg);">
          <div>
            <h1 style="margin:0;">Sugestões</h1>
            <p style="margin:0;color:var(--color-text-muted);font-size:14px;">Ideias de melhoria do dia a dia em campo.</p>
          </div>
          <button type="button" class="btn btn-primary" id="btnNovaSugestao">+ Nova sugestão</button>
        </div>`;

      if (podeGerir) {
        const filtroAtivo = this._filtro;
        const filtros = ['todas', ...ORDEM_STATUS].map(f => {
          const lbl = f === 'todas' ? 'Todas' : STATUS[f].label;
          const on = filtroAtivo === f;
          return `<button type="button" class="btn btn-sm ${on ? 'btn-primary' : 'btn-secondary'}" data-sug-filtro="${f}">${lbl}</button>`;
        }).join('');
        const lista = sugestoes.filter(s => filtroAtivo === 'todas' || s.status === filtroAtivo);
        return `${header}
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:var(--sp-md);">${filtros}</div>
          ${lista.length ? lista.map(s => this._card(s, true)).join('') : this._vazio('Nenhuma sugestão neste filtro.')}`;
      }

      // Colaborador: minhas + backlog público (aprovadas).
      const minhas = sugestoes.filter(s => s.autorId === this._meuId);
      const backlog = sugestoes.filter(s => s.status === 'aprovada');
      return `${header}
        <h3 style="margin:0 0 var(--sp-sm);">Minhas sugestões</h3>
        ${minhas.length ? minhas.map(s => this._card(s, false)).join('') : this._vazio('Você ainda não enviou sugestões. Clique em "+ Nova sugestão".')}
        <h3 style="margin:var(--sp-lg) 0 var(--sp-sm);">Backlog — aprovadas (o que vem por aí)</h3>
        ${backlog.length ? backlog.map(s => this._card(s, false)).join('') : this._vazio('Nenhuma sugestão aprovada ainda.')}`;
    },

    _vazio(msg) {
      return `<div style="text-align:center;padding:var(--sp-lg);color:var(--color-text-muted);font-size:14px;">${esc(msg)}</div>`;
    },

    _bind() {
      const root = document.getElementById('app');
      if (!root) return;
      root.querySelector('#btnNovaSugestao')?.addEventListener('click', () => this._abrirNovaModal());
      root.querySelectorAll('[data-sug-filtro]').forEach(b =>
        b.addEventListener('click', () => { this._filtro = b.dataset.sugFiltro; const r = document.getElementById('app'); r.innerHTML = this._html(); this._bind(); }));
      root.querySelectorAll('[data-sug-status]').forEach(b =>
        b.addEventListener('click', () => this._abrirStatusModal(b.dataset.sugStatus, b.dataset.novo)));
    },

    // ── Modal: nova sugestão ──
    _abrirNovaModal() {
      document.getElementById('modalSugOverlay')?.remove();
      const html = `
        <div class="modal-overlay" id="modalSugOverlay">
          <div class="modal" style="width:92vw;max-width:560px;">
            <div class="modal-header"><h2 class="modal-title">Nova sugestão</h2><button class="modal-close" id="sugClose">✕</button></div>
            <div style="padding:var(--sp-lg);">
              <div class="form-group"><label class="form-label">Título *</label>
                <input class="form-control" id="sugTitulo" maxlength="120" placeholder="Resumo da ideia"></div>
              <div class="form-group"><label class="form-label">Descrição *</label>
                <textarea class="form-control" id="sugDescricao" rows="4" placeholder="Explique a sua sugestão"></textarea></div>
              <div class="form-group"><label class="form-label">Área (opcional)</label>
                <input class="form-control" id="sugArea" list="sugAreasList" placeholder="Ex.: RDO">
                <datalist id="sugAreasList">${AREAS.map(a => `<option value="${a}">`).join('')}</datalist></div>
              <div class="form-group"><label class="form-label">Foto (opcional)</label>
                <input class="form-control" type="file" id="sugFoto" accept="image/jpeg,image/png,image/webp"></div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" id="sugCancel">Cancelar</button>
              <button class="btn btn-primary" id="sugEnviar">Enviar</button>
            </div>
          </div>
        </div>`;
      document.body.insertAdjacentHTML('beforeend', html);
      const ov = document.getElementById('modalSugOverlay');
      const fechar = () => ov.remove();
      document.getElementById('sugClose').onclick = fechar;
      document.getElementById('sugCancel').onclick = fechar;
      ov.addEventListener('click', e => { if (e.target === ov) fechar(); });
      document.getElementById('sugEnviar').onclick = () => this._enviarNova(ov);
    },

    async _enviarNova(ov) {
      const titulo = document.getElementById('sugTitulo').value.trim();
      const descricao = document.getElementById('sugDescricao').value.trim();
      const area = document.getElementById('sugArea').value.trim();
      const foto = document.getElementById('sugFoto').files[0];
      if (!titulo) { toast('Título é obrigatório', 'warning'); return; }
      if (!descricao) { toast('Descrição é obrigatória', 'warning'); return; }
      const btn = document.getElementById('sugEnviar');
      btn.disabled = true;
      try {
        const r = await fetch('/api/sugestoes', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ titulo, descricao, area: area || undefined }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Falha ao enviar');
        if (foto && j.id) {
          const fd = new FormData(); fd.append('foto', foto);
          await fetch(`/api/sugestoes/${j.id}/anexo`, { method: 'POST', credentials: 'same-origin', body: fd }).catch(() => {});
        }
        ov.remove();
        toast('Sugestão enviada com sucesso!', 'success');
        if (location.hash === '#/sugestoes') this.render();
      } catch (e) {
        toast(e.message || 'Erro ao enviar', 'error');
      } finally {
        btn.disabled = false;
      }
    },

    // ── Modal: mudar status (gestor) ──
    _abrirStatusModal(id, novo) {
      document.getElementById('modalSugStOverlay')?.remove();
      const isDescarte = novo === 'descartada';
      const html = `
        <div class="modal-overlay" id="modalSugStOverlay">
          <div class="modal" style="width:92vw;max-width:480px;">
            <div class="modal-header"><h2 class="modal-title">Mover para: ${STATUS[novo].label}</h2><button class="modal-close" id="stClose">✕</button></div>
            <div style="padding:var(--sp-lg);">
              ${isDescarte
                ? `<div class="form-group"><label class="form-label">Justificativa do descarte *</label>
                     <textarea class="form-control" id="stJustificativa" rows="3" placeholder="Por que está sendo descartada?"></textarea></div>`
                : `<div class="form-group"><label class="form-label">Comentário (opcional)</label>
                     <textarea class="form-control" id="stComentario" rows="3" placeholder="Mensagem para o autor"></textarea></div>`}
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" id="stCancel">Cancelar</button>
              <button class="btn btn-primary" id="stConfirm">Confirmar</button>
            </div>
          </div>
        </div>`;
      document.body.insertAdjacentHTML('beforeend', html);
      const ov = document.getElementById('modalSugStOverlay');
      const fechar = () => ov.remove();
      document.getElementById('stClose').onclick = fechar;
      document.getElementById('stCancel').onclick = fechar;
      ov.addEventListener('click', e => { if (e.target === ov) fechar(); });
      document.getElementById('stConfirm').onclick = async () => {
        const comentario = document.getElementById('stComentario')?.value.trim() || '';
        const justificativa = document.getElementById('stJustificativa')?.value.trim() || '';
        if (isDescarte && !justificativa) { toast('Justificativa é obrigatória para descartar', 'warning'); return; }
        await this._mudarStatus(id, novo, comentario, justificativa, ov);
      };
    },

    async _mudarStatus(id, novo, comentario, justificativa, ov) {
      try {
        const r = await fetch(`/api/sugestoes/${id}/status`, {
          method: 'PUT', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: novo, comentario: comentario || undefined, justificativa: justificativa || undefined }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Falha ao mudar status');
        ov.remove();
        toast('Status atualizado.', 'success');
        this.render();
      } catch (e) {
        toast(e.message || 'Erro', 'error');
      }
    },

    // ── FAB global (qualquer tela) ──
    mountFab() {
      if (document.getElementById('sugFab')) return; // idempotente
      const btn = document.createElement('button');
      btn.id = 'sugFab';
      btn.type = 'button';
      btn.title = 'Enviar sugestão';
      btn.setAttribute('aria-label', 'Enviar sugestão');
      btn.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:900;width:52px;height:52px;border-radius:50%;border:none;cursor:pointer;background:var(--color-primary);color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;';
      btn.innerHTML = window.rhIcon ? window.rhIcon('message-square', 22) : '💡';
      btn.addEventListener('click', () => this._abrirNovaModal());
      document.body.appendChild(btn);
    },
  };
})();
