window.Documentos = {
  busca: '',
  filtroConformidade: '',

  TIPOS_DOC: [
    { key: 'ASO',     label: 'ASO',     full: 'Atestado de Saúde Ocupacional',   meses: 12 },
    { key: 'PGR',     label: 'PGR',     full: 'Prog. Gerenciamento de Riscos',    meses: 24 },
    { key: 'PCMSO',   label: 'PCMSO',   full: 'Prog. Controle Médico de Saúde',  meses: 12 },
    { key: 'NR10',    label: 'NR-10',   full: 'Segurança em Eletricidade',        meses: 24 },
    { key: 'NR12',    label: 'NR-12',   full: 'Segurança em Máquinas',            meses: 24 },
    { key: 'NR18',    label: 'NR-18',   full: 'Construção Civil',                 meses: 12 },
    { key: 'NR20',    label: 'NR-20',   full: 'Líquidos Combustíveis',            meses: 12 },
    { key: 'NR33',    label: 'NR-33',   full: 'Espaço Confinado',                 meses: 12 },
    { key: 'NR35',    label: 'NR-35',   full: 'Trabalho em Altura',               meses: 24 },
    { key: 'CIPA',    label: 'CIPA',    full: 'Comissão Interna de Prevenção',    meses: 12 },
    { key: 'BRIGADA', label: 'Brigada', full: 'Brigada de Incêndio',              meses: 12 },
    { key: 'CNH',     label: 'CNH',     full: 'Habilitação',                      meses: 60 },
    { key: 'OUTRO',   label: 'Outro',   full: 'Outro',                            meses: 12 },
  ],

  _statusDoc(doc) {
    if (!doc.dataVencimento) return 'pendente';
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const venc = new Date(doc.dataVencimento + 'T12:00:00');
    const dias = Math.ceil((venc - hoje) / 86400000);
    if (dias < 0) return 'vencido';
    if (dias <= 30) return 'vencendo';
    return 'vigente';
  },

  _diasRestantes(doc) {
    if (!doc.dataVencimento) return null;
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const venc = new Date(doc.dataVencimento + 'T12:00:00');
    return Math.ceil((venc - hoje) / 86400000);
  },

  _badgeStatus(status, dias) {
    const configs = {
      vigente:  { bg: '#D1FAE5', color: '#065F46', label: 'Vigente' },
      vencendo: { bg: '#FEF3C7', color: '#92400E', label: dias !== null ? `Vence em ${dias}d` : 'Vencendo' },
      vencido:  { bg: '#FEE2E2', color: '#991B1B', label: dias !== null ? `Vencido há ${Math.abs(dias)}d` : 'Vencido' },
      pendente: { bg: '#F3F4F6', color: '#6B7280', label: 'Pendente' },
    };
    const c = configs[status] || configs.pendente;
    return `<span class="badge" style="background:${c.bg};color:${c.color};font-size:15px;">${c.label}</span>`;
  },

  _conformidade(recurso) {
    const docs = recurso.documentos || [];
    if (docs.length === 0) return { score: 0, vigentes: 0, total: 0, status: 'sem_docs' };
    const vigentes = docs.filter(d => this._statusDoc(d) === 'vigente').length;
    const vencidos = docs.filter(d => this._statusDoc(d) === 'vencido').length;
    const score = Math.round((vigentes / docs.length) * 100);
    let status = 'ok';
    if (vencidos > 0) status = 'critico';
    else if (score < 100) status = 'atencao';
    return { score, vigentes, total: docs.length, status };
  },

  _scoreBar(score) {
    const color = score === 100 ? '#059669' : score >= 70 ? '#D97706' : '#DC2626';
    return `
      <div style="display:flex;align-items:center;gap:6px;">
        <div style="flex:1;height:6px;background:var(--color-border);border-radius:3px;overflow:hidden;min-width:60px;">
          <div style="height:100%;width:${score}%;background:${color};border-radius:3px;transition:width .3s;"></div>
        </div>
        <span style="font-size:15px;font-weight:700;color:${color};min-width:32px;">${score}%</span>
      </div>`;
  },

  async render() {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading-spinner">Carregando...</div>';
    try {
      await Store.loadAll();
      this._renderLista();
    } catch (e) {
      console.error(e);
      app.innerHTML = '<div class="card"><p class="text-danger">Erro ao carregar. Tente novamente.</p></div>';
    }
  },

  _renderLista() {
    const app = document.getElementById('app');
    const recursos = (Store.state.recursos || []).filter(r => r.status === 'funcionario');
    const termo = (this.busca || '').toLowerCase().trim();

    const filtrados = recursos.filter(r => {
      const matchBusca = !termo ||
        (r.nome || '').toLowerCase().includes(termo) ||
        (r.profissao || '').toLowerCase().includes(termo);
      const conf = this._conformidade(r);
      const matchConf = !this.filtroConformidade ||
        (this.filtroConformidade === 'ok' && conf.status === 'ok') ||
        (this.filtroConformidade === 'atencao' && conf.status === 'atencao') ||
        (this.filtroConformidade === 'critico' && conf.status === 'critico') ||
        (this.filtroConformidade === 'sem_docs' && conf.status === 'sem_docs');
      return matchBusca && matchConf;
    });

    const totalAtivos = recursos.length;
    const comDocs = recursos.filter(r => (r.documentos || []).length > 0).length;
    const criticos = recursos.filter(r => this._conformidade(r).status === 'critico').length;
    const vencendo30 = recursos.reduce((acc, r) =>
      acc + (r.documentos || []).filter(d => this._statusDoc(d) === 'vencendo').length, 0);

    app.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Documentação</h1>
          <p class="page-subtitle">Controle de conformidade documental — ${totalAtivos} funcionário${totalAtivos !== 1 ? 's' : ''} ativo${totalAtivos !== 1 ? 's' : ''}</p>
        </div>
        <button class="btn btn-primary btn-lg" id="btnGerenciarTemplates">Gerenciar Templates</button>
      </div>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:var(--sp-md);margin-bottom:var(--sp-lg);">
        ${this._statCard('Funcionários Ativos', totalAtivos, 'var(--color-primary)', '◉')}
        ${this._statCard('Com Documentação', comDocs, '#059669', '✓')}
        ${criticos > 0
          ? this._statCard('Docs Vencidos', criticos, '#DC2626', '✕')
          : this._statCard('Docs em Dia', recursos.length - criticos, '#059669', '✓')}
        ${vencendo30 > 0
          ? this._statCard('Vencem em 30 dias', vencendo30, '#D97706', '⚑')
          : this._statCard('Vencem em 30 dias', 0, '#059669', '✓')}
      </div>

      <div class="card" style="padding:var(--sp-md);margin-bottom:var(--sp-lg);">
        <div style="display:flex;gap:var(--sp-md);align-items:center;flex-wrap:wrap;">
          <input class="form-control" id="inputBuscaDocs" placeholder="Buscar por nome, profissão..." value="${escapeHtml(this.busca)}" style="flex:1;min-width:200px;">
          <select class="form-control" id="filtroConformidade" style="width:220px;">
            <option value="">Todos os funcionários</option>
            <option value="ok"       ${this.filtroConformidade === 'ok'       ? 'selected' : ''}>Em dia (100%)</option>
            <option value="atencao"  ${this.filtroConformidade === 'atencao'  ? 'selected' : ''}>Com atenção</option>
            <option value="critico"  ${this.filtroConformidade === 'critico'  ? 'selected' : ''}>Crítico (vencidos)</option>
            <option value="sem_docs" ${this.filtroConformidade === 'sem_docs' ? 'selected' : ''}>Sem documentos</option>
          </select>
        </div>
      </div>

      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Funcionário</th>
                <th>Obra Atual</th>
                <th>Conformidade</th>
                <th>Documentos</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              ${filtrados.length === 0
                ? `<tr><td colspan="5" class="text-center text-muted" style="padding:var(--sp-xl);">Nenhum resultado encontrado</td></tr>`
                : filtrados.map(r => this._renderRow(r)).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('btnGerenciarTemplates').addEventListener('click', () => {
      window.Configuracao && (window.Configuracao.currentSection = 'doc_templates');
      location.hash = '#/configuracao';
    });
    document.getElementById('inputBuscaDocs').addEventListener('input', e => {
      this.busca = e.target.value;
      clearTimeout(this._tBusca);
      this._tBusca = setTimeout(() => this._renderLista(), 250);
    });
    document.getElementById('filtroConformidade').addEventListener('change', e => {
      this.filtroConformidade = e.target.value;
      this._renderLista();
    });
    document.querySelectorAll('.btn-ver-docs').forEach(b =>
      b.addEventListener('click', e => this.showDocumentos(e.target.closest('[data-id]').dataset.id)));
    document.querySelectorAll('.btn-nome-rec').forEach(b =>
      b.addEventListener('click', e => this.showFichaColaborador(e.target.closest('[data-id]').dataset.id)));
  },

  _statCard(label, value, cor, icon) {
    return `<div class="card" style="padding:var(--sp-lg);text-align:center;">
      <div style="font-size:28px;color:${cor};margin-bottom:4px;">${icon}</div>
      <div style="font-size:22px;font-weight:700;color:${cor};">${value}</div>
      <div style="font-size:15px;color:var(--color-text-muted);">${label}</div>
    </div>`;
  },

  _renderRow(r) {
    const docs = r.documentos || [];
    const conf = this._conformidade(r);

    let obraAtual = '—';
    if (r.alocacaoAtual?.contractId) {
      const c = Store.state.contracts.find(x => x.id === r.alocacaoAtual.contractId);
      if (c) obraAtual = escapeHtml(c.name);
    }

    const statusLabel = {
      ok:       `<span style="color:#059669;font-weight:600;">● Em dia</span>`,
      atencao:  `<span style="color:#D97706;font-weight:600;">● Atenção</span>`,
      critico:  `<span style="color:#DC2626;font-weight:600;">● Crítico</span>`,
      sem_docs: `<span style="color:#374151;">— Sem docs</span>`,
    }[conf.status];

    const docBadges = docs.slice(0, 4).map(d => {
      const status = this._statusDoc(d);
      const colors = { vigente: '#059669', vencendo: '#D97706', vencido: '#DC2626', pendente: '#9CA3AF' };
      const color = colors[status] || '#9CA3AF';
      const label = d.tipoLabel || d.tipo || '?';
      const short = label.length > 7 ? label.substring(0, 7) : label;
      return `<span title="${escapeHtml(label)}" style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:15px;font-weight:700;background:${color}22;color:${color};border:1px solid ${color}44;margin:1px;">${escapeHtml(short)}</span>`;
    }).join('');
    const extraDocs = docs.length > 4
      ? `<span style="font-size:15px;color:var(--color-text-muted);"> +${docs.length - 4}</span>`
      : '';

    return `<tr>
      <td>
        <a class="action-link btn-nome-rec" data-id="${r.id}" style="font-weight:700;font-size:15px;">${escapeHtml(r.nome) || '—'}</a>
        ${r.profissao ? `<div style="font-size:15px;color:var(--color-text-muted);">${escapeHtml(r.profissao)}</div>` : ''}
      </td>
      <td><span style="font-size:15px;">${obraAtual}</span></td>
      <td>
        ${statusLabel}
        ${docs.length > 0 ? `<div style="margin-top:4px;">${this._scoreBar(conf.score)}</div>` : ''}
      </td>
      <td>
        ${docs.length > 0
          ? docBadges + extraDocs
          : '<span style="font-size:15px;color:var(--color-text-muted);">Nenhum</span>'}
      </td>
      <td>
        <button class="btn btn-sm btn-ver-docs" data-id="${r.id}" style="white-space:nowrap;">
          ${docs.length > 0 ? `Ver ${docs.length} doc${docs.length !== 1 ? 's' : ''}` : '+ Adicionar'}
        </button>
      </td>
    </tr>`;
  },

  _fmtDate(d) {
    if (!d) return '—';
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  },

  _badgeValidacao(d) {
    if (!d.templateId) return `<span style="font-size:12px;color:var(--color-text-muted);">—</span>`;
    const v = d.validacao;
    if (!v) return `<span class="badge" style="background:#F3F4F6;color:#6B7280;font-size:12px;padding:2px 8px;border-radius:10px;">⏳ Não validado</span>`;
    const cfg = {
      conforme:     { bg: '#D1FAE5', color: '#065F46', label: '✅ Conforme' },
      parcial:      { bg: '#FEF3C7', color: '#92400E', label: '⚠️ Parcial' },
      nao_conforme: { bg: '#FEE2E2', color: '#991B1B', label: '❌ Não conforme' },
      nao_validado: { bg: '#F3F4F6', color: '#6B7280', label: '⏳ Não validado' },
    }[v.status] || { bg: '#F3F4F6', color: '#6B7280', label: v.status };
    const score = v.score != null ? ` ${v.score}%` : '';
    return `<span class="badge" title="${escapeHtml(v.resumo || '')}" style="background:${cfg.bg};color:${cfg.color};font-size:12px;padding:2px 8px;border-radius:10px;font-weight:700;">${cfg.label}${score}</span>`;
  },

  // ── MODAL: LISTA DE DOCUMENTOS DO COLABORADOR ─────────────────────────────
  showDocumentos(recursoId) {
    const r = (Store.state.recursos || []).find(x => x.id === recursoId);
    if (!r) return;
    const docs = r.documentos || [];

    const rows = docs.length === 0
      ? `<tr><td colspan="7" class="text-center text-muted" style="padding:var(--sp-xl);">Nenhum documento cadastrado</td></tr>`
      : docs.map(d => {
          const status = this._statusDoc(d);
          const dias = this._diasRestantes(d);
          return `<tr>
            <td><strong style="font-size:15px;">${escapeHtml(d.tipoLabel || d.tipo)}</strong></td>
            <td style="font-size:15px;">${this._fmtDate(d.dataEmissao)}</td>
            <td style="font-size:15px;">${this._fmtDate(d.dataVencimento)}</td>
            <td>${this._badgeStatus(status, dias)}</td>
            <td>${this._badgeValidacao(d)}</td>
            <td style="font-size:15px;color:var(--color-text-muted);">${escapeHtml(d.responsavel || '—')}</td>
            <td>
              <div class="actions-cell">
                ${d.templateId ? `<a class="action-link btn-validar-doc" data-rid="${r.id}" data-did="${d.id}">Ver validação</a>` : ''}
                <a class="action-link btn-edit-doc" data-rid="${r.id}" data-did="${d.id}">Editar</a>
                <a class="action-link danger btn-del-doc" data-rid="${r.id}" data-did="${d.id}">Excluir</a>
              </div>
            </td>
          </tr>`;
        }).join('');

    const html = `
      <div class="modal-overlay" id="modalDocsOverlay">
        <div class="modal" style="width:780px;max-height:90vh;overflow-y:auto;">
          <div class="modal-header">
            <div>
              <h2 class="modal-title">Documentos — ${escapeHtml(r.nome)}</h2>
              <p style="font-size:15px;color:var(--color-text-muted);margin:0;">${r.profissao || ''}</p>
            </div>
            <button class="modal-close">✕</button>
          </div>
          <div class="modal-content">
            <div style="margin-bottom:var(--sp-md);display:flex;justify-content:flex-end;">
              <button class="btn btn-primary" id="btnAddDoc">+ Adicionar Documento</button>
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Emissão</th>
                    <th>Validade</th>
                    <th>Status</th>
                    <th>Validação IA</th>
                    <th>Responsável</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          </div>
        </div>
      </div>`;

    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalDocsOverlay');

    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    document.getElementById('btnAddDoc').addEventListener('click', () => {
      close();
      this.showModalDocumento(recursoId, null);
    });
    overlay.querySelectorAll('.btn-edit-doc').forEach(b =>
      b.addEventListener('click', e => {
        const btn = e.target.closest('[data-rid]');
        close();
        this.showModalDocumento(btn.dataset.rid, btn.dataset.did);
      }));
    overlay.querySelectorAll('.btn-del-doc').forEach(b =>
      b.addEventListener('click', e => {
        const btn = e.target.closest('[data-rid]');
        this._deleteDocumento(btn.dataset.rid, btn.dataset.did, overlay);
      }));
    overlay.querySelectorAll('.btn-validar-doc').forEach(b =>
      b.addEventListener('click', e => {
        const btn = e.target.closest('[data-rid]');
        this.showModalValidacao(btn.dataset.rid, btn.dataset.did);
      }));
  },

  // ── MODAL: RELATÓRIO DE VALIDAÇÃO IA ──────────────────────────────────
  showModalValidacao(recursoId, docId) {
    const r = (Store.state.recursos || []).find(x => x.id === recursoId);
    const d = r?.documentos?.find(x => x.id === docId);
    if (!d) return;
    const tpl = (Store.state.doc_templates || []).find(x => x.id === d.templateId);
    const v = d.validacao;

    const renderRel = (val) => {
      if (!val) return '<p class="text-muted" style="text-align:center;padding:var(--sp-lg);">Documento ainda não foi validado. Clique em "Validar agora".</p>';
      if (val.status === 'nao_validado') {
        return `<div style="padding:var(--sp-md);background:#FEF3C7;border-left:3px solid #F59E0B;border-radius:6px;">
          <strong>⏳ Não validado</strong><br>
          <span style="font-size:13px;">${escapeHtml(val.motivo || val.erro || 'Validação pendente')}</span>
        </div>`;
      }
      const cor = val.status === 'conforme' ? '#10B981' : val.status === 'parcial' ? '#F59E0B' : '#EF4444';
      const item = (label, ok, extra) => `<li style="display:flex;gap:8px;align-items:flex-start;margin-bottom:4px;font-size:13px;">
        <span style="color:${ok ? '#10B981' : '#EF4444'};font-weight:700;flex-shrink:0;">${ok ? '✓' : '✗'}</span>
        <div><strong>${escapeHtml(label)}</strong>${extra ? `<div style="font-size:12px;color:var(--color-text-muted);">${extra}</div>` : ''}</div>
      </li>`;
      return `
        <div style="display:flex;gap:16px;align-items:center;margin-bottom:var(--sp-md);">
          <div style="font-size:42px;font-weight:800;color:${cor};">${val.score || 0}%</div>
          <div style="flex:1;">
            <div style="font-weight:700;font-size:15px;">${escapeHtml(val.resumo || '')}</div>
            <div style="font-size:12px;color:var(--color-text-muted);">Validado em ${val.validadoEm ? new Date(val.validadoEm).toLocaleString('pt-BR') : '—'} · ${val.modelo || ''}</div>
          </div>
        </div>
        ${(val.problemas || []).length ? `
          <div style="padding:10px;background:#FEE2E2;border-left:3px solid #EF4444;border-radius:4px;margin-bottom:var(--sp-md);">
            <strong>Problemas detectados:</strong>
            <ul style="margin:6px 0 0;padding-left:18px;font-size:13px;">${val.problemas.map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul>
          </div>
        ` : ''}
        ${(val.secoes || []).length ? `
          <h4 style="margin:var(--sp-md) 0 6px;font-size:14px;">Seções esperadas</h4>
          <ul style="list-style:none;padding:0;">${val.secoes.map(s => item(`Seção ${s.ordem || ''}: ${s.observacao ? '' : ''}`.trim() + (s.observacao || ''), s.encontrada)).join('')}</ul>
        ` : ''}
        ${(val.campos || []).length ? `
          <h4 style="margin:var(--sp-md) 0 6px;font-size:14px;">Campos extraídos</h4>
          <ul style="list-style:none;padding:0;">${val.campos.map(c => item(c.nome, c.encontrado, c.valor ? `Valor: ${escapeHtml(c.valor)}` : '')).join('')}</ul>
        ` : ''}
        ${(val.elementos_visuais || []).length ? `
          <h4 style="margin:var(--sp-md) 0 6px;font-size:14px;">Elementos visuais</h4>
          <ul style="list-style:none;padding:0;">${val.elementos_visuais.map(e => item(e.descricao, e.encontrado)).join('')}</ul>
        ` : ''}
      `;
    };

    const html = `
      <div class="modal-overlay" id="modalValOverlay">
        <div class="modal" style="width:680px;max-height:90vh;overflow-y:auto;">
          <div class="modal-header">
            <div>
              <h2 class="modal-title">Validação IA — ${escapeHtml(d.tipoLabel || d.tipo)}</h2>
              <div style="font-size:13px;color:var(--color-text-muted);">Template: ${escapeHtml(tpl?.nome || d.templateId)}</div>
            </div>
            <button class="modal-close">✕</button>
          </div>
          <div class="modal-content" id="valBody">${renderRel(v)}</div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnFecharVal">Fechar</button>
            <button class="btn btn-primary" id="btnRevalidar">🔄 Validar agora</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalValOverlay');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnFecharVal').addEventListener('click', close);

    document.getElementById('btnRevalidar').addEventListener('click', async () => {
      const btn = document.getElementById('btnRevalidar');
      btn.disabled = true; btn.textContent = '⏳ Validando...';
      document.getElementById('valBody').innerHTML = '<p style="text-align:center;padding:var(--sp-lg);color:var(--color-text-muted);">⏳ Analisando documento com Claude Vision... (pode levar 5-10s)</p>';
      try {
        const res = await fetch(`/api/recursos/${recursoId}/documentos/${docId}/validar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        document.getElementById('valBody').innerHTML = renderRel(data.validacao);
        await Store.loadAll();
        window.showToast('Validação concluída', 'success');
      } catch (e) {
        document.getElementById('valBody').innerHTML = `<div style="padding:var(--sp-md);background:#FEE2E2;border-radius:6px;">Erro: ${escapeHtml(e.message)}</div>`;
        window.showToast(e.message, 'error');
      } finally {
        btn.disabled = false; btn.textContent = '🔄 Validar agora';
      }
    });
  },

  // ── MODAL: ADICIONAR / EDITAR DOCUMENTO ───────────────────────────────────
  showModalDocumento(recursoId, docId) {
    const r = (Store.state.recursos || []).find(x => x.id === recursoId);
    if (!r) return;
    const doc = docId ? (r.documentos || []).find(d => d.id === docId) : null;

    const tiposOptions = this.TIPOS_DOC.map(t =>
      `<option value="${t.key}" data-meses="${t.meses}" ${doc?.tipo === t.key ? 'selected' : ''}>${t.label} — ${t.full}</option>`
    ).join('');

    // Templates personalizados criados em Configuração → Templates de Docs
    const templates = Store.state.doc_templates || [];
    const templatesPorContrato = templates.filter(t => !r.contractId || !t.empresaId || t.empresaId === r.contractId);
    const templateOptions = templatesPorContrato.map(t => {
      const key = 'tpl:' + t.id;
      const meses = t.periodicidadeMeses || 12;
      return `<option value="${key}" data-meses="${meses}" data-tpl="1" ${doc?.tipo === key ? 'selected' : ''}>${escapeHtml(t.nome)} — ${meses}m</option>`;
    }).join('');

    const html = `
      <div class="modal-overlay" id="modalDocFormOverlay">
        <div class="modal" style="width:580px;">
          <div class="modal-header">
            <div>
              <h2 class="modal-title">${doc ? 'Editar Documento' : 'Adicionar Documento'}</h2>
              <p style="font-size:15px;color:var(--color-text-muted);margin:0;">${escapeHtml(r.nome)}</p>
            </div>
            <button class="modal-close">✕</button>
          </div>
          <form id="formDocumento" class="modal-content">

            <div class="form-group">
              <label class="form-label">Tipo de Documento *</label>
              <select class="form-control" name="tipo" id="selectTipoDoc" required>
                <option value="">— Selecione —</option>
                <optgroup label="Tipos padrão">${tiposOptions}</optgroup>
                ${templateOptions ? `<optgroup label="Templates personalizados">${templateOptions}</optgroup>` : ''}
              </select>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Data de Emissão</label>
                <input class="form-control" name="dataEmissao" type="date" id="inputEmissaoDoc" value="${doc?.dataEmissao || ''}">
              </div>
              <div class="form-group">
                <label class="form-label">Data de Validade</label>
                <input class="form-control" name="dataVencimento" type="date" id="inputVencDoc" value="${doc?.dataVencimento || ''}">
                <span style="font-size:15px;color:var(--color-text-muted);">Calculada automaticamente ao selecionar o tipo e data de emissão</span>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Responsável / Emissor</label>
                <input class="form-control" name="responsavel" placeholder="Ex: Dr. João Silva — CRM 12345" value="${escapeHtml(doc?.responsavel || '')}">
              </div>
              <div class="form-group">
                <label class="form-label">Resultado</label>
                <input class="form-control" name="resultado" placeholder="Ex: Apto, Aprovado..." value="${escapeHtml(doc?.resultado || '')}">
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Observações</label>
              <textarea class="form-control" name="observacoes" rows="2" placeholder="Informações adicionais...">${escapeHtml(doc?.observacoes || '')}</textarea>
            </div>

            <div class="form-group">
              <label class="form-label">📎 Arquivo Anexado</label>
              ${doc?.arquivo ? `
                <div id="arquivoAnexadoInfo" style="padding:10px 12px;background:var(--color-surface-2);border:1px solid var(--color-border);border-radius:6px;display:flex;align-items:center;gap:var(--sp-sm);margin-bottom:var(--sp-sm);">
                  <span style="font-size:20px;">${(doc.arquivo.mimeType || '').includes('pdf') ? '📄' : '🖼️'}</span>
                  <div style="flex:1;min-width:0;">
                    <div style="font-weight:600;font-size:14px;word-break:break-all;">${escapeHtml(doc.arquivo.filename)}</div>
                    <div style="font-size:12px;color:var(--color-text-muted);">${this._formatBytes(doc.arquivo.sizeBytes)}</div>
                  </div>
                  <a href="/api/recursos/${recursoId}/documentos/${doc.id}/arquivo" target="_blank" class="btn btn-sm btn-secondary" style="text-decoration:none;">⬇️ Baixar</a>
                  <button type="button" class="btn btn-sm btn-danger" id="btnRemoverArquivo" data-rid="${recursoId}" data-did="${doc.id}">🗑️ Remover</button>
                </div>
              ` : ''}
              <input
                type="file"
                id="inputArquivoDoc"
                name="arquivo"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                class="form-control"
                style="padding:6px;">
              <span style="font-size:13px;color:var(--color-text-muted);">
                ${doc?.arquivo ? 'Selecione um arquivo para SUBSTITUIR o atual.' : 'PDF, JPG ou PNG (até 10 MB)'}
                Será renomeado: <strong>AAAA_MM_DD_Tipo_Nome.ext</strong>
              </span>
            </div>

            <div style="display:flex;gap:var(--sp-sm);justify-content:flex-end;margin-top:var(--sp-lg);">
              <button type="button" class="btn btn-ghost" id="btnCancelarDoc">Cancelar</button>
              <button type="submit" class="btn btn-primary">${doc ? 'Salvar Alterações' : 'Adicionar Documento'}</button>
            </div>
          </form>
        </div>
      </div>`;

    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalDocFormOverlay');

    const voltar = () => { overlay.remove(); this.showDocumentos(recursoId); };
    overlay.querySelector('.modal-close').addEventListener('click', voltar);
    document.getElementById('btnCancelarDoc').addEventListener('click', voltar);

    const selectTipo = document.getElementById('selectTipoDoc');
    const inputEmissao = document.getElementById('inputEmissaoDoc');
    const inputVenc = document.getElementById('inputVencDoc');

    const calcVenc = () => {
      if (!inputEmissao.value) return;
      const sel = selectTipo.options[selectTipo.selectedIndex];
      const meses = parseInt(sel?.dataset.meses || '12');
      const emissao = new Date(inputEmissao.value + 'T12:00:00');
      emissao.setMonth(emissao.getMonth() + meses);
      inputVenc.value = emissao.toISOString().split('T')[0];
    };

    selectTipo.addEventListener('change', calcVenc);
    inputEmissao.addEventListener('change', calcVenc);

    // Botão remover arquivo anexado
    const btnRemArq = document.getElementById('btnRemoverArquivo');
    if (btnRemArq) {
      btnRemArq.addEventListener('click', async () => {
        if (!confirm('Remover o arquivo anexado deste documento? O documento em si permanece.')) return;
        try {
          const res = await fetch(`/api/recursos/${recursoId}/documentos/${docId}/arquivo`, { method: 'DELETE' });
          if (!res.ok) throw new Error(await res.text());
          showToast('Arquivo removido');
          await Store.loadAll();
          overlay.remove();
          this.showModalDocumento(recursoId, docId);
        } catch (err) {
          showToast('Erro ao remover arquivo', 'error');
          console.error(err);
        }
      });
    }

    document.getElementById('formDocumento').addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const tipoKey = fd.get('tipo');
      let tipoLabel = tipoKey;
      let templateId = null;
      if (tipoKey && tipoKey.startsWith('tpl:')) {
        templateId = tipoKey.slice(4);
        const tpl = (Store.state.doc_templates || []).find(t => t.id === templateId);
        tipoLabel = tpl ? tpl.nome : tipoKey;
      } else {
        const tipoObj = this.TIPOS_DOC.find(t => t.key === tipoKey);
        tipoLabel = tipoObj ? tipoObj.label : tipoKey;
      }

      const payload = {
        tipo: tipoKey,
        tipoLabel,
        ...(templateId ? { templateId } : {}),
        dataEmissao:    fd.get('dataEmissao') || '',
        dataVencimento: fd.get('dataVencimento') || '',
        responsavel:    fd.get('responsavel') || '',
        resultado:      fd.get('resultado') || '',
        observacoes:    fd.get('observacoes') || '',
      };

      const fileInput = document.getElementById('inputArquivoDoc');
      const arquivo = fileInput?.files?.[0] || null;
      if (arquivo && arquivo.size > 10 * 1024 * 1024) {
        showToast('Arquivo excede 10 MB', 'error');
        return;
      }

      try {
        // 1) Salva os metadados do documento (POST cria, PUT edita) — recebe o id
        let savedDocId = docId;
        if (doc) {
          await Store.updateDocumento(recursoId, docId, payload);
        } else {
          const result = await Store.addDocumento(recursoId, payload);
          // Pega o id do doc recém-criado (último doc do recurso)
          const rec = (Store.state.recursos || []).find(x => x.id === recursoId);
          const ultimo = (rec?.documentos || []).slice(-1)[0];
          savedDocId = ultimo?.id || null;
        }

        // 2) Se há arquivo, faz upload multipart
        if (arquivo && savedDocId) {
          const fdUp = new FormData();
          fdUp.append('file', arquivo);
          const upRes = await fetch(`/api/recursos/${recursoId}/documentos/${savedDocId}/arquivo`, {
            method: 'POST', body: fdUp,
          });
          if (!upRes.ok) throw new Error(await upRes.text());
          await Store.loadAll();
        }

        overlay.remove();
        showToast(doc ? 'Documento atualizado!' : 'Documento adicionado!');
        this.showDocumentos(recursoId);
        this._renderLista();
      } catch (err) {
        showToast('Erro ao salvar documento: ' + (err.message || ''), 'error');
        console.error(err);
      }
    });
  },

  _formatBytes(b) {
    if (!b) return '0 B';
    const n = Number(b);
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
  },

  async _deleteDocumento(recursoId, docId, parentOverlay) {
    if (!confirm('Excluir este documento?')) return;
    try {
      await Store.deleteDocumento(recursoId, docId);
      parentOverlay.remove();
      showToast('Documento excluído');
      this.showDocumentos(recursoId);
      this._renderLista();
    } catch (e) {
      showToast('Erro ao excluir', 'error');
      console.error(e);
    }
  },

  // ── FICHA DO COLABORADOR ───────────────────────────────────────────────────
  showFichaColaborador(recursoId) {
    const r = (Store.state.recursos || []).find(x => x.id === recursoId);
    if (!r) return;

    const c = r.alocacaoAtual?.contractId
      ? Store.state.contracts.find(x => x.id === r.alocacaoAtual.contractId)
      : null;

    const linha = (label, valor) => valor
      ? `<div style="display:flex;gap:var(--sp-sm);padding:var(--sp-sm) 0;border-bottom:1px solid var(--color-border);">
           <span style="min-width:140px;font-size:15px;color:var(--color-text-muted);">${label}</span>
           <span style="font-size:15px;font-weight:500;">${valor}</span>
         </div>`
      : '';

    const statusBadge = {
      funcionario:    `<span class="badge" style="background:#D1FAE5;color:#065F46;">Funcionário Ativo</span>`,
      candidato:      `<span class="badge" style="background:#DBEAFE;color:#1E40AF;">Candidato</span>`,
      ex_funcionario: `<span class="badge" style="background:#E5E7EB;color:#374151;">Ex-Funcionário</span>`,
    }[r.status] || '';

    const fmtDate = d => {
      if (!d) return null;
      const [y, m, day] = d.split('-');
      return `${day}/${m}/${y}`;
    };

    const idade = r.dataNascimento ? (() => {
      const nasc = new Date(r.dataNascimento);
      const hoje = new Date();
      let i = hoje.getFullYear() - nasc.getFullYear();
      if (hoje.getMonth() < nasc.getMonth() || (hoje.getMonth() === nasc.getMonth() && hoje.getDate() < nasc.getDate())) i--;
      return `${i} anos`;
    })() : null;

    const html = `
      <div class="modal-overlay" id="modalFichaOverlay">
        <div class="modal" style="width:580px;max-height:90vh;overflow-y:auto;">
          <div class="modal-header">
            <div>
              <h2 class="modal-title">${escapeHtml(r.nome)}</h2>
              <div style="margin-top:4px;">${statusBadge}</div>
            </div>
            <button class="modal-close">✕</button>
          </div>
          <div class="modal-content">

            <h3 style="font-size:15px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:var(--sp-sm);">Dados Pessoais</h3>
            ${linha('CPF', r.cpf)}
            ${linha('Data de Nascimento', fmtDate(r.dataNascimento) + (idade ? ` (${idade})` : ''))}
            ${linha('Gênero', r.genero ? ({ masculino: 'Masculino', feminino: 'Feminino', outro: 'Outro' }[r.genero] || r.genero) : null)}
            ${linha('Telefone', r.telefone)}
            ${linha('Email', r.email)}
            ${linha('Endereço', r.endereco)}

            <h3 style="font-size:15px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.06em;margin:var(--sp-lg) 0 var(--sp-sm);">Dados Profissionais</h3>
            ${linha('Profissão', r.profissao)}
            ${linha('Admissão', fmtDate(r.dataAdmissao))}
            ${linha('Salário', r.salario ? Store.formatBRL(r.salario) : null)}
            ${linha('PIS', r.pis)}
            ${linha('CNH', r.cnh)}
            ${c ? linha('Obra Atual', c.name + (r.alocacaoAtual?.dataInicio ? ` — desde ${fmtDate(r.alocacaoAtual.dataInicio)}` : '')) : ''}
            ${r.alocacaoAtual ? linha('Ciclo de Trabalho', `${r.alocacaoAtual.cicloTrabalho || 21}d trabalho / ${r.alocacaoAtual.cicloFolga || 7}d folga`) : ''}
            ${r.notas ? `<div style="margin-top:var(--sp-md);padding:var(--sp-md);background:var(--color-bg);border-radius:6px;font-size:15px;color:var(--color-text-muted);">${escapeHtml(r.notas)}</div>` : ''}

            <div style="display:flex;gap:var(--sp-sm);justify-content:flex-end;margin-top:var(--sp-lg);">
              <button class="btn btn-ghost" id="btnFichaVerDocs">Ver Documentos</button>
              <button class="btn btn-primary" id="btnFichaEditar">Editar Cadastro</button>
            </div>
          </div>
        </div>
      </div>`;

    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalFichaOverlay');

    overlay.querySelector('.modal-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    document.getElementById('btnFichaVerDocs').addEventListener('click', () => {
      overlay.remove();
      this.showDocumentos(recursoId);
    });

    document.getElementById('btnFichaEditar').addEventListener('click', () => {
      overlay.remove();
      if (window.Recursos) window.Recursos.showModal(recursoId);
    });
  }
};
