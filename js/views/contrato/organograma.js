/* Rhino · ContratoDetail · organograma
   Extraído de js/views/ContratoDetail.js (linhas 1620-2902)
   Estende o objeto window.ContratoDetail já definido. */
(function () {
  if (!window.ContratoDetail) { console.error('[contrato/organograma] requires ContratoDetail core'); return; }
  Object.assign(window.ContratoDetail, {
  // ═══════════ ORGANOGRAMA ═══════════
  renderOrganogramaSection(contract) {
    const membros = contract.organograma || [];
    const view = this._organogramaView || 'hierarquia';

    const body = membros.length === 0
      ? `<p class="text-muted" style="padding: var(--sp-lg);">Nenhum membro cadastrado. Clique em "+ Adicionar Membro" para começar.</p>`
      : (view === 'lista' ? this._renderOrganogramaLista(membros) : this._renderOrganogramaArvore(membros));

    const btnClass = (v) => view === v
      ? 'btn btn-primary btn-sm'
      : 'btn btn-secondary btn-sm';

    return `
      <div class="card mb-2xl">
        <div class="card-header">
          <h3 class="card-title">Organograma da Obra — Equipe</h3>
          <div class="btn-group">
            <button class="${btnClass('hierarquia')}" data-view="hierarquia" id="btnOrgViewH">⛬ Hierarquia</button>
            <button class="${btnClass('lista')}" data-view="lista" id="btnOrgViewL">☰ Lista</button>
            <button class="btn btn-primary btn-sm" id="btnNovoMembroOrg">+ Adicionar Membro</button>
          </div>
        </div>
        <div id="organogramaBody">${body}</div>
      </div>
    `;
  },

  _getRecursoNome(recursoId) {
    const r = (Store.state.recursos || []).find(x => x.id === recursoId);
    return r ? r.nome : '(recurso removido)';
  },

  _getRecursoProfissao(recursoId) {
    const r = (Store.state.recursos || []).find(x => x.id === recursoId);
    return r ? (r.profissao || '') : '';
  },

  _renderOrganogramaLista(membros) {
    const byId = Object.fromEntries(membros.map(m => [m.id, m]));
    const rows = membros.slice().sort((a, b) => {
      const ordem = { encarregado: 0, lider_area: 1, profissional: 2 };
      if (ordem[a.nivel] !== ordem[b.nivel]) return ordem[a.nivel] - ordem[b.nivel];
      return this._getRecursoNome(a.recursoId).localeCompare(this._getRecursoNome(b.recursoId));
    }).map(m => {
      const nome = this._getRecursoNome(m.recursoId);
      const cargo = this._getRecursoProfissao(m.recursoId) || m.cargo || '—';
      const supervisor = m.supervisorId ? (byId[m.supervisorId] ? this._getRecursoNome(byId[m.supervisorId].recursoId) : '—') : '—';
      const cor = NIVEL_COR[m.nivel] || '#999';
      return `
        <tr>
          <td><strong>${escapeHtml(nome)}</strong></td>
          <td>${escapeHtml(cargo)}</td>
          <td><span class="badge" style="background:${cor}22;color:${cor};">${NIVEL_LABEL[m.nivel] || m.nivel}</span></td>
          <td>${escapeHtml(supervisor)}</td>
          <td>${m.area ? escapeHtml(m.area) : '—'}</td>
          <td>
            <div class="actions-cell">
              <button type="button" class="action-link btn-editar-org" data-id="${m.id}">Editar</button>
              <button type="button" class="action-link danger btn-excluir-org" data-id="${m.id}">Excluir</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Nome</th>
              <th scope="col">Cargo</th>
              <th scope="col">Nível</th>
              <th scope="col">Supervisor</th>
              <th scope="col">Área</th>
              <th scope="col">Ações</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  },

  _iniciais(nome) {
    const parts = (nome || '').trim().split(/\s+/);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  },

  _renderNodeOrg(membro, membros) {
    const nome = this._getRecursoNome(membro.recursoId);
    const cargo = this._getRecursoProfissao(membro.recursoId) || membro.cargo || '';
    const cor = NIVEL_COR[membro.nivel] || '#999';
    const filhos = membros.filter(m => m.supervisorId === membro.id);
    const hasChildren = filhos.length > 0;
    const iniciais = this._iniciais(nome);

    // Conta total de descendentes (direto + indireto)
    const contarDescendentes = (id) => {
      const diretos = membros.filter(m => m.supervisorId === id);
      return diretos.reduce((sum, d) => sum + 1 + contarDescendentes(d.id), 0);
    };
    const totalDesc = contarDescendentes(membro.id);

    const nivelClass = `node-${membro.nivel}`;

    const card = `
      <div class="org-node ${nivelClass}" draggable="true" data-id="${membro.id}" data-nivel="${membro.nivel}" data-recurso-id="${membro.recursoId}">
        ${totalDesc > 0 ? `<span class="org-node-count" title="${totalDesc} subordinado(s) no total">${totalDesc}</span>` : ''}
        <div class="org-avatar" aria-hidden="true">${escapeHtml(iniciais)}</div>
        <div class="org-info">
          <button type="button" class="org-node-nome" draggable="false" title="Ver detalhes do colaborador">${escapeHtml(nome)}</button>
          ${cargo ? `<div class="org-cargo">${escapeHtml(cargo)}</div>` : ''}
          ${membro.area ? `<div class="org-area">${escapeHtml(membro.area)}</div>` : ''}
          <div class="org-nivel-tag">${NIVEL_LABEL[membro.nivel] || ''}</div>
        </div>
        <div class="org-actions" draggable="false">
          <button class="org-action-btn btn-editar-org" data-id="${membro.id}" draggable="false" title="Editar membro" aria-label="Editar">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
          </button>
          <button class="org-action-btn danger btn-excluir-org" data-id="${membro.id}" draggable="false" title="Remover do organograma" aria-label="Remover">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>
        </div>
      </div>
    `;

    if (!hasChildren) {
      return `<li class="org-li">${card}</li>`;
    }

    return `
      <li class="org-li">
        ${card}
        <ul class="org-ul">
          ${filhos.map(f => this._renderNodeOrg(f, membros)).join('')}
        </ul>
      </li>
    `;
  },

  _renderOrganogramaArvore(membros) {
    const raizes = [];
    const encarregado = membros.find(m => m.nivel === 'encarregado');

    if (encarregado) {
      raizes.push(encarregado);
    }

    // Líderes sem encarregado (órfãos) e profissionais sem líder viram raízes separadas
    membros.forEach(m => {
      if (m === encarregado) return;
      const temSupervisor = m.supervisorId && membros.some(x => x.id === m.supervisorId);
      if (!temSupervisor) raizes.push(m);
    });

    const treeCss = `
      <style>
        /* ═══════════════════════════════════════════════════════
           ORGANOGRAMA — Glassmorphism + Minimal Dark
           ═══════════════════════════════════════════════════════ */
        @keyframes orgFadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* ─────────────────────────────────────────
           Padrão clássico de árvore CSS (Thiebaud Weksteen)
           - inline-block ao invés de flex (siblings auto-fluem)
           - 2 pseudos por li formam um conector "T":
             ::before = metade DIREITA do horizontal + border-right desce
             ::after  = metade ESQUERDA do horizontal + border-left desce
           - ul::before adiciona o drop do pai para o T das crianças
           ─────────────────────────────────────────── */
        .org-tree {
          padding: var(--sp-2xl) var(--sp-lg);
          overflow: auto;
          min-height: 120px;
          background: var(--color-surface-2);
          border: 1px solid var(--color-border);
          border-radius: 12px;
          text-align: center;
        }

        .org-tree ul.org-root,
        .org-tree ul.org-ul {
          padding: 0;
          margin: 0;
          list-style: none;
          position: relative;
          white-space: nowrap;
        }
        .org-tree ul.org-ul { padding-top: 24px; }

        .org-tree li.org-li {
          display: inline-block;
          vertical-align: top;
          text-align: center;
          list-style: none;
          padding: 24px 12px 0 12px;
          position: relative;
          white-space: normal;
        }

        /* T-conector: metade direita do horizontal + vertical descendo */
        .org-tree li.org-li::before,
        .org-tree li.org-li::after {
          content: '';
          position: absolute;
          top: 0;
          right: 50%;
          border-top: 2px solid var(--rh-brand-500, #55588B);
          width: 50%;
          height: 24px;
        }
        /* Metade esquerda do horizontal + vertical descendo */
        .org-tree li.org-li::after {
          right: auto;
          left: 50%;
          border-left: 2px solid var(--rh-brand-500, #55588B);
        }

        /* Filho único: sem horizontal, mantém só vertical */
        .org-tree li.org-li:only-child::after,
        .org-tree li.org-li:only-child::before {
          display: none;
        }
        .org-tree li.org-li:only-child { padding-top: 24px; }

        /* Primeiro filho: remove metade ESQUERDA do horizontal (não tem irmão à esquerda) */
        .org-tree li.org-li:first-child::before { border: 0 none; }
        /* Último filho: remove metade DIREITA do horizontal */
        .org-tree li.org-li:last-child::after  { border: 0 none; }
        /* Cantos arredondados nos extremos para suavizar a junção */
        .org-tree li.org-li:last-child::before {
          border-right: 2px solid var(--rh-brand-500, #55588B);
          border-radius: 0 6px 0 0;
        }
        .org-tree li.org-li:first-child::after {
          border-radius: 6px 0 0 0;
        }

        /* Drop vertical do pai para os filhos: ul::before */
        .org-tree ul.org-ul::before {
          content: '';
          position: absolute;
          top: 0;
          left: 50%;
          border-left: 2px solid var(--rh-brand-500, #55588B);
          width: 0;
          height: 24px;
        }

        /* Raiz: sem linhas vindo de cima */
        .org-tree ul.org-root > li.org-li::before,
        .org-tree ul.org-root > li.org-li::after {
          display: none;
        }
        .org-tree ul.org-root > li.org-li { padding-top: 0; }

        /* Card base — Akaunting light clean */
        .org-node {
          position: relative;
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          padding: 16px 18px 12px;
          min-width: 200px;
          max-width: 240px;
          text-align: center;
          cursor: grab;
          user-select: none;
          border-radius: 12px;
          background: #FFFFFF;
          border: 1px solid var(--color-border);
          box-shadow: 0 1px 3px rgba(17,24,39,.06), 0 1px 2px rgba(17,24,39,.04);
          transition: transform .2s cubic-bezier(.2,.8,.2,1), box-shadow .2s, border-color .2s;
          animation: orgFadeUp .32s cubic-bezier(.2,.8,.2,1) both;
        }

        .org-node:active { cursor: grabbing; }

        .org-node:hover {
          transform: translateY(-2px);
          border-color: rgba(85,88,139,.35);
          box-shadow: 0 8px 20px rgba(17,24,39,.1), 0 4px 8px rgba(17,24,39,.06);
        }

        /* Variantes por nível — paleta Akaunting */
        .org-node.node-encarregado {
          min-width: 230px;
          padding: 20px 22px 14px;
          border-top: 3px solid #55588B;
          box-shadow: 0 2px 6px rgba(85,88,139,.1), 0 1px 2px rgba(85,88,139,.06);
        }
        .org-node.node-encarregado:hover {
          border-color: rgba(85,88,139,.5);
          border-top-color: #55588B;
          box-shadow: 0 10px 24px rgba(85,88,139,.18), 0 4px 8px rgba(85,88,139,.1);
        }

        .org-node.node-lider_area {
          min-width: 210px;
          border-top: 3px solid #6D9480;
        }
        .org-node.node-lider_area:hover {
          border-color: rgba(109,148,128,.5);
          border-top-color: #6D9480;
          box-shadow: 0 8px 20px rgba(109,148,128,.16), 0 4px 8px rgba(109,148,128,.08);
        }

        .org-node.node-profissional {
          min-width: 190px;
          border-top: 3px solid #9CA3AF;
        }
        .org-node.node-profissional:hover {
          border-color: rgba(156,163,175,.55);
          border-top-color: #6B7280;
        }

        /* Avatar com iniciais */
        .org-avatar {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Nunito', sans-serif;
          font-weight: 700;
          font-size: 15px;
          letter-spacing: -.02em;
          color: #0D0F18;
          box-shadow: 0 4px 12px rgba(0,0,0,.3), 0 0 0 3px rgba(255,255,255,.04);
          flex-shrink: 0;
        }
        .node-encarregado .org-avatar {
          width: 52px; height: 52px; font-size: 17px;
          color: #fff;
          background: linear-gradient(135deg, #8B8FBF 0%, #55588B 45%, #3E4068 100%);
          box-shadow:
            0 0 0 3px rgba(85,88,139,.18),
            0 4px 18px rgba(85,88,139,.45),
            inset 0 1px 0 rgba(255,255,255,.22);
        }
        .node-lider_area .org-avatar {
          color: #fff;
          background: linear-gradient(135deg, #A5C4B0 0%, #6D9480 45%, #4D7360 100%);
          box-shadow:
            0 0 0 3px rgba(109,148,128,.18),
            0 4px 14px rgba(109,148,128,.42),
            inset 0 1px 0 rgba(255,255,255,.2);
        }
        .node-profissional .org-avatar {
          width: 40px; height: 40px; font-size:15px;
          color: #fff;
          background: linear-gradient(135deg, #D1D5DB 0%, #9CA3AF 45%, #6B7280 100%);
          box-shadow:
            0 0 0 3px rgba(156,163,175,.15),
            0 3px 12px rgba(156,163,175,.32),
            inset 0 1px 0 rgba(255,255,255,.2);
        }

        .org-info { width: 100%; }

        .org-node-nome {
          font-family: 'Nunito', sans-serif;
          font-weight: 700;
          font-size: 16px;
          color: #1F2937 !important;
          background: none;
          border: none;
          padding: 4px 6px;
          margin: 0;
          cursor: pointer;
          letter-spacing: -.015em;
          line-height: 1.25;
          border-radius: 4px;
          transition: color .15s, background .15s;
          width: 100%;
          display: block;
          word-break: break-word;
          text-shadow: none;
        }
        .node-encarregado .org-node-nome { font-size: 17.5px; font-weight: 800; }
        .node-lider_area  .org-node-nome { font-size: 16.5px; }
        .org-node-nome:hover {
          color: #55588B !important;
          background: rgba(85,88,139,.1);
        }

        .org-cargo {
          font-size:15px;
          font-weight: 600;
          margin-top: 2px;
        }
        .node-encarregado .org-cargo { color: #55588B; }
        .node-lider_area  .org-cargo { color: #4D7360; }
        .node-profissional .org-cargo { color: #374151; }

        .org-area {
          font-size:15px;
          color: var(--color-text-muted);
          font-weight: 500;
          margin-top: 1px;
        }

        .org-nivel-tag {
          display: inline-block;
          margin-top: 6px;
          padding: 2px 8px;
          font-size:15px;
          font-weight: 700;
          letter-spacing: .08em;
          text-transform: uppercase;
          color: var(--color-text-muted);
          background: var(--color-surface-2);
          border: 1px solid var(--color-border);
          border-radius: 99px;
          font-family: 'Nunito', sans-serif;
        }

        /* Contador de subordinados */
        .org-node-count {
          position: absolute;
          top: -8px;
          right: -8px;
          min-width: 22px;
          height: 22px;
          padding: 0 7px;
          background: var(--color-primary);
          color: #FFFFFF;
          font-family: 'Nunito', sans-serif;
          font-size:15px;
          font-weight: 700;
          border-radius: 99px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 6px rgba(85,88,139,.35), 0 0 0 3px var(--color-surface-2);
          z-index: 2;
        }

        /* Ações */
        .org-actions {
          display: flex;
          gap: 4px;
          margin-top: 8px;
          opacity: 0;
          transform: translateY(-2px);
          transition: opacity .2s, transform .2s;
        }
        .org-node:hover .org-actions {
          opacity: 1;
          transform: translateY(0);
        }
        .org-action-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 26px;
          background: var(--color-surface-2);
          border: 1px solid var(--color-border);
          color: var(--color-text-muted);
          border-radius: 6px;
          cursor: pointer;
          padding: 0;
          transition: background .15s, color .15s, border-color .15s, transform .1s;
        }
        .org-action-btn:hover {
          background: rgba(85,88,139,.1);
          border-color: rgba(85,88,139,.3);
          color: var(--color-primary);
          transform: scale(1.06);
        }
        .org-action-btn.danger:hover {
          background: rgba(220,38,38,.08);
          border-color: rgba(220,38,38,.3);
          color: var(--color-danger);
        }

        /* Dragging */
        .org-node.dragging {
          opacity: .5;
          transform: scale(.94) rotate(-1deg);
          box-shadow: 0 20px 40px rgba(17,24,39,.15), 0 0 0 2px var(--color-primary);
          cursor: grabbing;
        }
        .org-node.drop-target {
          border-color: var(--color-primary) !important;
          box-shadow:
            0 0 0 2px var(--color-primary),
            0 8px 24px rgba(85,88,139,.2) !important;
          transform: translateY(-4px) scale(1.03);
        }
        .org-node.drop-invalid {
          border-color: var(--color-danger) !important;
          box-shadow:
            0 0 0 2px var(--color-danger),
            0 8px 24px rgba(220,38,38,.18) !important;
        }

        /* Dica no rodapé */
        .org-tree-hint {
          margin: var(--sp-xl) auto 0;
          max-width: 520px;
          padding: 10px 16px;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: 10px;
          font-size:15px;
          color: var(--color-text-muted);
          text-align: center;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .org-tree-hint svg { flex-shrink: 0; opacity: .7; }

        /* Reduced motion */
        @media (prefers-reduced-motion: reduce) {
          .org-node { animation: none !important; transition: none !important; }
        }

        /* Mobile */
        @media (max-width: 768px) {
          .org-tree { padding: var(--sp-lg) var(--sp-sm); }
          .org-node { min-width: 170px; padding: 12px 12px 10px; }
          .org-node.node-encarregado { min-width: 190px; padding: 14px 14px 10px; }
          .org-avatar { width: 38px; height: 38px; font-size:15px; }
          .node-encarregado .org-avatar { width: 44px; height: 44px; font-size: 15px; }
        }
      </style>
    `;

    if (raizes.length === 0) {
      return treeCss + '<div class="org-tree"><p class="text-muted rh-text-center">Nenhum membro cadastrado.</p></div>';
    }

    const zoomCtrlCss = `
      <style>
        .org-zoom-bar {
          position: sticky; top: 8px; z-index: 5;
          display: inline-flex; gap: 4px;
          background: var(--rh-paper, #fff);
          border: 1px solid var(--rh-ink-200, #E2E8F0);
          border-radius: var(--rh-r-sm, 6px);
          padding: 4px;
          box-shadow: var(--rh-shadow-sm, 0 1px 2px rgba(0,0,0,.06));
          margin-bottom: 12px;
        }
        .org-zoom-btn {
          width: 32px; height: 32px;
          border: none;
          background: transparent;
          color: var(--rh-ink-700, #334155);
          border-radius: 4px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          font-weight: 600;
          transition: background .12s;
        }
        .org-zoom-btn:hover { background: var(--rh-ink-100, #F1F5F9); }
        .org-zoom-btn:disabled { opacity: .35; cursor: not-allowed; }
        .org-zoom-label {
          min-width: 48px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          font-weight: 600;
          color: var(--rh-ink-500, #64748B);
          font-variant-numeric: tabular-nums;
        }
        .org-zoom-wrap {
          overflow: auto;
          max-width: 100%;
        }
        .org-zoom-content {
          transform-origin: top left;
          transition: transform .15s ease;
        }
      </style>
    `;
    return treeCss + zoomCtrlCss + `
      <div class="org-zoom-bar" role="toolbar" aria-label="Controles de zoom do organograma">
        <button class="org-zoom-btn" id="orgZoomOut" aria-label="Diminuir zoom" title="Zoom −">−</button>
        <span class="org-zoom-label" id="orgZoomLabel">100%</span>
        <button class="org-zoom-btn" id="orgZoomIn" aria-label="Aumentar zoom" title="Zoom +">+</button>
        <button class="org-zoom-btn" id="orgZoomReset" aria-label="Restaurar zoom 100%" title="Restaurar 100%" style="font-size:13px;">⟲</button>
      </div>
      <div class="org-zoom-wrap">
        <div class="org-zoom-content" id="orgZoomContent">
          <div class="org-tree">
            <ul class="org-root">
              ${raizes.map(r => this._renderNodeOrg(r, membros)).join('')}
            </ul>
            <div class="org-tree-hint">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>
              </svg>
              Arraste um card sobre outro para alterar o supervisor direto. Clique no nome para ver detalhes. Use os botões de zoom para ver a equipe inteira.
            </div>
          </div>
        </div>
      </div>
    `;
  },

  attachOrganogramaListeners(contract) {
    const contractId = contract.id;

    const btnH = document.getElementById('btnOrgViewH');
    const btnL = document.getElementById('btnOrgViewL');
    if (btnH) btnH.addEventListener('click', () => this._switchOrgView('hierarquia', contract));
    if (btnL) btnL.addEventListener('click', () => this._switchOrgView('lista', contract));

    const btnNovo = document.getElementById('btnNovoMembroOrg');
    if (btnNovo) btnNovo.addEventListener('click', () => this.showModalOrganograma(contractId));

    // Zoom do organograma — persiste em sessionStorage
    const ZOOM_KEY = 'rhino-org-zoom';
    const ZOOM_MIN = 0.4, ZOOM_MAX = 1.5, ZOOM_STEP = 0.1;
    const content = document.getElementById('orgZoomContent');
    const label   = document.getElementById('orgZoomLabel');
    const btnIn   = document.getElementById('orgZoomIn');
    const btnOut  = document.getElementById('orgZoomOut');
    const btnRst  = document.getElementById('orgZoomReset');
    if (content && label && btnIn && btnOut) {
      let zoom = parseFloat(sessionStorage.getItem(ZOOM_KEY) || '1') || 1;
      const apply = () => {
        zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));
        content.style.transform = `scale(${zoom})`;
        // Reserva espaço pra evitar corte: ajusta altura/width do wrap
        content.style.width = (100 / zoom) + '%';
        label.textContent = Math.round(zoom * 100) + '%';
        btnIn.disabled  = zoom >= ZOOM_MAX;
        btnOut.disabled = zoom <= ZOOM_MIN;
        sessionStorage.setItem(ZOOM_KEY, String(zoom));
      };
      btnIn.addEventListener('click',  () => { zoom += ZOOM_STEP; apply(); });
      btnOut.addEventListener('click', () => { zoom -= ZOOM_STEP; apply(); });
      if (btnRst) btnRst.addEventListener('click', () => { zoom = 1; apply(); });
      apply();
    }

    this._attachOrgRowListeners(contract);
  },

  _attachOrgRowListeners(contract) {
    document.querySelectorAll('.btn-editar-org').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const membroId = e.currentTarget.dataset.id;
        const membro = (contract.organograma || []).find(m => m.id === membroId);
        this.showModalOrganograma(contract.id, membro);
      });
    });
    document.querySelectorAll('.btn-excluir-org').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteMembroOrganograma(contract.id, e.currentTarget.dataset.id);
      });
    });
    document.querySelectorAll('.org-node-nome').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const card = el.closest('.org-node');
        const recursoId = card?.dataset.recursoId;
        if (recursoId) this.showDetalheColaborador(recursoId);
      });
    });
    this._attachDragDrop(contract);
  },

  _calcProximaFolgaRecurso(r) {
    if (!r.alocacaoAtual || !r.alocacaoAtual.dataInicio) return null;
    const ciclo = parseInt(r.alocacaoAtual.cicloTrabalho) || 21;
    const inicio = new Date(r.alocacaoAtual.dataInicio + 'T12:00:00');
    const folgas = (r.folgas || []).slice().sort((a, b) => new Date(b.dataInicio) - new Date(a.dataInicio));
    const ultima = folgas[0];
    const base = ultima?.dataFim ? new Date(ultima.dataFim + 'T12:00:00') : inicio;
    const proxima = new Date(base);
    proxima.setDate(proxima.getDate() + ciclo);
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const diasRestantes = Math.ceil((proxima - hoje) / 86400000);
    return { dataProxima: proxima.toISOString().split('T')[0], diasRestantes };
  },

  showDetalheColaborador(recursoId) {
    const r = (Store.state.recursos || []).find(x => x.id === recursoId);
    if (!r) { showToast('Recurso não encontrado', 'error'); return; }

    const fmt = (d) => {
      if (!d) return '—';
      const [y, m, day] = d.split('-');
      return `${day}/${m}/${y}`;
    };

    const contratoAtual = r.alocacaoAtual?.contractId
      ? (Store.state.contracts || []).find(c => c.id === r.alocacaoAtual.contractId)
      : null;

    const folgas = (r.folgas || []).slice().sort((a, b) => new Date(b.dataInicio) - new Date(a.dataInicio));
    const proxima = r.status === 'funcionario' ? this._calcProximaFolgaRecurso(r) : null;

    let proximaHtml = '';
    if (proxima) {
      const { diasRestantes, dataProxima } = proxima;
      const cor = diasRestantes < 0 ? '#DC2626' : diasRestantes <= 5 ? '#D97706' : '#059669';
      const label = diasRestantes < 0
        ? `Vencida há ${Math.abs(diasRestantes)} dia(s)`
        : diasRestantes === 0 ? 'Hoje' : `em ${diasRestantes} dia(s)`;
      proximaHtml = `
        <div style="padding:var(--sp-md);background:${cor}14;border-left:3px solid ${cor};border-radius:6px;margin-bottom:var(--sp-md);">
          <div style="font-size:15px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em;">Próxima Folga</div>
          <div style="font-size:18px;font-weight:700;color:${cor};margin-top:2px;">${label}</div>
          <div class="rh-meta">Prevista para ${fmt(dataProxima)}</div>
        </div>
      `;
    }

    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const docs = r.documentos || [];
    const docsHtml = docs.length === 0
      ? `<p class="text-muted" style="font-size:15px;">Nenhum documento cadastrado.</p>`
      : `<div style="display:flex;flex-direction:column;gap:6px;">
          ${docs.map(d => {
            let statusLbl = '', statusCor = 'var(--color-text-muted)';
            if (d.dataVencimento) {
              const dias = Math.ceil((new Date(d.dataVencimento + 'T12:00:00') - hoje) / 86400000);
              if (dias < 0)      { statusLbl = `Vencido há ${Math.abs(dias)}d`; statusCor = 'var(--color-danger)'; }
              else if (dias === 0){ statusLbl = `Vence hoje`;  statusCor = 'var(--color-warning)'; }
              else if (dias <= 30){ statusLbl = `Vence em ${dias}d`; statusCor = 'var(--color-warning)'; }
              else               { statusLbl = `Válido (${dias}d)`; statusCor = 'var(--color-success)'; }
            } else {
              statusLbl = 'Sem vencimento'; statusCor = 'var(--color-text-muted)';
            }
            return `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--color-bg);border:1px solid var(--color-border);border-radius:6px;">
                <div>
                  <div style="font-size: 15px;font-weight:600;">${escapeHtml(d.tipo || 'Documento')}</div>
                  ${d.dataVencimento ? `<div class="rh-meta">Venc.: ${fmt(d.dataVencimento)}</div>` : ''}
                </div>
                <span style="font-size:15px;font-weight:700;color:${statusCor};">${statusLbl}</span>
              </div>
            `;
          }).join('')}
        </div>`;

    // ─── Métricas de Aderência / Histórico ───
    const calcDias = (ini, fim) => {
      if (!ini) return 0;
      const di = new Date(ini + 'T12:00:00');
      const df = fim ? new Date(fim + 'T12:00:00') : hoje;
      return Math.max(0, Math.round((df - di) / 86400000));
    };
    const diasNaEmpresa = r.dataAdmissao
      ? calcDias(r.dataAdmissao, r.status === 'ex_funcionario' ? r.dataDesligamento : null)
      : 0;
    const historico = Array.isArray(r.historicoAlocacoes) ? r.historicoAlocacoes : [];
    const obrasPassadas = historico.length + (r.alocacaoAtual?.contractId ? 1 : 0);
    let diasTrabalhadosObras = 0;
    historico.forEach(h => { diasTrabalhadosObras += calcDias(h.dataInicio, h.dataFim); });
    if (r.alocacaoAtual?.dataInicio) diasTrabalhadosObras += calcDias(r.alocacaoAtual.dataInicio, null);

    let diasEmFolga = 0;
    folgas.forEach(f => { if (f.dataInicio && f.dataFim) diasEmFolga += calcDias(f.dataInicio, f.dataFim); });

    const docsVigentes = docs.filter(d => {
      if (!d.dataVencimento) return false;
      return new Date(d.dataVencimento + 'T12:00:00') >= hoje;
    }).length;
    const docsVencidos = docs.filter(d => {
      if (!d.dataVencimento) return false;
      return new Date(d.dataVencimento + 'T12:00:00') < hoje;
    }).length;
    const aderenciaDocs = docs.length > 0 ? Math.round((docsVigentes / docs.length) * 100) : 0;
    const corAderencia = aderenciaDocs >= 90 ? 'var(--color-success)' : aderenciaDocs >= 70 ? '#F59E0B' : 'var(--color-danger)';

    const fmtDias = (d) => {
      if (d < 30) return `${d} dia${d !== 1 ? 's' : ''}`;
      if (d < 365) return `${(d / 30).toFixed(1)} meses`;
      return `${(d / 365).toFixed(1)} anos`;
    };

    const aderenciaHtml = `
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:var(--sp-lg);">
        <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;border-left:3px solid #3B82F6;">
          <div style="font-size:11px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em;">Tempo na empresa</div>
          <div style="font-size:18px;font-weight:700;margin-top:4px;">${diasNaEmpresa > 0 ? fmtDias(diasNaEmpresa) : '—'}</div>
        </div>
        <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;border-left:3px solid #8B5CF6;">
          <div style="font-size:11px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em;">Obras realizadas</div>
          <div style="font-size:18px;font-weight:700;margin-top:4px;">${obrasPassadas}</div>
          <div style="font-size:11px;color:var(--color-text-muted);">${historico.length} concluída${historico.length !== 1 ? 's' : ''}${r.alocacaoAtual ? ' + 1 atual' : ''}</div>
        </div>
        <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;border-left:3px solid #10B981;">
          <div style="font-size:11px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em;">Dias em obra</div>
          <div style="font-size:18px;font-weight:700;margin-top:4px;">${diasTrabalhadosObras}</div>
          <div style="font-size:11px;color:var(--color-text-muted);">${diasEmFolga} dias em folga</div>
        </div>
        <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;border-left:3px solid ${corAderencia};">
          <div style="font-size:11px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em;">Aderência docs</div>
          <div style="font-size:18px;font-weight:700;margin-top:4px;color:${corAderencia};">${docs.length > 0 ? aderenciaDocs + '%' : '—'}</div>
          <div style="font-size:11px;color:var(--color-text-muted);">${docsVigentes} vigente${docsVigentes !== 1 ? 's' : ''}${docsVencidos > 0 ? `, ${docsVencidos} venc.` : ''}</div>
        </div>
      </div>
    `;

    // Histórico de obras (em formato compacto)
    const historicoObrasHtml = (historico.length === 0 && !r.alocacaoAtual)
      ? `<p class="text-muted" style="font-size:13px;">Sem histórico de alocações.</p>`
      : `<div style="max-height:160px;overflow-y:auto;">
          ${r.alocacaoAtual?.contractId ? (() => {
            const c = (Store.state.contracts || []).find(x => x.id === r.alocacaoAtual.contractId);
            const dias = calcDias(r.alocacaoAtual.dataInicio, null);
            return `<div style="padding:8px 10px;background:rgba(34,197,94,.08);border-left:3px solid var(--color-success);border-radius:4px;margin-bottom:4px;font-size:13px;">
              <strong>${escapeHtml(c?.name || 'Obra atual')}</strong>
              <span class="text-muted"> · em andamento · ${dias} dia${dias !== 1 ? 's' : ''}</span>
            </div>`;
          })() : ''}
          ${historico.slice().reverse().map(h => {
            const c = (Store.state.contracts || []).find(x => x.id === h.contractId);
            const dias = calcDias(h.dataInicio, h.dataFim);
            return `<div style="padding:8px 10px;background:var(--color-bg);border-left:3px solid var(--color-text-muted);border-radius:4px;margin-bottom:4px;font-size:13px;">
              <strong>${escapeHtml(c?.name || h.contractName || 'Obra removida')}</strong>
              <div class="text-muted" style="font-size:12px;">${fmt(h.dataInicio)} → ${fmt(h.dataFim)} · ${dias} dia${dias !== 1 ? 's' : ''}</div>
            </div>`;
          }).join('')}
        </div>`;

    const folgasHtml = folgas.length === 0
      ? `<p class="text-muted" style="font-size:15px;">Nenhuma folga registrada.</p>`
      : `<div style="max-height:180px;overflow-y:auto;">
          <table style="width:100%;font-size:15px;">
            <thead>
              <tr style="text-align:left;">
                <th scope="col" style="padding:6px 0;border-bottom:1px solid var(--color-border);">Início</th>
                <th scope="col" style="padding:6px 0;border-bottom:1px solid var(--color-border);">Fim</th>
                <th scope="col" style="padding:6px 0;border-bottom:1px solid var(--color-border);text-align:center;">Passagem Ida</th>
                <th scope="col" style="padding:6px 0;border-bottom:1px solid var(--color-border);text-align:center;">Volta</th>
              </tr>
            </thead>
            <tbody>
              ${folgas.slice(0, 6).map(f => `
                <tr>
                  <td style="padding:6px 0;border-bottom:1px solid var(--color-border);">${fmt(f.dataInicio)}</td>
                  <td style="padding:6px 0;border-bottom:1px solid var(--color-border);">${fmt(f.dataFim)}</td>
                  <td style="padding:6px 0;border-bottom:1px solid var(--color-border);text-align:center;">${f.passagemIda?.comprada ? '✓' : '—'}</td>
                  <td style="padding:6px 0;border-bottom:1px solid var(--color-border);text-align:center;">${f.passagemVolta?.comprada ? '✓' : '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          ${folgas.length > 6 ? `<div style="text-align:center;font-size:15px;color:var(--color-text-muted);margin-top:4px;">+ ${folgas.length - 6} folga(s) mais antigas</div>` : ''}
        </div>`;

    const statusBadge = {
      funcionario:    `<span class="badge" style="background:rgba(34,197,94,.15);color:#22C55E;">Funcionário</span>`,
      candidato:      `<span class="badge" style="background:rgba(96,165,250,.15);color:#60A5FA;">Candidato</span>`,
      ex_funcionario: `<span class="badge" style="background:rgba(75,93,123,.2);color:var(--color-text-muted);">Ex-Funcionário</span>`
    }[r.status] || '';

    const html = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal" style="width:720px;max-height:90vh;overflow-y:auto;">
          <div class="modal-header">
            <div>
              <h2 class="modal-title">${escapeHtml(r.nome || '—')}</h2>
              <div style="font-size:15px;color:var(--color-text-muted);margin-top:4px;">
                ${r.profissao ? escapeHtml(r.profissao) : 'Sem profissão cadastrada'} ${statusBadge}
              </div>
            </div>
            <button class="modal-close">✕</button>
          </div>

          <div class="modal-content">
            ${proximaHtml}

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-lg);margin-bottom:var(--sp-lg);">
              <div>
                <div style="font-size:15px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.07em;font-weight:700;margin-bottom:var(--sp-sm);">Dados Pessoais</div>
                <div style="font-size: 15px;line-height:1.8;">
                  <div><strong>CPF:</strong> ${escapeHtml(r.cpf) || '—'}</div>
                  <div><strong>Nascimento:</strong> ${fmt(r.dataNascimento)}</div>
                  <div><strong>Telefone:</strong> ${escapeHtml(r.telefone) || '—'}</div>
                  <div><strong>Email:</strong> ${escapeHtml(r.email) || '—'}</div>
                  <div><strong>Endereço:</strong> ${r.endereco ? escapeHtml(r.endereco) : '—'}</div>
                </div>
              </div>
              <div>
                <div style="font-size:15px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.07em;font-weight:700;margin-bottom:var(--sp-sm);">Dados Profissionais</div>
                <div style="font-size: 15px;line-height:1.8;">
                  <div><strong>Admissão:</strong> ${fmt(r.dataAdmissao)}</div>
                  <div><strong>Salário:</strong> ${r.salario ? Store.formatBRL(r.salario) : '—'}</div>
                  <div><strong>CNH:</strong> ${escapeHtml(r.cnh) || '—'}</div>
                  <div><strong>PIS:</strong> ${escapeHtml(r.pis) || '—'}</div>
                  ${contratoAtual ? `<div><strong>Obra atual:</strong> ${escapeHtml(contratoAtual.name)}</div>` : ''}
                  ${r.alocacaoAtual?.dataInicio ? `<div><strong>Início obra:</strong> ${fmt(r.alocacaoAtual.dataInicio)}</div>` : ''}
                  ${r.alocacaoAtual?.cicloTrabalho ? `<div><strong>Ciclo:</strong> ${r.alocacaoAtual.cicloTrabalho}×${r.alocacaoAtual.cicloFolga || 7} dias</div>` : ''}
                </div>
              </div>
            </div>

            <!-- Aderência / Histórico -->
            <div style="font-size:15px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.07em;font-weight:700;margin-bottom:var(--sp-sm);">📊 Aderência & Histórico</div>
            ${aderenciaHtml}

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-lg);margin-bottom:var(--sp-lg);">
              <div>
                <div style="font-size:13px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em;font-weight:600;margin-bottom:var(--sp-sm);">🏗️ Obras realizadas</div>
                ${historicoObrasHtml}
              </div>
              <div>
                <div style="font-size:13px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em;font-weight:600;margin-bottom:var(--sp-sm);">📅 Histórico de Folgas</div>
                ${folgasHtml}
              </div>
            </div>

            <div>
              <div style="font-size:13px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em;font-weight:600;margin-bottom:var(--sp-sm);">📋 Documentação</div>
              ${docsHtml}
            </div>

            <div class="text-muted" style="font-size:12px;margin-top:var(--sp-md);padding:8px 12px;background:var(--color-surface-2);border-radius:4px;">
              ℹ️ Métricas baseadas em alocações registradas. RDOs hoje agrupam presença por cargo, não por nome — para
              "presença diária por pessoa", precisa adicionar registro nominal no RDO.
            </div>
          </div>

          <div class="modal-footer">
            <a href="#/recursos" class="btn btn-secondary" id="btnIrRecursos">Gerenciar em Recursos</a>
            <button type="button" class="btn btn-primary" id="btnFecharDetalhe">Fechar</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

    const overlay = document.getElementById('modalOverlay');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnFecharDetalhe').addEventListener('click', close);
    // FIX: "Gerenciar em Recursos" era um <a href="#/recursos"> sem handler.
    // Quando este modal é aberto de DENTRO da tela de Recursos, o hash já é
    // #/recursos — clicar no link não muda o hash, o navegador não dispara
    // navegação e nada acontecia (o modal nem fechava). Agora: fecha o detalhe
    // e, se já estiver em Recursos, abre direto a gestão da pessoa; se veio de
    // outra tela (organograma de contrato), navega para #/recursos.
    const btnGerenciar = document.getElementById('btnIrRecursos');
    if (btnGerenciar) {
      btnGerenciar.addEventListener('click', (e) => {
        e.preventDefault();
        close();
        const naTelaRecursos = location.hash.replace(/\/+$/, '') === '#/recursos';
        if (naTelaRecursos && window.Recursos && typeof window.Recursos.showModal === 'function') {
          window.Recursos.showModal(recursoId);
        } else {
          location.hash = '#/recursos';
        }
      });
    }
  },

  // ── Drag & Drop no organograma ────────────────────────────────
  _attachDragDrop(contract) {
    const nodes = document.querySelectorAll('.org-node[draggable="true"]');
    if (!nodes.length) return;

    nodes.forEach(node => {
      node.addEventListener('dragstart', (e) => {
        node.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', node.dataset.id);
      });

      node.addEventListener('dragend', () => {
        node.classList.remove('dragging');
        document.querySelectorAll('.org-node').forEach(n => {
          n.classList.remove('drop-target', 'drop-invalid');
        });
      });

      node.addEventListener('dragover', (e) => {
        const draggingId = document.querySelector('.org-node.dragging')?.dataset.id;
        const targetId = node.dataset.id;
        if (!draggingId || draggingId === targetId) return;

        e.preventDefault();
        const ok = this._podeReparentar(draggingId, targetId, contract.organograma || []);
        node.classList.remove('drop-target', 'drop-invalid');
        node.classList.add(ok ? 'drop-target' : 'drop-invalid');
        e.dataTransfer.dropEffect = ok ? 'move' : 'none';
      });

      node.addEventListener('dragleave', () => {
        node.classList.remove('drop-target', 'drop-invalid');
      });

      node.addEventListener('drop', async (e) => {
        e.preventDefault();
        const draggingId = e.dataTransfer.getData('text/plain');
        const targetId = node.dataset.id;
        node.classList.remove('drop-target', 'drop-invalid');
        if (!draggingId || draggingId === targetId) return;

        const organograma = contract.organograma || [];
        if (!this._podeReparentar(draggingId, targetId, organograma)) {
          showToast('Não é possível mover este nó para aqui.', 'warning');
          return;
        }

        const arrastado = organograma.find(m => m.id === draggingId);
        const alvo = organograma.find(m => m.id === targetId);
        if (!arrastado || !alvo) return;

        // Ajusta nível automaticamente conforme o alvo
        let novoNivel = arrastado.nivel;
        if (alvo.nivel === 'encarregado' && arrastado.nivel !== 'encarregado') {
          novoNivel = 'lider_area';
        } else if (alvo.nivel === 'lider_area') {
          novoNivel = 'profissional';
        }

        try {
          await Store.updateMembroOrganograma(contract.id, draggingId, {
            supervisorId: alvo.id,
            nivel: novoNivel,
            area: novoNivel === 'lider_area' ? (arrastado.area || alvo.area || 'Geral') : null
          });
          showToast(`${this._getRecursoNome(arrastado.recursoId)} agora reporta-se a ${this._getRecursoNome(alvo.recursoId)}.`, 'success');
          this.render({ id: contract.id });
        } catch (err) {
          showToast(err.message || 'Erro ao mover.', 'error');
        }
      });
    });
  },

  _podeReparentar(arrastadoId, alvoId, organograma) {
    if (arrastadoId === alvoId) return false;
    const arrastado = organograma.find(m => m.id === arrastadoId);
    const alvo = organograma.find(m => m.id === alvoId);
    if (!arrastado || !alvo) return false;

    // Encarregado não pode virar subordinado de ninguém
    if (arrastado.nivel === 'encarregado') return false;

    // Não pode mover um ancestral para dentro de seu próprio descendente (evita ciclo)
    let cursor = alvo;
    while (cursor && cursor.supervisorId) {
      if (cursor.supervisorId === arrastadoId) return false;
      cursor = organograma.find(m => m.id === cursor.supervisorId);
    }

    // Só faz sentido soltar sob encarregado ou líder
    if (alvo.nivel === 'profissional') return false;

    return true;
  },

  _switchOrgView(view, contract) {
    this._organogramaView = view;
    const body = document.getElementById('organogramaBody');
    if (!body) return;
    const membros = contract.organograma || [];
    body.innerHTML = membros.length === 0
      ? `<p class="text-muted" style="padding: var(--sp-lg);">Nenhum membro cadastrado.</p>`
      : (view === 'lista' ? this._renderOrganogramaLista(membros) : this._renderOrganogramaArvore(membros));
    // Atualiza estado dos botões de toggle
    const btnH = document.getElementById('btnOrgViewH');
    const btnL = document.getElementById('btnOrgViewL');
    if (btnH && btnL) {
      btnH.className = view === 'hierarquia' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
      btnL.className = view === 'lista'      ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
    }
    this._attachOrgRowListeners(contract);
  },

  showModalOrganograma(contractId, membro) {
    const contract = Store.getContractById(contractId);
    const organograma = contract.organograma || [];
    const recursos = (Store.state.recursos || []).filter(r => r.status === 'funcionario');

    // Recursos já no organograma (excluir no cadastro novo; permitir o do próprio membro em edição)
    const jaNoOrg = new Set(organograma.filter(m => !membro || m.id !== membro.id).map(m => m.recursoId));
    const recursosDisponiveis = recursos.filter(r => !jaNoOrg.has(r.id) || (membro && membro.recursoId === r.id));

    const temEncarregado = organograma.some(m => m.nivel === 'encarregado' && (!membro || m.id !== membro.id));
    const lideres = organograma.filter(m => m.nivel === 'lider_area' && (!membro || m.id !== membro.id));

    const nivelAtual = membro?.nivel || 'profissional';

    const html = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal" style="width: 560px;">
          <div class="modal-header">
            <h2 class="modal-title">${membro ? 'Editar Membro' : 'Adicionar Membro ao Organograma'}</h2>
            <button class="modal-close">✕</button>
          </div>
          <form id="formOrganograma" class="modal-content">
            <div class="form-group">
              <label class="form-label">Recurso (Funcionário) *</label>
              <select class="form-control" name="recursoId" required ${membro ? 'disabled' : ''}>
                <option value="">— Selecione —</option>
                ${recursosDisponiveis.map(r => `
                  <option value="${r.id}" ${membro?.recursoId === r.id ? 'selected' : ''}>
                    ${escapeHtml(r.nome)}${r.profissao ? ' — ' + escapeHtml(r.profissao) : ''}
                  </option>
                `).join('')}
              </select>
              ${membro ? `<input type="hidden" name="recursoId" value="${membro.recursoId}">` : ''}
              ${!membro && recursosDisponiveis.length === 0 ? `<div class="form-helper" style="color:var(--color-warning);">Todos os funcionários já estão no organograma.</div>` : ''}
            </div>

            <div class="form-group">
              <label class="form-label">Nível (deduzido da profissão)</label>
              <div id="orgNivelBadge" style="padding:10px 14px;border-radius:6px;background:var(--color-surface-2);border:1px solid var(--color-border);font-weight:600;font-size:15px;">—</div>
              <input type="hidden" name="nivel" id="orgNivel">
              <div class="form-helper">O nível vem da profissão cadastrada. Edite em <a href="#/recursos" style="color:var(--color-primary);">Recursos</a> se precisar mudar.</div>
            </div>

            <div class="form-group" id="orgAreaWrap" style="${nivelAtual === 'lider_area' ? '' : 'display:none;'}">
              <label class="form-label">Área *</label>
              <input class="form-control" name="area" value="${escapeHtml(membro?.area || '')}" placeholder="Ex: Mecânica, Elétrica, Andaimes, Segurança">
            </div>

            <div class="form-group" id="orgSupervisorWrap" style="${nivelAtual === 'encarregado' ? 'display:none;' : ''}">
              <label class="form-label">Supervisor Direto *</label>
              <select class="form-control" name="supervisorId" id="orgSupervisor">
                <option value="">— Selecione —</option>
              </select>
              <div class="form-helper" id="orgSupervisorHelp"></div>
            </div>

            <div class="modal-footer" style="margin-top:var(--sp-xl);">
              <button type="button" class="btn btn-secondary" id="btnCancelarOrg">Cancelar</button>
              <button type="submit" class="btn btn-primary">${membro ? 'Salvar Alterações' : 'Adicionar'}</button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

    const overlay = document.getElementById('modalOverlay');
    const nivelHidden = document.getElementById('orgNivel');
    const nivelBadge = document.getElementById('orgNivelBadge');
    const recursoSelect = overlay.querySelector('select[name="recursoId"]');
    const supervisorWrap = document.getElementById('orgSupervisorWrap');
    const supervisorSelect = document.getElementById('orgSupervisor');
    const supervisorHelp = document.getElementById('orgSupervisorHelp');
    const areaWrap = document.getElementById('orgAreaWrap');

    const encarregado = organograma.find(m => m.nivel === 'encarregado' && (!membro || m.id !== membro.id));

    const preencherSupervisores = (nivel) => {
      supervisorSelect.innerHTML = '<option value="">— Selecione —</option>';
      if (nivel === 'encarregado') {
        supervisorWrap.style.display = 'none';
        supervisorSelect.removeAttribute('required');
      } else if (nivel === 'lider_area') {
        supervisorWrap.style.display = '';
        supervisorSelect.removeAttribute('required');
        supervisorHelp.textContent = 'Opcional — indique o encarregado, se houver.';
        if (encarregado) {
          const selected = membro?.supervisorId === encarregado.id ? 'selected' : '';
          supervisorSelect.innerHTML += `<option value="${encarregado.id}" ${selected}>${escapeHtml(this._getRecursoNome(encarregado.recursoId))} (Encarregado)</option>`;
        } else {
          supervisorHelp.textContent = 'Nenhum encarregado cadastrado ainda.';
        }
      } else { // profissional
        supervisorWrap.style.display = '';
        supervisorSelect.setAttribute('required', 'required');
        supervisorHelp.textContent = 'Selecione o líder de área ao qual este profissional se reporta.';
        lideres.forEach(l => {
          const selected = membro?.supervisorId === l.id ? 'selected' : '';
          supervisorSelect.innerHTML += `<option value="${l.id}" ${selected}>${escapeHtml(this._getRecursoNome(l.recursoId))}${l.area ? ' — ' + escapeHtml(l.area) : ''}</option>`;
        });
        if (lideres.length === 0) {
          supervisorHelp.textContent = 'Nenhum Líder de Área cadastrado. Adicione um líder antes de incluir profissionais.';
        }
      }
    };

    const atualizarCamposCondicionais = () => {
      const rid = membro ? membro.recursoId : (recursoSelect ? recursoSelect.value : '');
      const rec = (Store.state.recursos || []).find(r => r.id === rid);
      const profissao = rec?.profissao || '';
      const nivel = rid ? inferirNivelOrganograma(profissao) : 'profissional';

      nivelHidden.value = nivel;
      const cor = NIVEL_COR[nivel] || '#999';
      nivelBadge.style.borderLeft = `3px solid ${cor}`;
      nivelBadge.style.color = cor;
      nivelBadge.innerHTML = rid
        ? `${NIVEL_LABEL[nivel]}${profissao ? ` <span style="color:var(--color-text-muted);font-weight:400;">· ${escapeHtml(profissao)}</span>` : ''}`
        : '— (selecione um recurso)';

      // Bloqueia adicionar segundo encarregado
      if (nivel === 'encarregado' && temEncarregado && !membro) {
        nivelBadge.innerHTML += ` <span style="color:var(--color-danger);font-weight:600;">· já existe um encarregado</span>`;
      }

      areaWrap.style.display = nivel === 'lider_area' ? '' : 'none';
      preencherSupervisores(nivel);
    };

    if (recursoSelect) recursoSelect.addEventListener('change', atualizarCamposCondicionais);
    atualizarCamposCondicionais();

    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnCancelarOrg').addEventListener('click', close);

    document.getElementById('formOrganograma').addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const recursoId = membro ? membro.recursoId : formData.get('recursoId');
      const recurso = (Store.state.recursos || []).find(r => r.id === recursoId);
      const payload = {
        recursoId,
        nivel:        formData.get('nivel'),
        cargo:        recurso?.profissao || '',
        supervisorId: formData.get('supervisorId') || null,
        area:         formData.get('area') || null
      };

      try {
        if (membro) {
          await Store.updateMembroOrganograma(contractId, membro.id, payload);
          showToast('Membro atualizado.', 'success');
        } else {
          await Store.createMembroOrganograma(contractId, payload);
          showToast('Membro adicionado ao organograma.', 'success');
        }
        close();
        this.render({ id: contractId });
      } catch (err) {
        showToast(err.message || 'Erro ao salvar.', 'error');
      }
    });
  },

  async deleteMembroOrganograma(contractId, membroId) {
    const contract = Store.getContractById(contractId);
    const membro = (contract.organograma || []).find(m => m.id === membroId);
    if (!membro) return;

    const nome = this._getRecursoNome(membro.recursoId);

    // Se for líder com subordinados, oferecer opções
    const subordinados = (contract.organograma || []).filter(m => m.supervisorId === membroId);
    let opts;
    if (membro.nivel === 'lider_area' && subordinados.length > 0) {
      const outrosLideres = (contract.organograma || []).filter(m => m.nivel === 'lider_area' && m.id !== membroId);
      const msg = `"${nome}" é líder de ${subordinados.length} profissional(is).\n\n` +
        (outrosLideres.length > 0
          ? `Opções:\n  1 = Remover líder e TODOS os ${subordinados.length} profissionais (cascata)\n  2 = Remover líder e reassociar profissionais a outro líder\n\nDigite 1 ou 2:`
          : `Não há outro líder para reassociar. Remover líder e TODOS os profissionais vinculados?\n\nDigite "SIM" para confirmar cascata:`);
      const resp = prompt(msg);
      if (resp === null) return;
      if (outrosLideres.length > 0) {
        if (resp.trim() === '1') {
          opts = { mode: 'cascade' };
        } else if (resp.trim() === '2') {
          const lista = outrosLideres.map((l, i) => `${i + 1}. ${this._getRecursoNome(l.recursoId)}${l.area ? ' — ' + l.area : ''}`).join('\n');
          const escolha = prompt(`Escolha o líder de destino:\n\n${lista}\n\nDigite o número:`);
          const idx = parseInt(escolha) - 1;
          if (isNaN(idx) || idx < 0 || idx >= outrosLideres.length) { showToast('Seleção inválida.', 'warning'); return; }
          opts = { mode: 'reassign', reassignTo: outrosLideres[idx].id };
        } else { return; }
      } else {
        if (resp.trim().toUpperCase() !== 'SIM') return;
        opts = { mode: 'cascade' };
      }
    } else {
      if (!confirm(`Remover "${nome}" do organograma?`)) return;
    }

    try {
      await Store.deleteMembroOrganograma(contractId, membroId, opts);
      showToast('Membro removido.', 'success');
      this.render({ id: contractId });
    } catch (err) {
      showToast(err.message || 'Erro ao remover.', 'error');
    }
  },

  });
})();
