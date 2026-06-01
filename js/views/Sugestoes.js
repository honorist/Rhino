/* Rhino · view Sugestões (RaiaPro História 2) — canal de sugestões do colaborador.
   Qualquer usuário envia; gerentes movem o status num Kanban. FAB global em qualquer tela. */
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

    _sugById(id) { return (this._data.sugestoes || []).find((s) => s.id === id) || null; },

    _meta(s) {
      return [s.autorNome ? esc(s.autorNome) : null, s.area ? esc(s.area) : null, _fmtData(s.createdAt)].filter(Boolean).join(' · ');
    },
    _anexoLink(s, small) {
      if (!s.temAnexo) return '';
      const sz = small ? '12px' : '13px';
      return `<a href="/api/sugestoes/${esc(s.id)}/anexo" target="_blank" rel="noopener" data-sug-noopen style="font-size:${sz};color:var(--color-primary);">📎 ${small ? 'foto' : 'ver foto'}</a>`;
    },

    // ── Card de leitura (visão do colaborador) ──
    _card(s) {
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
          <div style="font-size:13px;color:var(--color-text-muted);margin:2px 0 8px;">${this._meta(s)}</div>
          <div style="font-size:14px;line-height:1.6;white-space:pre-wrap;">${esc(s.descricao)}</div>
          ${this._anexoLink(s, false) ? `<div style="margin-top:6px;">${this._anexoLink(s, false)}</div>` : ''}
          ${coment}${justif}
        </div>`;
    },

    // ── Kanban (visão do gestor): 4 colunas = 4 status ──
    _kanban(sugestoes) {
      const cols = ORDEM_STATUS.map((st) => {
        const itens = sugestoes.filter((s) => s.status === st);
        const c = STATUS[st];
        return `
          <div class="sug-col" data-sug-col="${st}" style="flex:1 1 0;min-width:230px;background:var(--color-surface-2);border-radius:10px;padding:var(--sp-sm);border-top:3px solid ${c.cor};">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--sp-sm);padding:0 2px;">
              <span style="font-weight:700;font-size:14px;color:${c.cor};">${c.label}</span>
              <span style="font-size:12px;color:var(--color-text-muted);background:var(--color-surface);border-radius:999px;padding:1px 8px;">${itens.length}</span>
            </div>
            <div class="sug-col-body" style="min-height:48px;display:flex;flex-direction:column;gap:8px;">
              ${itens.map((s) => this._kanbanCard(s)).join('') || `<div style="font-size:13px;color:var(--color-text-muted);text-align:center;padding:var(--sp-md);">—</div>`}
            </div>
          </div>`;
      }).join('');
      return `
        <p style="font-size:13px;color:var(--color-text-muted);margin:0 0 var(--sp-sm);">Arraste um card entre as colunas, ou toque nele para ver os detalhes e mover.</p>
        <div class="sug-kanban" style="display:flex;gap:var(--sp-md);overflow-x:auto;padding-bottom:var(--sp-sm);align-items:flex-start;">${cols}</div>`;
    },

    _kanbanCard(s) {
      const meta = [s.autorNome ? esc(s.autorNome) : null, s.area ? esc(s.area) : null].filter(Boolean).join(' · ');
      return `
        <div class="sug-kcard" draggable="true" data-sug-id="${esc(s.id)}" tabindex="0" role="button"
             style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:8px;padding:8px 10px;cursor:grab;">
          <div style="font-weight:600;font-size:14px;">${esc(s.titulo)}</div>
          ${meta ? `<div style="font-size:12px;color:var(--color-text-muted);margin-top:2px;">${meta}</div>` : ''}
          <div style="font-size:13px;color:var(--color-text-muted);margin-top:4px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${esc(s.descricao)}</div>
          ${s.temAnexo ? `<div style="margin-top:4px;">${this._anexoLink(s, true)}</div>` : ''}
        </div>`;
    },

    _html() {
      const { sugestoes, podeGerir } = this._data;
      const header = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--sp-lg);gap:var(--sp-md);flex-wrap:wrap;">
          <div>
            <h1 style="margin:0;">Sugestões</h1>
            <p style="margin:0;color:var(--color-text-muted);font-size:14px;">Ideias de melhoria do dia a dia em campo.</p>
          </div>
          <button type="button" class="btn btn-primary" id="btnNovaSugestao">+ Nova sugestão</button>
        </div>`;

      if (podeGerir) {
        return `${header}${this._kanban(sugestoes)}`;
      }

      // Colaborador: minhas + backlog público (aprovadas).
      const minhas = sugestoes.filter((s) => s.autorId === this._meuId);
      const backlog = sugestoes.filter((s) => s.status === 'aprovada');
      return `${header}
        <h3 style="margin:0 0 var(--sp-sm);">Minhas sugestões</h3>
        ${minhas.length ? minhas.map((s) => this._card(s)).join('') : this._vazio('Você ainda não enviou sugestões. Clique em "+ Nova sugestão".')}
        <h3 style="margin:var(--sp-lg) 0 var(--sp-sm);">Backlog — aprovadas (o que vem por aí)</h3>
        ${backlog.length ? backlog.map((s) => this._card(s)).join('') : this._vazio('Nenhuma sugestão aprovada ainda.')}`;
    },

    _vazio(msg) {
      return `<div style="text-align:center;padding:var(--sp-lg);color:var(--color-text-muted);font-size:14px;">${esc(msg)}</div>`;
    },

    _bind() {
      const root = document.getElementById('app');
      if (!root) return;
      root.querySelector('#btnNovaSugestao')?.addEventListener('click', () => this._abrirNovaModal());

      // Kanban: cards (clique/Enter → detalhe; arrastar → mover) + colunas (drop).
      root.querySelectorAll('.sug-kcard').forEach((card) => {
        const abrir = (e) => {
          if (e.target.closest('[data-sug-noopen]')) return;
          const s = this._sugById(card.dataset.sugId);
          if (s) this._abrirDetalheModal(s);
        };
        card.addEventListener('click', abrir);
        card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(e); } });
        card.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', card.dataset.sugId);
          e.dataTransfer.effectAllowed = 'move';
          card.style.opacity = '0.5';
        });
        card.addEventListener('dragend', () => { card.style.opacity = '1'; });
      });
      root.querySelectorAll('[data-sug-col]').forEach((col) => {
        col.addEventListener('dragover', (e) => { e.preventDefault(); col.style.outline = '2px dashed var(--color-primary)'; col.style.outlineOffset = '-2px'; });
        col.addEventListener('dragleave', () => { col.style.outline = 'none'; });
        col.addEventListener('drop', (e) => {
          e.preventDefault();
          col.style.outline = 'none';
          const id = e.dataTransfer.getData('text/plain');
          const novo = col.dataset.sugCol;
          const s = this._sugById(id);
          if (s && s.status !== novo) this._abrirStatusModal(id, novo);
        });
      });
    },

    // ── Modal: detalhe do card + mover (gestor, mobile-friendly) ──
    _abrirDetalheModal(s) {
      document.getElementById('modalSugDetOverlay')?.remove();
      const botoes = ORDEM_STATUS.filter((st) => st !== s.status)
        .map((st) => `<button type="button" class="btn btn-sm btn-secondary" data-det-novo="${st}">${STATUS[st].label}</button>`).join('');
      const justif = s.status === 'descartada' && s.justificativaDescarte
        ? `<div style="font-size:13px;color:var(--color-text-muted);margin-top:8px;"><strong>Motivo do descarte:</strong> ${esc(s.justificativaDescarte)}</div>` : '';
      const coment = s.comentarioGestor && s.status !== 'descartada'
        ? `<div style="font-size:13px;color:var(--color-text-muted);margin-top:8px;"><strong>Comentário:</strong> ${esc(s.comentarioGestor)}</div>` : '';
      const html = `
        <div class="modal-overlay" id="modalSugDetOverlay">
          <div class="modal" style="width:92vw;max-width:560px;">
            <div class="modal-header">
              <h2 class="modal-title" style="font-size:18px;">${esc(s.titulo)}</h2>
              <button class="modal-close" id="detClose">✕</button>
            </div>
            <div style="padding:var(--sp-lg);">
              <div style="display:flex;align-items:center;gap:var(--sp-sm);margin-bottom:8px;">${this._badge(s.status)}<span style="font-size:13px;color:var(--color-text-muted);">${this._meta(s)}</span></div>
              <div style="font-size:14px;line-height:1.7;white-space:pre-wrap;">${esc(s.descricao)}</div>
              ${this._anexoLink(s, false) ? `<div style="margin-top:8px;">${this._anexoLink(s, false)}</div>` : ''}
              ${coment}${justif}
            </div>
            <div class="modal-footer" style="flex-wrap:wrap;gap:6px;align-items:center;">
              <button type="button" class="btn btn-sm" id="detExcluir" title="Excluir sugestão"
                      style="color:var(--color-danger);background:transparent;border:1px solid var(--color-border);">🗑 Excluir</button>
              <span style="font-size:12px;color:var(--color-text-muted);margin-left:auto;">Mover para:</span>
              ${botoes}
            </div>
          </div>
        </div>`;
      document.body.insertAdjacentHTML('beforeend', html);
      const ov = document.getElementById('modalSugDetOverlay');
      const fechar = () => ov.remove();
      document.getElementById('detClose').onclick = fechar;
      ov.addEventListener('click', (e) => { if (e.target === ov) fechar(); });
      ov.querySelector('#detExcluir')?.addEventListener('click', () => this._excluir(s, ov));
      ov.querySelectorAll('[data-det-novo]').forEach((b) =>
        b.addEventListener('click', () => { fechar(); this._abrirStatusModal(s.id, b.dataset.detNovo); }));
    },

    async _excluir(s, ov) {
      if (!window.confirm(`Excluir a sugestão "${s.titulo}"? Esta ação não pode ser desfeita.`)) return;
      try {
        const r = await fetch(`/api/sugestoes/${s.id}`, { method: 'DELETE', credentials: 'same-origin' });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || 'Falha ao excluir');
        ov.remove();
        toast('Sugestão excluída.', 'success');
        this.render();
      } catch (e) {
        toast(e.message || 'Erro', 'error');
      }
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
                <datalist id="sugAreasList">${AREAS.map((a) => `<option value="${a}">`).join('')}</datalist></div>
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
      ov.addEventListener('click', (e) => { if (e.target === ov) fechar(); });
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
      ov.addEventListener('click', (e) => { if (e.target === ov) fechar(); });
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
