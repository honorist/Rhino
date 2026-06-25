// Auditoria — quem fez o quê, quando. Lista compacta, uma ação por linha.
// `escapeHtml` é global (window.escapeHtml, de store.js).
window.Auditoria = {
  _filters: { user: '', entity: '', action: '', from: '', to: '', errors: false },
  _page: 0,
  _pageSize: 50,
  _data: { rows: [], total: 0 },
  _showAdvanced: false,

  // ─────────────── Dicionários (entidade, artigo, verbo) ───────────────

  _entityInfo(e) {
    const map = {
      'clientes':                ['Cliente', 'o'],
      'fornecedores':            ['Fornecedor', 'o'],
      'recursos':                ['Colaborador', 'o'],
      'recursos.folgas':         ['Folga', 'a'],
      'recursos.documentos':     ['Documento', 'o'],
      'contracts':               ['Contrato', 'o'],
      'contracts.saidas':        ['Medição', 'a'],
      'contracts.budget':        ['Item de orçamento', 'o'],
      'contracts.organograma':   ['Membro da equipe', 'o'],
      'contracts.rdos':          ['RDO', 'o'],
      'contracts.aditivos':      ['Aditivo', 'o'],
      'contracts.marcos':        ['Marco', 'o'],
      'contracts.ocorrencias':   ['Ocorrência', 'a'],
      'caixa':                   ['Lançamento de caixa', 'o'],
      'contas-pagar':            ['Conta a pagar', 'a'],
      'notas-fiscais':           ['Nota fiscal', 'a'],
      'investimentos':           ['Aporte', 'o'],
      'base':                    ['Item da BASE', 'o'],
      'tipos-base':              ['Tipo de custo', 'o'],
      'niveis-acesso':           ['Nível de acesso', 'o'],
      'doc-templates':           ['Template de documento', 'o'],
      'socios':                  ['Sócio', 'o'],
      'users':                   ['Usuário (login)', 'o'],
      'saidas':                  ['Medição', 'a'],
      'propostas':               ['Proposta', 'a'],
      'propostas.custos':        ['Custo da proposta', 'o'],
      'propostas.anexos':        ['Anexo', 'o'],
      'manutencoes':             ['Manutenção', 'a'],
      'veiculos':                ['Veículo', 'o'],
      'veiculos.planos':         ['Plano de manutenção', 'o'],
      'veiculos.manutencoes':    ['Manutenção do veículo', 'a'],
      'veiculos.abastecimentos': ['Abastecimento', 'o'],
      'solicitacoes-compra':     ['Solicitação de compra', 'a'],
      'clausulas':               ['Cláusula', 'a'],
      'candidatos':              ['Candidato', 'o'],
      'vagas':                   ['Vaga', 'a'],
      'folha-pagamento':         ['Folha de pagamento', 'a'],
      'folha-pagamento.itens':   ['Item da folha', 'o'],
    };
    const v = map[e];
    return v ? { label: v[0], artigo: v[1] } : { label: e || '—', artigo: 'o' };
  },

  _entityLabel(e) { return this._entityInfo(e).label; },

  _entityFriendlyName(entity, entityId) {
    if (!entityId) return '';
    const s = (window.Store && Store.state) || {};
    const find = (arr, key) => Array.isArray(arr) ? ((arr.find(x => x?.id === entityId) || {})[key] || '') : '';
    switch (entity) {
      case 'contracts':
      case 'contracts.saidas':
      case 'contracts.budget':
      case 'contracts.organograma':
      case 'contracts.rdos':
      case 'contracts.aditivos':
      case 'contracts.marcos':
      case 'contracts.ocorrencias':
        return find(s.contracts, 'name');
      case 'clientes':       return find(s.clientes, 'nome');
      case 'fornecedores':   return find(s.fornecedores, 'nome');
      case 'recursos':
      case 'recursos.folgas':
      case 'recursos.documentos':
        return find(s.recursos, 'nome');
      case 'notas-fiscais': {
        const nf = (s.notas_fiscais || []).find(x => x?.id === entityId);
        return nf && nf.numero ? `nº ${nf.numero}` : '';
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
      case 'socios':        return find(s.socios, 'name');
      case 'base':          return find(s.base, 'description');
      case 'tipos-base':    return find(s.tipos_base, 'label');
      case 'niveis-acesso': return find(s.niveis_acesso, 'label');
      case 'doc-templates': return find(s.doc_templates, 'nome');
      case 'propostas':     return find(s.propostas, 'titulo') || find(s.propostas, 'nome');
      case 'clausulas':     return find(s.clausulas, 'titulo') || find(s.clausulas, 'nome');
      case 'veiculos':      return find(s.veiculos, 'placa') || find(s.veiculos, 'nome');
      case 'users': {
        const u = (s.users || []).find(x => x?.id === entityId);
        return u ? (u.email || u.name || '') : '';
      }
      default: return '';
    }
  },

  _actionVerb(a) {
    const C = {
      green:  ['#10b981', 'rgba(16,185,129,.15)'],
      blue:   ['#3b82f6', 'rgba(59,130,246,.15)'],
      red:    ['#dc2626', 'rgba(220,38,38,.15)'],
      amber:  ['#f59e0b', 'rgba(245,158,11,.15)'],
      indigo: ['#6366f1', 'rgba(99,102,241,.15)'],
      purple: ['#a855f7', 'rgba(168,85,247,.15)'],
      teal:   ['#0d9488', 'rgba(13,148,136,.15)'],
      gray:   ['#64748b', 'rgba(100,116,139,.15)'],
    };
    const mk = (verbo, c) => ({ verbo, cor: C[c][0], bg: C[c][1] });
    const map = {
      create:               mk('criou', 'green'),
      update:               mk('editou', 'blue'),
      delete:               mk('excluiu', 'red'),
      pagar:                mk('pagou', 'green'),
      estornar:             mk('estornou', 'amber'),
      emitir:               mk('emitiu', 'indigo'),
      'cancelar-emissao':   mk('cancelou emissão', 'amber'),
      passagem:             mk('comprou passagem', 'purple'),
      aprovar:              mk('aprovou', 'green'),
      rejeitar:             mk('rejeitou', 'red'),
      avaliar:              mk('avaliou', 'indigo'),
      comprar:              mk('comprou', 'green'),
      receber:              mk('recebeu', 'teal'),
      cancelar:             mk('cancelou', 'amber'),
      enviar:               mk('enviou', 'blue'),
      aceitar:              mk('aceitou', 'green'),
      duplicar:             mk('duplicou', 'gray'),
      retorno:              mk('registrou retorno', 'teal'),
      allocate:             mk('alocou', 'blue'),
      gerar:                mk('gerou', 'green'),
      limpar:               mk('limpou', 'red'),
      'processar-recorrencias': mk('processou recorrências', 'blue'),
      triagem:              mk('fez triagem', 'indigo'),
      antecedentes:         mk('verificou antecedentes', 'indigo'),
    };
    return map[a] || { verbo: a || '—', cor: 'var(--color-text)', bg: 'var(--color-bg)' };
  },

  // ─────────────── Helpers de apresentação ───────────────

  _userName(email) {
    const h = (email || '').split('@')[0] || '';
    if (!h) return '—';
    return h.split(/[._\-]+/).filter(Boolean)
      .map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ') || h;
  },

  _tempoRelativo(ts) {
    if (!ts) return '';
    const diff = Math.round((Date.now() - new Date(ts).getTime()) / 1000);
    if (diff < 60) return 'agora há pouco';
    if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
    if (diff < 604800) return `há ${Math.floor(diff / 86400)} dias`;
    return new Date(ts).toLocaleDateString('pt-BR');
  },

  _statusLabel(s) {
    if (s === 200 || s === 201) return { texto: 'Sucesso', cor: '#10b981' };
    if (s === 400) return { texto: 'Erro de validação', cor: '#dc2626' };
    if (s === 401) return { texto: 'Sem permissão', cor: '#dc2626' };
    if (s === 403) return { texto: 'Acesso negado', cor: '#dc2626' };
    if (s === 404) return { texto: 'Não encontrado', cor: '#f59e0b' };
    if (s === 409) return { texto: 'Conflito', cor: '#f59e0b' };
    if (s === 429) return { texto: 'Limite atingido', cor: '#f59e0b' };
    if (s >= 400) return { texto: 'Erro', cor: '#dc2626' };
    if (s >= 300) return { texto: 'Aviso', cor: '#f59e0b' };
    return { texto: 'OK', cor: '#10b981' };
  },

  _dayLabel(day) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((today.getTime() - day.getTime()) / 86400000);
    if (diff === 0) return 'Hoje';
    if (diff === 1) return 'Ontem';
    if (diff > 1 && diff < 7) {
      const w = day.toLocaleDateString('pt-BR', { weekday: 'long' });
      return w.charAt(0).toUpperCase() + w.slice(1);
    }
    return day.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  },

  _groupByDay(rows) {
    const groups = [];
    let cur = null;
    for (const r of rows) {
      const d = new Date(r.ts); d.setHours(0, 0, 0, 0);
      const key = d.getTime();
      if (!cur || cur.key !== key) { cur = { key, label: this._dayLabel(d), rows: [] }; groups.push(cur); }
      cur.rows.push(r);
    }
    return groups;
  },

  _eventTarget(r) {
    const info = this._entityInfo(r.entity);
    const nome = r.entityLabel || this._entityFriendlyName(r.entity, r.entityId) || '';
    const nameHtml = nome
      ? ` <strong class="audit-name">"${escapeHtml(nome)}"</strong>`
      : (r.entityId && r.action !== 'create' ? ' <span class="audit-removed">(removido)</span>' : '');

    if (r.action === 'passagem') return nome ? `para <strong>"${escapeHtml(nome)}"</strong>` : '';
    if (r.action === 'gerar' && r.entity === 'folha-pagamento') return 'a <strong>folha de pagamento</strong> do mês';
    if (r.action === 'limpar' && r.entity === 'folha-pagamento') return 'a <strong>folha de pagamento</strong>';
    if (r.action === 'processar-recorrencias') return '';

    return `${info.artigo} ${escapeHtml(info.label.toLowerCase())}${nameHtml}`;
  },

  _eventSentence(r) {
    const verbInfo = this._actionVerb(r.action);
    return `${verbInfo.verbo} ${this._eventTarget(r)}`.trim();
  },

  // ─────────────── Diff tipado ───────────────

  _fieldMeta(key) {
    const M = {
      execPct: ['Execução', 'percent'], pesoPct: ['Peso', 'percent'], aderencia: ['Aderência', 'percent'],
      retencaoPercent: ['Retenção', 'percent'], participacao: ['Participação', 'percent'], percentual: ['Percentual', 'percent'],
      value: ['Valor', 'money'], valor: ['Valor', 'money'], valorTotal: ['Valor total', 'money'],
      valorPago: ['Valor pago', 'money'], valorDelta: ['Δ Valor', 'money'], salario: ['Salário', 'money'],
      custo: ['Custo', 'money'], custoEstimado: ['Custo estimado', 'money'], custoPlan: ['Custo planejado', 'money'],
      preco: ['Preço', 'money'], saldo: ['Saldo', 'money'],
      startDate: ['Início', 'date'], endDate: ['Término', 'date'], tendencyDate: ['Tendência', 'date'],
      date: ['Data', 'date'], dataFimPlan: ['Data fim', 'date'], dataInicioPlan: ['Data início', 'date'],
      dataVencimento: ['Vencimento', 'date'], dataEmissao: ['Emissão', 'date'], dataPagamento: ['Pagamento', 'date'],
      dataAdmissao: ['Admissão', 'date'], dataNascimento: ['Nascimento', 'date'], dataRetorno: ['Retorno', 'date'],
      data_vencimento: ['Vencimento', 'date'], data_emissao: ['Emissão', 'date'], data_pagamento: ['Pagamento', 'date'],
    };
    if (M[key]) return { label: M[key][0], type: M[key][1] };
    const k = key.toLowerCase();
    let type = 'text';
    if (/pct$|percent|participacao|aderencia/.test(k)) type = 'percent';
    else if (/^data|date$|_date|venc|emiss|pagam|admiss|nasc|retorno/.test(k)) type = 'date';
    else if (/valor|value|salario|custo|preco|saldo|montante|total/.test(k)) type = 'money';
    return { label: this._fieldLabel(key), type };
  },

  _fmtDatePura(v) {
    if (v == null || v === '') return '—';
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    const d = new Date(v);
    return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('pt-BR');
  },

  _fmtTyped(v, type) {
    if (v === '***' || v === '[REDACTED]') return '***';
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
    if (type === 'percent') {
      const n = Number(v);
      return Number.isFinite(n) ? `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(n)}%` : String(v);
    }
    if (type === 'date') return this._fmtDatePura(v);
    if (type === 'money') {
      const n = Number(v);
      return Number.isFinite(n) ? `R$ ${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}` : String(v);
    }
    if (Array.isArray(v)) return `[${v.length} ${v.length !== 1 ? 'itens' : 'item'}]`;
    if (typeof v === 'object') return '{…}';
    const s = String(v);
    return s.length > 80 ? s.slice(0, 77) + '...' : s;
  },

  // Resumo inline para UPDATE: "editou Execução (5%→10%) e Data fim"
  _updateSummaryHtml(r) {
    if (!r.beforeState || !r.body) return null;
    const diffs = this._computeDiff(r.beforeState, r.body);
    if (!diffs.length) return null;
    const it = diffs.map((d) => { const m = this._fieldMeta(d.key); return { label: m.label, type: m.type, old: d.before, new: d.after }; });
    const lbl = (x) => `<strong>${escapeHtml(x.label)}</strong>`;
    const pair = (x) => `<span class="audit-diff">${escapeHtml(this._fmtTyped(x.old, x.type))}→${escapeHtml(this._fmtTyped(x.new, x.type))}</span>`;
    if (it.length === 1) return `editou ${lbl(it[0])} ${pair(it[0])}`;
    if (it.length === 2) return `editou ${lbl(it[0])} ${pair(it[0])} e ${lbl(it[1])}`;
    return `editou ${lbl(it[0])}, ${lbl(it[1])} <span class="audit-more">+${it.length - 2} campos</span>`;
  },

  // ─────────────── Datas (presets) ───────────────
  _dateStr(d) {
    const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return z.toISOString().slice(0, 10);
  },
  _today() { return this._dateStr(new Date()); },
  _daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return this._dateStr(d); },

  // ─────────────── Ciclo de vida ───────────────

  async render() {
    const root = document.getElementById('app');
    root.innerHTML = '<div class="loading-spinner">Carregando...</div>';
    try { if (window.Store && Store.loadAll) await Store.loadAll(); }
    catch (e) { console.warn('[Auditoria] Store.loadAll falhou — nomes podem virar IDs:', e?.message || e); }
    await this._fetch();
    this._draw();
  },

  async _fetch() {
    const f = this._filters;
    const params = new URLSearchParams();
    if (f.user)   params.set('user', f.user);
    if (f.entity) params.set('entity', f.entity);
    if (f.action) params.set('action', f.action);
    if (f.from)   params.set('from', f.from + 'T00:00:00');
    if (f.to)     params.set('to', f.to + 'T23:59:59.999');
    if (f.errors) params.set('errors', '1');
    params.set('limit', this._pageSize);
    params.set('offset', this._page * this._pageSize);
    try {
      const r = await fetch('/api/audit?' + params.toString());
      if (!r.ok) throw new Error('HTTP ' + r.status);
      this._data = await r.json();
    } catch (e) {
      console.warn('[Auditoria] fetch falhou:', e?.message || e);
      this._data = { rows: [], total: 0 };
    }
  },

  async _reload() { this._page = 0; await this._fetch(); this._draw(); },

  _draw() {
    const root = document.getElementById('app');
    const { rows, total } = this._data;
    const f = this._filters;
    const totalPages = Math.max(1, Math.ceil(total / this._pageSize));

    const entidadesOpts = [
      'clientes', 'fornecedores', 'recursos', 'contracts', 'contracts.saidas',
      'contas-pagar', 'notas-fiscais', 'caixa', 'investimentos', 'base',
      'propostas', 'solicitacoes-compra', 'manutencoes', 'veiculos', 'clausulas',
      'candidatos', 'folha-pagamento', 'tipos-base', 'niveis-acesso', 'doc-templates',
      'users', 'socios',
    ];
    const acoesOpts = ['create', 'update', 'delete', 'pagar', 'estornar', 'emitir',
      'aprovar', 'rejeitar', 'avaliar', 'comprar', 'receber', 'enviar', 'aceitar', 'passagem'];

    const isHoje = f.from && f.from === this._today() && f.to === this._today();
    const isSemana = f.from && f.from === this._daysAgo(6) && f.to === this._today();
    const advActive = f.entity || f.action || f.from || f.to;
    const showAdv = this._showAdvanced || !!advActive;
    const chip = (active) => `chip${active ? ' chip--active' : ''}`;

    root.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Histórico de Atividades</h1>
          <p class="page-subtitle">${total} ${total === 1 ? 'atividade' : 'atividades'}</p>
        </div>
      </div>

      <div class="audit-toolbar">
        <input class="form-control audit-search" id="fAuditUser" placeholder="🔍  Buscar por pessoa (email)" value="${escapeHtml(f.user)}" autocomplete="off">
        <div class="audit-presets" role="group" aria-label="Atalhos">
          <button class="${chip(isHoje)}" data-preset="hoje">Hoje</button>
          <button class="${chip(isSemana)}" data-preset="semana">7 dias</button>
          <button class="${chip(f.action === 'delete')}" data-preset="exclusoes">Exclusões</button>
          <button class="${chip(f.errors)}" data-preset="erros">Erros</button>
        </div>
        <button class="btn btn-secondary btn-sm" id="fAuditMore" aria-expanded="${showAdv}">Filtros ${showAdv ? '▴' : '▾'}</button>
        ${(advActive || f.user || f.errors) ? `<button class="btn btn-secondary btn-sm" id="fAuditClear">Limpar tudo</button>` : ''}
      </div>

      <div class="audit-advanced" style="display:${showAdv ? 'grid' : 'none'};">
        <div class="form-group" style="margin:0;">
          <label class="form-label">Em qual tela</label>
          <select class="form-control" id="fAuditEntity">
            <option value="">Todas as telas</option>
            ${entidadesOpts.map(e => `<option value="${e}" ${f.entity === e ? 'selected' : ''}>${escapeHtml(this._entityLabel(e))}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">Tipo de ação</label>
          <select class="form-control" id="fAuditAction">
            <option value="">Qualquer ação</option>
            ${acoesOpts.map(a => `<option value="${a}" ${f.action === a ? 'selected' : ''}>${escapeHtml(this._actionVerb(a).verbo)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">A partir de</label>
          <input class="form-control" type="date" id="fAuditFrom" value="${escapeHtml(f.from)}">
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">Até</label>
          <input class="form-control" type="date" id="fAuditTo" value="${escapeHtml(f.to)}">
        </div>
      </div>

      ${this._renderFeed(rows)}

      ${totalPages > 1 ? `
        <div class="audit-pager">
          <button class="btn btn-secondary" id="auditPrev" ${this._page === 0 ? 'disabled' : ''}>← Anterior</button>
          <span>Página ${this._page + 1} de ${totalPages}</span>
          <button class="btn btn-secondary" id="auditNext" ${this._page >= totalPages - 1 ? 'disabled' : ''}>Próxima →</button>
        </div>` : ''}
    `;

    this._wire();
  },

  _renderFeed(rows) {
    if (!rows.length) {
      return `<div class="empty-state"><div class="empty-state__title">Sem atividades</div><div class="empty-state__msg">Ajuste a busca ou os atalhos para ver eventos.</div></div>`;
    }
    const groups = this._groupByDay(rows);
    return `<div class="audit-feed">${groups.map(g => `
      <div class="audit-day">${escapeHtml(g.label)} <span class="audit-day__count">${g.rows.length}</span></div>
      ${g.rows.map(r => this._eventRow(r)).join('')}
    `).join('')}</div>`;
  },

  _eventRow(r) {
    const isErr = r.status >= 400;
    const hora = r.ts ? new Date(r.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
    const dataHoraCompleta = r.ts ? new Date(r.ts).toLocaleString('pt-BR') : '';

    let whatHtml;
    if (r.action === 'update') {
      const sum = this._updateSummaryHtml(r);
      if (sum) {
        const nome = r.entityLabel || this._entityFriendlyName(r.entity, r.entityId) || '';
        const info = this._entityInfo(r.entity);
        whatHtml = sum + (nome ? ` <span class="audit-ctx">· ${escapeHtml(info.label.toLowerCase())} "${escapeHtml(nome)}"</span>` : '');
      } else {
        whatHtml = this._eventSentence(r);
      }
    } else {
      whatHtml = this._eventSentence(r);
    }

    return `
      <div class="audit-ev${isErr ? ' audit-ev--err' : ''}">
        <span class="audit-ev__who">${escapeHtml(this._userName(r.userEmail))}</span>
        <span class="audit-ev__what">${whatHtml}</span>
        ${isErr ? `<span class="audit-ev__err" title="${escapeHtml(this._statusLabel(r.status).texto)}">⚠ ${escapeHtml(this._statusLabel(r.status).texto)}</span>` : ''}
        <time class="audit-ev__time" title="${escapeHtml(dataHoraCompleta)}">${hora || this._tempoRelativo(r.ts)}</time>
      </div>`;
  },

  _wire() {
    const $ = (id) => document.getElementById(id);

    const search = $('fAuditUser');
    if (search) {
      let t;
      search.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(async () => {
          this._filters.user = search.value.trim();
          await this._reload();
          const el = $('fAuditUser');
          if (el) { el.focus(); const v = el.value; el.value = ''; el.value = v; }
        }, 350);
      });
    }

    document.querySelectorAll('[data-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = btn.dataset.preset;
        const f = this._filters;
        if (p === 'hoje') {
          const on = f.from === this._today() && f.to === this._today();
          f.from = on ? '' : this._today(); f.to = on ? '' : this._today();
        } else if (p === 'semana') {
          const on = f.from === this._daysAgo(6) && f.to === this._today();
          f.from = on ? '' : this._daysAgo(6); f.to = on ? '' : this._today();
        } else if (p === 'exclusoes') {
          f.action = f.action === 'delete' ? '' : 'delete';
        } else if (p === 'erros') {
          f.errors = !f.errors;
        }
        this._reload();
      });
    });

    const more = $('fAuditMore');
    if (more) more.addEventListener('click', () => { this._showAdvanced = !this._showAdvanced; this._draw(); });
    const onAdv = () => {
      this._filters.entity = $('fAuditEntity') ? $('fAuditEntity').value : this._filters.entity;
      this._filters.action = $('fAuditAction') ? $('fAuditAction').value : this._filters.action;
      this._filters.from = $('fAuditFrom') ? $('fAuditFrom').value : this._filters.from;
      this._filters.to = $('fAuditTo') ? $('fAuditTo').value : this._filters.to;
      this._reload();
    };
    ['fAuditEntity', 'fAuditAction', 'fAuditFrom', 'fAuditTo'].forEach(id => {
      const el = $(id); if (el) el.addEventListener('change', onAdv);
    });
    const clear = $('fAuditClear');
    if (clear) clear.addEventListener('click', () => {
      this._filters = { user: '', entity: '', action: '', from: '', to: '', errors: false };
      this._showAdvanced = false;
      this._reload();
    });

    if ($('auditPrev')) $('auditPrev').addEventListener('click', async () => { this._page--; await this._fetch(); this._draw(); });
    if ($('auditNext')) $('auditNext').addEventListener('click', async () => { this._page++; await this._fetch(); this._draw(); });
  },

  // ─────────────── Diff ───────────────

  _computeDiff(before, after) {
    if (!before || !after) return [];
    const skip = new Set(['id', 'createdAt', 'updatedAt', 'created_at', 'updated_at', 'metadata']);
    const diffs = [];
    for (const k of Object.keys(after)) {
      if (skip.has(k)) continue;
      const a = after[k], b = before[k];
      if (JSON.stringify(a) !== JSON.stringify(b)) diffs.push({ key: k, before: b, after: a });
    }
    return diffs;
  },

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
      formaPagamento: 'Forma pagamento', forma_pagamento: 'Forma pagamento', placa: 'Placa',
    };
    return map[k] || k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()).trim();
  },

  _fmtVal(v, key = '') {
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) return String(v);
      const isCurrency = /^(value|valor|valorpago|preco|salario|saldo|total|montante|custo|retencao)$/i.test(key);
      if (isCurrency) return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
      return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(v);
    }
    if (typeof v === 'string') {
      if (/^\d{4}-\d{2}-\d{2}/.test(v)) return this._fmtDatePura(v);
      return v.length > 80 ? v.slice(0, 77) + '...' : v;
    }
    if (Array.isArray(v)) return `[${v.length} ${v.length !== 1 ? 'itens' : 'item'}]`;
    if (typeof v === 'object') return '{...}';
    return String(v);
  },
};
