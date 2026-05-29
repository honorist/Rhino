// Auditoria — quem fez o quê, quando.
window.Auditoria = {
  _filters: { user: '', entity: '', action: '', from: '', to: '' },
  _page: 0,
  _pageSize: 50,
  _data: { rows: [], total: 0 },
  _viewMode: (() => { try { return localStorage.getItem('rh-audit-view') || 'table'; } catch { return 'table'; } })(),

  // Tradução de "entidade" técnica → nome amigável
  _entityLabel(e) {
    const map = {
      'clientes':              'Cliente',
      'fornecedores':          'Fornecedor',
      'recursos':              'Colaborador',
      'recursos.folgas':       'Folga do colaborador',
      'recursos.documentos':   'Documento do colaborador',
      'recursos.passagem':     'Passagem (folga)',
      'contracts':             'Contrato',
      'contracts.saidas':      'Medição (saída/BM)',
      'contracts.budget':      'Item de orçamento',
      'contracts.organograma': 'Membro da equipe',
      'contracts.rdos':        'RDO',
      'caixa':                 'Lançamento de caixa',
      'contas-pagar':          'Conta a pagar',
      'notas-fiscais':         'Nota fiscal (BM)',
      'investimentos':         'Aporte',
      'base':                  'Item da BASE',
      'tipos-base':            'Tipo de custo',
      'niveis-acesso':         'Nível de acesso',
      'doc-templates':         'Template de documento',
      'socios':                'Sócio',
      'users':                 'Usuário (login)',
      'saidas':                'Medição (saída)',
    };
    return map[e] || e || '—';
  },

  // Resolve entityId para um nome humano lendo do Store.
  // Retorna string descritiva (ex: 'Veracel Celulose') ou '' se não encontrar.
  _entityFriendlyName(entity, entityId) {
    if (!entityId) return '';
    const s = (window.Store && Store.state) || {};
    const find = (arr, key) => Array.isArray(arr) ? (arr.find(x => x?.id === entityId) || {})[key] : '';
    switch (entity) {
      case 'contracts':
      case 'contracts.saidas':
      case 'contracts.budget':
      case 'contracts.organograma':
      case 'contracts.rdos':
        return find(s.contracts, 'name');
      case 'clientes':
        return find(s.clientes, 'nome');
      case 'fornecedores':
        return find(s.fornecedores, 'nome');
      case 'recursos':
      case 'recursos.folgas':
      case 'recursos.documentos':
      case 'recursos.passagem':
        return find(s.recursos, 'nome');
      case 'notas-fiscais': {
        const nf = (s.notas_fiscais || []).find(x => x?.id === entityId);
        return nf ? `nº ${nf.numero || ''}` : '';
      }
      case 'contas-pagar': {
        const cp = (s.contas_pagar || []).find(x => x?.id === entityId);
        return cp ? cp.descricao || '' : '';
      }
      case 'caixa': {
        const ca = (s.caixa || []).find(x => x?.id === entityId);
        return ca ? ca.description || '' : '';
      }
      case 'investimentos': {
        const inv = (s.investimentos || []).find(x => x?.id === entityId);
        return inv ? (inv.description || `${inv.origem || ''} → ${inv.destino || ''}`).trim() : '';
      }
      case 'socios':
        return find(s.socios, 'name');
      case 'base':
        return find(s.base, 'description');
      case 'tipos-base':
        return find(s.tipos_base, 'label');
      case 'niveis-acesso':
        return find(s.niveis_acesso, 'label');
      case 'doc-templates':
        return find(s.doc_templates, 'nome');
      case 'users': {
        const u = (s.users || []).find(x => x?.id === entityId);
        return u ? (u.email || u.name || '') : '';
      }
      default:
        return '';
    }
  },

  // Tradução de ação técnica → verbo amigável
  _actionVerb(a) {
    const map = {
      create:              { verbo: 'Criou',     cor: '#10b981', bg: 'rgba(16,185,129,.15)' },
      update:              { verbo: 'Editou',    cor: '#3b82f6', bg: 'rgba(59,130,246,.15)' },
      delete:              { verbo: 'Excluiu',   cor: '#dc2626', bg: 'rgba(220,38,38,.15)' },
      pagar:               { verbo: 'Pagou',     cor: '#22c55e', bg: 'rgba(34,197,94,.15)' },
      estornar:            { verbo: 'Estornou',  cor: '#f59e0b', bg: 'rgba(245,158,11,.15)' },
      emitir:              { verbo: 'Emitiu',    cor: '#6366f1', bg: 'rgba(99,102,241,.15)' },
      'cancelar-emissao':  { verbo: 'Cancelou emissão', cor: '#f59e0b', bg: 'rgba(245,158,11,.15)' },
      passagem:            { verbo: 'Comprou passagem', cor: '#a855f7', bg: 'rgba(168,85,247,.15)' },
    };
    return map[a] || { verbo: a || '—', cor: 'var(--color-text)', bg: 'var(--color-bg)' };
  },

  _tempoRelativo(ts) {
    if (!ts) return '';
    const diff = Math.round((Date.now() - new Date(ts).getTime()) / 1000);
    if (diff < 60) return 'agora há pouco';
    if (diff < 3600) return `há ${Math.floor(diff/60)} min`;
    if (diff < 86400) return `há ${Math.floor(diff/3600)} h`;
    if (diff < 604800) return `há ${Math.floor(diff/86400)} dias`;
    return new Date(ts).toLocaleDateString('pt-BR');
  },

  _statusLabel(s) {
    if (s === 200) return { texto: 'Sucesso',         cor: '#10b981' };
    if (s === 400) return { texto: 'Erro de validação', cor: '#dc2626' };
    if (s === 401) return { texto: 'Sem permissão',    cor: '#dc2626' };
    if (s === 404) return { texto: 'Não encontrado',   cor: '#f59e0b' };
    if (s === 429) return { texto: 'Limite atingido',  cor: '#f59e0b' };
    if (s >= 400)  return { texto: 'Erro',             cor: '#dc2626' };
    if (s >= 300)  return { texto: 'Aviso',            cor: '#f59e0b' };
    return { texto: 'OK', cor: '#10b981' };
  },

  async render() {
    const root = document.getElementById('app');
    root.innerHTML = '<div class="loading-spinner">Carregando...</div>';
    // Carrega entidades em paralelo para resolver nomes amigáveis
    try { if (window.Store && Store.loadAll) await Store.loadAll(); }
    catch (e) { console.warn('[Auditoria] Store.loadAll falhou — nomes amigáveis podem ficar como IDs:', e?.message || e); }
    await this._fetch();
    this._draw();
  },

  async _fetch() {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(this._filters)) {
      if (v) params.set(k, v);
    }
    params.set('limit', this._pageSize);
    params.set('offset', this._page * this._pageSize);
    try {
      const r = await fetch('/api/audit?' + params.toString());
      this._data = await r.json();
    } catch (e) {
      this._data = { rows: [], total: 0 };
    }
  },

  _draw() {
    const root = document.getElementById('app');
    const { rows, total } = this._data;
    const totalPages = Math.max(1, Math.ceil(total / this._pageSize));
    const fmtDT = (s) => s ? new Date(s).toLocaleString('pt-BR') : '—';

    // Lista de entidades + ações pra dropdowns (em português)
    const entidadesOpts = [
      'clientes','fornecedores','recursos','contracts','contracts.saidas','contracts.budget',
      'contracts.organograma','contracts.rdos','caixa','contas-pagar','notas-fiscais',
      'investimentos','base','tipos-base','niveis-acesso','doc-templates','users',
      'recursos.folgas','recursos.documentos','recursos.passagem','socios',
    ];
    const acoesOpts = ['create','update','delete','pagar','estornar','emitir','cancelar-emissao','passagem'];

    root.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Histórico de Atividades</h1>
          <p class="page-subtitle">Tudo que aconteceu no sistema — quem fez, o quê e quando</p>
        </div>
        <div style="display:flex;gap:14px;align-items:center;font-size:14px;color:var(--color-text-muted);">
          <div role="group" aria-label="Modo de visualização" style="display:inline-flex;border:1px solid var(--color-border);border-radius:999px;overflow:hidden;">
            <button class="btn btn-sm" id="audViewTable"    style="border-radius:0;${this._viewMode==='table'?    'background:var(--color-primary);color:#fff;':'background:transparent;'}">Tabela</button>
            <button class="btn btn-sm" id="audViewTimeline" style="border-radius:0;${this._viewMode==='timeline'? 'background:var(--color-primary);color:#fff;':'background:transparent;'}">Linha do tempo</button>
          </div>
          <span>${total} ${total === 1 ? 'atividade' : 'atividades'}</span>
        </div>
      </div>

      <!-- Filtros -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr auto;gap:var(--sp-md);margin-bottom:var(--sp-md);align-items:end;">
        <div class="form-group" style="margin:0;">
          <label class="form-label">Pesquisar por usuário</label>
          <input class="form-control" id="fAuditUser" placeholder="digite um email" value="${escapeHtml(this._filters.user)}">
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">Em qual tela</label>
          <select class="form-control" id="fAuditEntity">
            <option value="">Todas as telas</option>
            ${entidadesOpts.map(e => `<option value="${e}" ${this._filters.entity === e ? 'selected' : ''}>${this._entityLabel(e)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">Tipo de ação</label>
          <select class="form-control" id="fAuditAction">
            <option value="">Qualquer ação</option>
            ${acoesOpts.map(a => `<option value="${a}" ${this._filters.action === a ? 'selected' : ''}>${this._actionVerb(a).verbo}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">A partir de</label>
          <input class="form-control" type="date" id="fAuditFrom" value="${escapeHtml(this._filters.from)}">
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">Até</label>
          <input class="form-control" type="date" id="fAuditTo" value="${escapeHtml(this._filters.to)}">
        </div>
        <button class="btn btn-secondary" id="fAuditClear">Limpar</button>
      </div>

      <!-- Tabela / Timeline -->
      ${this._viewMode === 'timeline' ? `
        <div class="audit-timeline">
          ${rows.length === 0 ? `<div class="empty-state"><div class="empty-state__title">Sem atividades</div><div class="empty-state__msg">Ajuste os filtros para ver eventos.</div></div>` : rows.map(r => {
            const verbInfo = this._actionVerb(r.action);
            const entLabel = this._entityLabel(r.entity);
            const friendly = r.entityLabel || this._entityFriendlyName(r.entity, r.entityId) || '';
            const cls = ({ create: 'audit-event--insert', update: 'audit-event--update', delete: 'audit-event--delete' })[r.action] || '';
            return `
              <div class="audit-event ${cls}" data-id="${r.id}" style="cursor:pointer;">
                <div class="audit-event__dot" aria-hidden="true"></div>
                <div class="audit-event__head">
                  <span class="audit-event__user">${escapeHtml((r.userEmail || '').split('@')[0] || '—')}</span>
                  <span class="audit-event__action">${verbInfo.verbo} ${escapeHtml(entLabel.toLowerCase())}${friendly ? ' <strong>'+escapeHtml(friendly)+'</strong>' : ''}</span>
                  <span class="audit-event__time">${this._tempoRelativo(r.ts)} · ${fmtDT(r.ts)}</span>
                </div>
                ${(() => {
                  if (r.action !== 'update' || !r.beforeState || !r.body) return '';
                  const diffs = this._computeDiff(r.beforeState, r.body).slice(0, 4);
                  if (!diffs.length) return '';
                  return '<div class="audit-event__detail">' + diffs.map(d =>
                    `${escapeHtml(this._fieldLabel(d.key))}: ${escapeHtml(this._fmtVal(d.before))} → ${escapeHtml(this._fmtVal(d.after))}`
                  ).join('<br>') + '</div>';
                })()}
              </div>`;
          }).join('')}
        </div>
      ` : `
      <table class="data-table">
        <thead>
          <tr>
            <th scope="col" style="width:160px;">Quando</th>
            <th scope="col">Quem</th>
            <th scope="col">Fez o quê</th>
            <th scope="col" style="width:120px;text-align:center;">Resultado</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length === 0 ? `<tr><td colspan="4" style="text-align:center;color:var(--color-text-muted);padding:var(--sp-xl);">Nenhuma atividade no filtro selecionado</td></tr>` : ''}
          ${rows.map(r => {
            const verbInfo = this._actionVerb(r.action);
            const entLabel = this._entityLabel(r.entity);
            const statusInfo = this._statusLabel(r.status);
            return `
              <tr class="row-audit" data-id="${r.id}" style="cursor:pointer;">
                <td>
                  <div style="font-weight:500;">${fmtDT(r.ts)}</div>
                  <div style="font-size:12px;color:var(--color-text-muted);">${this._tempoRelativo(r.ts)}</div>
                </td>
                <td>
                  <strong>${escapeHtml((r.userEmail || '').split('@')[0] || '—')}</strong>
                  <div style="font-size:12px;color:var(--color-text-muted);">${escapeHtml(r.userEmail || r.userId || '—')}</div>
                </td>
                <td>
                  <span style="background:${verbInfo.bg};color:${verbInfo.cor};padding:2px 10px;border-radius:99px;font-weight:600;font-size:13px;margin-right:6px;">${verbInfo.verbo}</span>
                  <strong>${escapeHtml(entLabel.toLowerCase())}</strong>
                  ${(() => {
                    // Prioridade: label gravado no audit (mais confiável p/ deletados) > Store atual > "(removido)"
                    const labelGravado = r.entityLabel;
                    const friendly = labelGravado || this._entityFriendlyName(r.entity, r.entityId);
                    if (friendly) return ` <strong>${escapeHtml(friendly)}</strong>`;
                    if (r.entityId) return ` <span style="font-size:12px;color:var(--color-text-muted);font-style:italic;">(removido)</span>`;
                    return '';
                  })()}
                  ${(() => {
                    // Para UPDATE: mostra resumo do que mudou (até 2 campos)
                    if (r.action !== 'update' || !r.beforeState || !r.body) return '';
                    const diffs = this._computeDiff(r.beforeState, r.body);
                    if (diffs.length === 0) return '';
                    const preview = diffs.slice(0, 2).map(d =>
                      `<span style="font-size:12px;color:var(--color-text-muted);">${escapeHtml(this._fieldLabel(d.key))}: <strong>${escapeHtml(this._fmtVal(d.before))}</strong> → <strong style="color:var(--color-primary);">${escapeHtml(this._fmtVal(d.after))}</strong></span>`
                    ).join(' · ');
                    const extra = diffs.length > 2 ? ` <span style="font-size:11px;color:var(--color-text-muted);">+${diffs.length - 2} mudanças</span>` : '';
                    return `<div style="margin-top:4px;">${preview}${extra}</div>`;
                  })()}
                </td>
                <td style="text-align:center;">
                  <span style="color:${statusInfo.cor};font-weight:600;font-size:13px;">${statusInfo.texto}</span>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
      `}

      ${totalPages > 1 ? `
        <div style="display:flex;justify-content:center;gap:var(--sp-sm);margin-top:var(--sp-md);">
          <button class="btn btn-secondary" id="auditPrev" ${this._page === 0 ? 'disabled' : ''}>← Anterior</button>
          <span style="display:flex;align-items:center;color:var(--color-text-muted);">Página ${this._page + 1} de ${totalPages}</span>
          <button class="btn btn-secondary" id="auditNext" ${this._page >= totalPages - 1 ? 'disabled' : ''}>Próxima →</button>
        </div>
      ` : ''}
    `;

    // Filtros
    const apply = () => {
      this._filters.user = document.getElementById('fAuditUser').value.trim();
      this._filters.entity = document.getElementById('fAuditEntity').value;
      this._filters.action = document.getElementById('fAuditAction').value;
      this._filters.from = document.getElementById('fAuditFrom').value;
      this._filters.to = document.getElementById('fAuditTo').value;
      this._page = 0;
      this.render();
    };
    document.getElementById('fAuditUser').addEventListener('change', apply);
    document.getElementById('fAuditEntity').addEventListener('change', apply);
    document.getElementById('fAuditAction').addEventListener('change', apply);
    document.getElementById('fAuditFrom').addEventListener('change', apply);
    document.getElementById('fAuditTo').addEventListener('change', apply);
    document.getElementById('fAuditClear').addEventListener('click', () => {
      this._filters = { user: '', entity: '', action: '', from: '', to: '' };
      this._page = 0;
      this.render();
    });

    // Click linha → mostra detalhe
    document.querySelectorAll('.row-audit, .audit-event').forEach(tr => {
      tr.addEventListener('click', () => {
        const ev = rows.find(x => String(x.id) === tr.dataset.id);
        if (ev) this._showDetail(ev);
      });
    });

    // Toggle de modo de visualização (G2)
    const setMode = (m) => {
      this._viewMode = m;
      try { localStorage.setItem('rh-audit-view', m); } catch {}
      this._draw();
    };
    const btT = document.getElementById('audViewTable');
    const btL = document.getElementById('audViewTimeline');
    if (btT) btT.addEventListener('click', () => setMode('table'));
    if (btL) btL.addEventListener('click', () => setMode('timeline'));

    // Paginação
    const prev = document.getElementById('auditPrev');
    const next = document.getElementById('auditNext');
    if (prev) prev.addEventListener('click', () => { this._page--; this.render(); });
    if (next) next.addEventListener('click', () => { this._page++; this.render(); });
  },

  // Calcula diff between before e after (after = body do PUT). Retorna [{key, before, after}].
  // Ignora campos de timestamp e ids internos.
  _computeDiff(before, after) {
    if (!before || !after) return [];
    const skip = new Set(['id', 'createdAt', 'updatedAt', 'created_at', 'updated_at', 'metadata']);
    const diffs = [];
    const keys = Object.keys(after);
    for (const k of keys) {
      if (skip.has(k)) continue;
      const a = after[k];
      const b = before[k];
      // Compara JSON pra cobrir objetos/arrays
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        diffs.push({ key: k, before: b, after: a });
      }
    }
    return diffs;
  },

  // Tradução de nomes técnicos de campo → português amigável
  _fieldLabel(k) {
    const map = {
      nome: 'Nome', name: 'Nome', email: 'Email', telefone: 'Telefone', phone: 'Telefone',
      cpf: 'CPF', cnpj: 'CNPJ', endereco: 'Endereço', address: 'Endereço',
      value: 'Valor', valor: 'Valor', valorPago: 'Valor pago', preco: 'Preço',
      status: 'Status', tipo: 'Tipo', type: 'Tipo', categoria: 'Categoria', category: 'Categoria',
      descricao: 'Descrição', description: 'Descrição', notes: 'Observações', observacoes: 'Observações',
      startDate: 'Início', endDate: 'Término', tendencyDate: 'Tendência',
      dataVencimento: 'Vencimento', dataEmissao: 'Emissão', dataPagamento: 'Pagamento',
      data_vencimento: 'Vencimento', data_emissao: 'Emissão', data_pagamento: 'Pagamento',
      contractNumber: 'Nº contrato', client: 'Cliente', clientId: 'Cliente',
      profissao: 'Profissão', salario: 'Salário', dataAdmissao: 'Admissão',
      contractId: 'Contrato', recursoId: 'Recurso', fornecedorId: 'Fornecedor',
      cargo: 'Cargo', nivel: 'Nível', area: 'Área',
      responsavel: 'Responsável', resultado: 'Resultado', emitida: 'Emitida',
      formaPagamento: 'Forma pagamento', forma_pagamento: 'Forma pagamento',
    };
    return map[k] || k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()).trim();
  },

  // Formata um valor pra exibir no diff (date, número, booleano, etc)
  _fmtVal(v) {
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
    if (typeof v === 'number') {
      // Detecta valor monetário (>100 e com casas decimais ou inteiro grande)
      if (Number.isFinite(v) && Math.abs(v) >= 1) {
        return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
      }
      return String(v);
    }
    if (typeof v === 'string') {
      // Data ISO?
      if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
        try {
          const d = new Date(v);
          if (!isNaN(d.getTime())) return d.toLocaleDateString('pt-BR');
        } catch {}
      }
      // String muito longa?
      if (v.length > 80) return v.slice(0, 77) + '...';
      return v;
    }
    if (Array.isArray(v)) return `[${v.length} item${v.length !== 1 ? 'ns' : ''}]`;
    if (typeof v === 'object') return '{...}';
    return String(v);
  },

  _showDetail(ev) {
    const fmtDT = (s) => s ? new Date(s).toLocaleString('pt-BR') : '—';
    const verbInfo = this._actionVerb(ev.action);
    const entLabel = this._entityLabel(ev.entity);
    const statusInfo = this._statusLabel(ev.status);
    const bodyJson = ev.body ? JSON.stringify(ev.body, null, 2) : '(sem dados enviados)';

    const userName = (ev.userEmail || '').split('@')[0] || ev.userId || 'Desconhecido';
    const nomeAlvo = ev.entityLabel || this._entityFriendlyName(ev.entity, ev.entityId) || '';
    const frase = nomeAlvo
      ? `${userName} ${verbInfo.verbo.toLowerCase()} ${entLabel.toLowerCase()} "${nomeAlvo}"`
      : `${userName} ${verbInfo.verbo.toLowerCase()} ${entLabel.toLowerCase()}`;

    // Diff (só pra UPDATE) ou snapshot do que foi excluído (DELETE)
    let secaoMudancas = '';
    if (ev.action === 'update' && ev.beforeState && ev.body) {
      const diffs = this._computeDiff(ev.beforeState, ev.body);
      if (diffs.length > 0) {
        secaoMudancas = `
          <div style="margin-bottom:var(--sp-md);">
            <h4 style="font-size:14px;font-weight:600;margin:0 0 var(--sp-sm) 0;">📝 O que mudou (${diffs.length} ${diffs.length === 1 ? 'campo' : 'campos'})</h4>
            <table class="data-table" style="margin:0;">
              <thead><tr><th scope="col">Campo</th><th scope="col">Antes</th><th scope="col">Depois</th></tr></thead>
              <tbody>
                ${diffs.map(d => `
                  <tr>
                    <td><strong>${escapeHtml(this._fieldLabel(d.key))}</strong></td>
                    <td style="color:var(--color-text-muted);text-decoration:line-through;">${escapeHtml(this._fmtVal(d.before))}</td>
                    <td style="color:var(--color-primary);font-weight:600;">${escapeHtml(this._fmtVal(d.after))}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      } else {
        secaoMudancas = `<div style="padding:var(--sp-md);background:var(--color-surface-2);border-radius:6px;color:var(--color-text-muted);font-size:13px;">Nenhum campo mudou (provavelmente um save sem alterações).</div>`;
      }
    } else if (ev.action === 'delete' && ev.beforeState) {
      const camposVisiveis = Object.entries(ev.beforeState)
        .filter(([k, v]) => !['id', 'createdAt', 'updatedAt', 'created_at', 'updated_at', 'metadata', 'documentos', 'folgas', 'budget'].includes(k))
        .filter(([k, v]) => v !== null && v !== undefined && v !== '');
      if (camposVisiveis.length > 0) {
        secaoMudancas = `
          <div style="margin-bottom:var(--sp-md);">
            <h4 style="font-size:14px;font-weight:600;margin:0 0 var(--sp-sm) 0;">🗑️ Dados que foram excluídos</h4>
            <div style="display:grid;grid-template-columns:140px 1fr;gap:8px;font-size:13px;padding:var(--sp-md);background:var(--color-surface-2);border-radius:6px;border-left:3px solid var(--color-danger);">
              ${camposVisiveis.map(([k, v]) => `
                <div style="color:var(--color-text-muted);">${escapeHtml(this._fieldLabel(k))}</div>
                <div style="font-weight:500;">${escapeHtml(this._fmtVal(v))}</div>
              `).join('')}
            </div>
          </div>
        `;
      }
    } else if (ev.action === 'create' && ev.body) {
      const camposVisiveis = Object.entries(ev.body)
        .filter(([k, v]) => !['id', 'createdAt', 'updatedAt'].includes(k))
        .filter(([k, v]) => v !== null && v !== undefined && v !== '');
      if (camposVisiveis.length > 0) {
        secaoMudancas = `
          <div style="margin-bottom:var(--sp-md);">
            <h4 style="font-size:14px;font-weight:600;margin:0 0 var(--sp-sm) 0;">✨ Dados informados na criação</h4>
            <div style="display:grid;grid-template-columns:140px 1fr;gap:8px;font-size:13px;padding:var(--sp-md);background:var(--color-surface-2);border-radius:6px;border-left:3px solid var(--color-success);">
              ${camposVisiveis.map(([k, v]) => `
                <div style="color:var(--color-text-muted);">${escapeHtml(this._fieldLabel(k))}</div>
                <div style="font-weight:500;">${escapeHtml(this._fmtVal(v))}</div>
              `).join('')}
            </div>
          </div>
        `;
      }
    }

    const html = `
      <div class="modal-overlay" id="modalAudit">
        <div class="modal" style="width:680px;max-width:95vw;max-height:90vh;overflow-y:auto;">
          <div class="modal-header">
            <div>
              <h2 class="modal-title" style="margin:0;">${escapeHtml(frase)}</h2>
              <div style="font-size:13px;color:var(--color-text-muted);margin-top:4px;">${fmtDT(ev.ts)} (${this._tempoRelativo(ev.ts)})</div>
            </div>
            <button class="modal-close">✕</button>
          </div>
          <div class="modal-content">
            <!-- Resumo amigável -->
            <div style="padding:var(--sp-md);background:var(--color-surface-2);border-radius:8px;margin-bottom:var(--sp-md);">
              <div style="display:grid;grid-template-columns:120px 1fr;gap:10px;font-size:14px;line-height:1.7;">
                <div style="color:var(--color-text-muted);">Quem fez</div>
                <div><strong>${escapeHtml(ev.userEmail || '—')}</strong></div>

                <div style="color:var(--color-text-muted);">O que fez</div>
                <div>
                  <span style="background:${verbInfo.bg};color:${verbInfo.cor};padding:2px 10px;border-radius:99px;font-weight:700;font-size:13px;">${verbInfo.verbo}</span>
                  <strong style="margin-left:6px;">${escapeHtml(entLabel)}</strong>
                </div>

                ${ev.entityId ? `
                  <div style="color:var(--color-text-muted);">Identificador</div>
                  <div style="font-family:monospace;font-size:12px;">${escapeHtml(ev.entityId)}</div>
                ` : ''}

                <div style="color:var(--color-text-muted);">Resultado</div>
                <div style="color:${statusInfo.cor};font-weight:600;">${statusInfo.texto}</div>

                <div style="color:var(--color-text-muted);">De qual rede</div>
                <div style="font-family:monospace;font-size:12px;">${escapeHtml(ev.ip || '—')}</div>
              </div>
            </div>

            <!-- Mudanças amigáveis (diff / snapshot / dados criados) -->
            ${secaoMudancas}

            <!-- Dados técnicos (recolhido por padrão) -->
            ${ev.body && Object.keys(ev.body || {}).length > 0 ? `
              <details style="margin-top:var(--sp-md);">
                <summary style="cursor:pointer;font-size:13px;font-weight:600;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em;">
                  Detalhes técnicos (JSON)
                </summary>
                <pre style="background:var(--color-bg);border:1px solid var(--color-border);border-radius:6px;padding:var(--sp-md);font-size:12px;font-family:monospace;overflow:auto;max-height:300px;white-space:pre-wrap;margin-top:8px;">${escapeHtml(bodyJson)}</pre>
              </details>
            ` : ''}
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnAuditClose">Fechar</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalAudit');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnAuditClose').addEventListener('click', close);
  },
};
