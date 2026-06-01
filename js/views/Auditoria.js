// Auditoria — quem fez o quê, quando. Linha do tempo legível por dia + frases
// em linguagem natural. `escapeHtml` é global (window.escapeHtml, de store.js).
window.Auditoria = {
  _filters: { user: '', entity: '', action: '', from: '', to: '', errors: false },
  _page: 0,
  _pageSize: 50,
  _data: { rows: [], total: 0 },
  _showAdvanced: false,
  _lastFocus: null,
  _viewMode: (() => { try { return localStorage.getItem('rh-audit-view') || 'timeline'; } catch { return 'timeline'; } })(),

  // ─────────────── Dicionários (entidade, artigo, verbo) ───────────────

  // entity técnico → { label amigável, artigo p/ frase ("o cliente", "a conta") }
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

  // Resolve entityId → nome humano lendo do Store. '' se não achar.
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

  // ação técnica → { verbo amigável, cor, bg }
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
      create:               mk('Criou', 'green'),
      update:               mk('Editou', 'blue'),
      delete:               mk('Excluiu', 'red'),
      pagar:                mk('Pagou', 'green'),
      estornar:             mk('Estornou', 'amber'),
      emitir:               mk('Emitiu', 'indigo'),
      'cancelar-emissao':   mk('Cancelou emissão', 'amber'),
      passagem:             mk('Comprou passagem', 'purple'),
      aprovar:              mk('Aprovou', 'green'),
      rejeitar:             mk('Rejeitou', 'red'),
      avaliar:              mk('Avaliou', 'indigo'),
      comprar:              mk('Comprou', 'green'),
      receber:              mk('Recebeu', 'teal'),
      cancelar:             mk('Cancelou', 'amber'),
      enviar:               mk('Enviou', 'blue'),
      aceitar:              mk('Aceitou', 'green'),
      duplicar:             mk('Duplicou', 'gray'),
      retorno:              mk('Registrou retorno', 'teal'),
      allocate:             mk('Alocou', 'blue'),
      gerar:                mk('Gerou', 'green'),
      limpar:               mk('Limpou', 'red'),
      'processar-recorrencias': mk('Processou recorrências', 'blue'),
      triagem:              mk('Fez triagem', 'indigo'),
      antecedentes:         mk('Verificou antecedentes', 'indigo'),
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

  // Avatar determinístico (iniciais + matiz a partir do email).
  _avatar(email) {
    const h = (email || '').split('@')[0] || '?';
    const parts = h.split(/[._\- ]+/).filter(Boolean);
    const initials = (parts.length >= 2 ? parts[0][0] + parts[1][0] : h.slice(0, 2)).toUpperCase();
    let hash = 0;
    for (let i = 0; i < (email || '').length; i++) hash = (hash * 31 + email.charCodeAt(i)) >>> 0;
    return { initials, hue: hash % 360 };
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

  // Rótulo do dia para o separador da linha do tempo.
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

  // Agrupa as linhas (já ordenadas DESC) em blocos por dia local.
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

  // Alvo do evento (entidade + nome em negrito), SEM o verbo — usado no modo
  // tabela junto do selo colorido. Casos especiais cujo verbo já embute o
  // objeto ("Comprou passagem") devolvem só o complemento.
  _eventTarget(r) {
    const info = this._entityInfo(r.entity);
    const nome = r.entityLabel || this._entityFriendlyName(r.entity, r.entityId) || '';
    const nameHtml = nome
      ? `<strong class="audit-name">${escapeHtml(nome)}</strong>`
      : (r.entityId && r.action !== 'create' ? '<span class="audit-removed">(removido)</span>' : '');

    if (r.action === 'passagem') return nome ? `para ${nameHtml}` : '';
    if (r.action === 'gerar' && r.entity === 'folha-pagamento') return 'a <strong>folha de pagamento</strong> do mês';
    if (r.action === 'limpar' && r.entity === 'folha-pagamento') return 'a <strong>folha de pagamento</strong>';
    if (r.action === 'processar-recorrencias') return '';

    return `${info.artigo} <strong>${escapeHtml(info.label.toLowerCase())}</strong>${nameHtml ? ' ' + nameHtml : ''}`;
  },

  // Frase natural completa ("criou o cliente X") — usada na linha do tempo.
  _eventSentence(r) {
    return `${this._actionVerb(r.action).verbo.toLowerCase()} ${this._eventTarget(r)}`.trim();
  },

  // ─────────────── Diff tipado (US-1 / US-2) ───────────────

  // Mapa campo → { rótulo, tipo }. `tipo` controla a formatação na tela.
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

  // Data PURA (sem fuso): '2026-06-01' → '01/06/2026'. Corrige o bug do −1 dia.
  _fmtDatePura(v) {
    if (v == null || v === '') return '—';
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    const d = new Date(v);
    return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('pt-BR');
  },

  // Formata um valor conforme o tipo (percent/date/money/text). '***' p/ sensível.
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

  // Pluraliza a entidade para eventos agrupados ("conta a pagar" → "5 contas a
  // pagar"; "cliente" → "5 clientes"). Pluraliza a 1ª palavra do rótulo.
  _pluralEntity(entity, n) {
    const words = this._entityInfo(entity).label.toLowerCase().split(' ');
    if (!/[sx]$/.test(words[0])) words[0] += 's';
    return `${n} ${words.join(' ')}`;
  },

  // Resumo da timeline para UPDATE (US-2): "alterou Execução (5%→10%) e Data fim".
  // Retorna HTML, ou null se não houver diff (cai na frase genérica).
  _updateSummaryHtml(r) {
    if (!r.beforeState || !r.body) return null;
    const diffs = this._computeDiff(r.beforeState, r.body);
    if (!diffs.length) return null;
    const it = diffs.map((d) => { const m = this._fieldMeta(d.key); return { label: m.label, type: m.type, old: d.before, new: d.after }; });
    const lbl = (x) => `<strong>${escapeHtml(x.label)}</strong>`;
    const pair = (x) => `(${escapeHtml(this._fmtTyped(x.old, x.type))}→${escapeHtml(this._fmtTyped(x.new, x.type))})`;
    if (it.length === 1) return `alterou ${lbl(it[0])} ${pair(it[0])}`;
    if (it.length === 2) return `alterou ${lbl(it[0])} ${pair(it[0])} e ${lbl(it[1])}`;
    return `alterou ${lbl(it[0])}, ${lbl(it[1])} <span class="audit-more">+${it.length - 2} campos</span>`;
  },

  // Agrupa eventos IDÊNTICOS consecutivos (mesmo autor+ação+entidade) — US-2.
  // Só agrupa create/delete (updates têm diffs distintos). Adiciona _count/_ids.
  _groupConsecutive(rows) {
    const out = [];
    for (const r of rows) {
      const last = out[out.length - 1];
      const groupable = r.action === 'create' || r.action === 'delete';
      const same = last && last._count && groupable
        && last.userEmail === r.userEmail && last.action === r.action
        && last.entity === r.entity && (last.status >= 400) === (r.status >= 400);
      if (same) { last._count++; last._ids.push(r.id); }
      else { out.push({ ...r, _count: groupable ? 1 : 0, _ids: [r.id] }); }
    }
    return out;
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
    // Carrega entidades uma vez para resolver nomes amigáveis. Paginação e
    // filtros depois usam _fetch()+_draw() (sem recarregar o Store).
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
    // Datas só têm dia → expande para o intervalo inclusivo do dia inteiro.
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

    // Presets ativos (para destaque dos chips)
    const isHoje = f.from && f.from === this._today() && f.to === this._today();
    const isSemana = f.from && f.from === this._daysAgo(6) && f.to === this._today();
    const advActive = f.entity || f.action || f.from || f.to;
    const showAdv = this._showAdvanced || !!advActive;
    const chip = (active) => `chip${active ? ' chip--active' : ''}`;

    root.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Histórico de Atividades</h1>
          <p class="page-subtitle">Tudo que aconteceu no sistema — quem fez, o quê e quando</p>
        </div>
        <div class="audit-headmeta">
          <span>${total} ${total === 1 ? 'atividade' : 'atividades'}</span>
          <div role="group" aria-label="Modo de visualização" class="audit-viewtoggle">
            <button class="btn btn-sm ${this._viewMode === 'timeline' ? 'is-on' : ''}" id="audViewTimeline">Linha do tempo</button>
            <button class="btn btn-sm ${this._viewMode === 'table' ? 'is-on' : ''}" id="audViewTable">Tabela</button>
          </div>
        </div>
      </div>

      <!-- Barra: busca única + atalhos -->
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

      <!-- Filtros avançados (colapsável) -->
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

      ${this._viewMode === 'timeline' ? this._renderTimeline(rows) : this._renderTable(rows)}

      ${totalPages > 1 ? `
        <div class="audit-pager">
          <button class="btn btn-secondary" id="auditPrev" ${this._page === 0 ? 'disabled' : ''}>← Anterior</button>
          <span>Página ${this._page + 1} de ${totalPages}</span>
          <button class="btn btn-secondary" id="auditNext" ${this._page >= totalPages - 1 ? 'disabled' : ''}>Próxima →</button>
        </div>` : ''}
    `;

    this._wire(rows);
  },

  _renderTimeline(rows) {
    if (!rows.length) {
      return `<div class="empty-state"><div class="empty-state__title">Sem atividades</div><div class="empty-state__msg">Ajuste a busca ou os atalhos para ver eventos.</div></div>`;
    }
    const groups = this._groupByDay(rows);
    return `<div class="audit-feed">${groups.map(g => {
      const evs = this._groupConsecutive(g.rows);
      return `
      <div class="audit-day">${escapeHtml(g.label)} <span class="audit-day__count">${g.rows.length}</span></div>
      ${evs.map(r => this._eventRow(r)).join('')}`;
    }).join('')}</div>`;
  },

  _eventRow(r) {
    const av = this._avatar(r.userEmail || r.userId || '');
    const isErr = r.status >= 400;
    const hora = r.ts ? new Date(r.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';

    // Frase: agrupado ("criou 5 contas a pagar") > diff de update > frase genérica.
    let whatHtml;
    if (r._count > 1) {
      whatHtml = `${escapeHtml(this._actionVerb(r.action).verbo.toLowerCase())} <strong>${escapeHtml(this._pluralEntity(r.entity, r._count))}</strong>`;
    } else if (r.action === 'update') {
      const sum = this._updateSummaryHtml(r);
      if (sum) {
        const nome = r.entityLabel || this._entityFriendlyName(r.entity, r.entityId) || '';
        whatHtml = sum + (nome ? ` <span class="audit-ctx">· ${escapeHtml(nome)}</span>` : '');
      } else {
        whatHtml = this._eventSentence(r);
      }
    } else {
      whatHtml = this._eventSentence(r);
    }
    return `
      <div class="audit-ev${isErr ? ' audit-ev--err' : ''}" data-id="${r.id}" tabindex="0" role="button" aria-label="Ver detalhe">
        <div class="audit-ava" style="background:hsl(${av.hue},52%,42%);" aria-hidden="true">${escapeHtml(av.initials)}</div>
        <div class="audit-ev__main">
          <div class="audit-ev__line">
            <span class="audit-ev__who">${escapeHtml(this._userName(r.userEmail))}</span>
            <span class="audit-ev__what">${whatHtml}</span>
            ${r._count > 1 ? `<span class="audit-ev__badge">${r._count}×</span>` : ''}
            ${isErr ? `<span class="audit-ev__err" title="${escapeHtml(this._statusLabel(r.status).texto)}">⚠ ${escapeHtml(this._statusLabel(r.status).texto)}</span>` : ''}
          </div>
        </div>
        <time class="audit-ev__time" title="${escapeHtml(this._tempoRelativo(r.ts))}">${hora}</time>
      </div>`;
  },

  _renderTable(rows) {
    const fmtDT = (s) => s ? new Date(s).toLocaleString('pt-BR') : '—';
    return `
      <table class="data-table">
        <thead>
          <tr>
            <th scope="col" style="width:170px;">Quando</th>
            <th scope="col" style="width:200px;">Quem</th>
            <th scope="col">Fez o quê</th>
            <th scope="col" style="width:120px;text-align:center;">Resultado</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length === 0 ? `<tr><td colspan="4" style="text-align:center;color:var(--color-text-muted);padding:var(--sp-xl);">Nenhuma atividade no filtro selecionado</td></tr>` : ''}
          ${rows.map(r => {
            const verbInfo = this._actionVerb(r.action);
            const statusInfo = this._statusLabel(r.status);
            const diffs = (r.action === 'update' && r.beforeState && r.body) ? this._computeDiff(r.beforeState, r.body) : [];
            const preview = diffs.slice(0, 2).map(d =>
              `<span style="font-size:12px;color:var(--color-text-muted);">${escapeHtml(this._fieldLabel(d.key))}: <strong>${escapeHtml(this._fmtVal(d.before, d.key))}</strong> → <strong style="color:var(--color-primary);">${escapeHtml(this._fmtVal(d.after, d.key))}</strong></span>`
            ).join(' · ');
            const extra = diffs.length > 2 ? ` <span style="font-size:11px;color:var(--color-text-muted);">+${diffs.length - 2} mudanças</span>` : '';
            return `
              <tr class="row-audit" data-id="${r.id}" style="cursor:pointer;">
                <td><div style="font-weight:500;">${fmtDT(r.ts)}</div><div style="font-size:12px;color:var(--color-text-muted);">${this._tempoRelativo(r.ts)}</div></td>
                <td><strong>${escapeHtml(this._userName(r.userEmail))}</strong><div style="font-size:12px;color:var(--color-text-muted);">${escapeHtml(r.userEmail || r.userId || '—')}</div></td>
                <td>
                  <span style="background:${verbInfo.bg};color:${verbInfo.cor};padding:2px 10px;border-radius:99px;font-weight:600;font-size:13px;margin-right:6px;">${escapeHtml(verbInfo.verbo)}</span>
                  ${this._eventTarget(r)}
                  ${preview ? `<div style="margin-top:4px;">${preview}${extra}</div>` : ''}
                </td>
                <td style="text-align:center;"><span style="color:${statusInfo.cor};font-weight:600;font-size:13px;">${statusInfo.texto}</span></td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  },

  _wire(rows) {
    const $ = (id) => document.getElementById(id);

    // Busca por pessoa — debounce no `input` (antes só reagia ao sair do campo).
    const search = $('fAuditUser');
    if (search) {
      let t;
      search.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(async () => {
          this._filters.user = search.value.trim();
          await this._reload();
          // O _draw recria o input → devolve foco e leva o cursor ao fim.
          const el = $('fAuditUser');
          if (el) { el.focus(); const v = el.value; el.value = ''; el.value = v; }
        }, 350);
      });
    }

    // Atalhos (presets)
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

    // Filtros avançados
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

    // Abrir detalhe (clique + teclado)
    const open = (el) => {
      const ev = rows.find(x => String(x.id) === el.dataset.id);
      if (ev) { this._lastFocus = el; this._showDetail(ev); }
    };
    document.querySelectorAll('.row-audit, .audit-ev').forEach(el => {
      el.addEventListener('click', () => open(el));
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(el); }
      });
    });

    // Alternância de modo de visualização
    const setMode = (m) => { this._viewMode = m; try { localStorage.setItem('rh-audit-view', m); } catch {} this._draw(); };
    if ($('audViewTable')) $('audViewTable').addEventListener('click', () => setMode('table'));
    if ($('audViewTimeline')) $('audViewTimeline').addEventListener('click', () => setMode('timeline'));

    // Paginação — só busca a página (não recarrega o Store inteiro)
    if ($('auditPrev')) $('auditPrev').addEventListener('click', async () => { this._page--; await this._fetch(); this._draw(); });
    if ($('auditNext')) $('auditNext').addEventListener('click', async () => { this._page++; await this._fetch(); this._draw(); });
  },

  // ─────────────── Diff ───────────────

  // Diferença entre before e after (after = body do PUT). Ignora timestamps/ids.
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

  // Formata um valor para exibição. `key` evita formatar tudo como moeda
  // (antes "Nível: 3" virava "3,00" e ano "2025" virava "2.025,00").
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
      if (/^\d{4}-\d{2}-\d{2}/.test(v)) return this._fmtDatePura(v); // sem fuso (US-3)
      return v.length > 80 ? v.slice(0, 77) + '...' : v;
    }
    if (Array.isArray(v)) return `[${v.length} ${v.length !== 1 ? 'itens' : 'item'}]`;
    if (typeof v === 'object') return '{...}';
    return String(v);
  },

  // ─────────────── Detalhe (modal) ───────────────

  _showDetail(ev) {
    const fmtDT = (s) => s ? new Date(s).toLocaleString('pt-BR') : '—';
    const verbInfo = this._actionVerb(ev.action);
    const info = this._entityInfo(ev.entity);
    const statusInfo = this._statusLabel(ev.status);
    const bodyJson = ev.body ? JSON.stringify(ev.body, null, 2) : '(sem dados enviados)';

    const userName = this._userName(ev.userEmail) || ev.userId || 'Desconhecido';
    const nomeAlvo = ev.entityLabel || this._entityFriendlyName(ev.entity, ev.entityId) || '';
    const frase = nomeAlvo
      ? `${userName} ${verbInfo.verbo.toLowerCase()} ${info.artigo} ${info.label.toLowerCase()} "${nomeAlvo}"`
      : `${userName} ${verbInfo.verbo.toLowerCase()} ${info.artigo} ${info.label.toLowerCase()}`;

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
                ${diffs.map(d => { const meta = this._fieldMeta(d.key); return `
                  <tr>
                    <td><strong>${escapeHtml(meta.label)}</strong></td>
                    <td style="color:var(--color-text-muted);text-decoration:line-through;">${escapeHtml(this._fmtTyped(d.before, meta.type))}</td>
                    <td style="color:var(--color-primary);font-weight:600;">${escapeHtml(this._fmtTyped(d.after, meta.type))}</td>
                  </tr>`; }).join('')}
              </tbody>
            </table>
          </div>`;
      } else {
        secaoMudancas = `<div style="padding:var(--sp-md);background:var(--color-surface-2);border-radius:6px;color:var(--color-text-muted);font-size:13px;">Nenhum campo mudou (provavelmente um save sem alterações).</div>`;
      }
    } else if (ev.action === 'delete' && ev.beforeState) {
      const campos = Object.entries(ev.beforeState)
        .filter(([k, v]) => !['id', 'createdAt', 'updatedAt', 'created_at', 'updated_at', 'metadata', 'documentos', 'folgas', 'budget'].includes(k))
        .filter(([, v]) => v !== null && v !== undefined && v !== '');
      if (campos.length > 0) {
        secaoMudancas = `
          <div style="margin-bottom:var(--sp-md);">
            <h4 style="font-size:14px;font-weight:600;margin:0 0 var(--sp-sm) 0;">🗑️ Dados que foram excluídos</h4>
            <div style="display:grid;grid-template-columns:140px 1fr;gap:8px;font-size:13px;padding:var(--sp-md);background:var(--color-surface-2);border-radius:6px;border-left:3px solid var(--color-danger);">
              ${campos.map(([k, v]) => { const meta = this._fieldMeta(k); return `<div style="color:var(--color-text-muted);">${escapeHtml(meta.label)}</div><div style="font-weight:500;">${escapeHtml(this._fmtTyped(v, meta.type))}</div>`; }).join('')}
            </div>
          </div>`;
      }
    } else if (ev.action !== 'delete' && ev.body) {
      const campos = Object.entries(ev.body)
        .filter(([k, v]) => !['id', 'createdAt', 'updatedAt'].includes(k))
        .filter(([, v]) => v !== null && v !== undefined && v !== '');
      if (campos.length > 0) {
        secaoMudancas = `
          <div style="margin-bottom:var(--sp-md);">
            <h4 style="font-size:14px;font-weight:600;margin:0 0 var(--sp-sm) 0;">✨ Dados informados</h4>
            <div style="display:grid;grid-template-columns:140px 1fr;gap:8px;font-size:13px;padding:var(--sp-md);background:var(--color-surface-2);border-radius:6px;border-left:3px solid var(--color-success);">
              ${campos.map(([k, v]) => { const meta = this._fieldMeta(k); return `<div style="color:var(--color-text-muted);">${escapeHtml(meta.label)}</div><div style="font-weight:500;">${escapeHtml(this._fmtTyped(v, meta.type))}</div>`; }).join('')}
            </div>
          </div>`;
      }
    }

    const html = `
      <div class="modal-overlay" id="modalAudit">
        <div class="modal" style="width:680px;max-width:95vw;max-height:90vh;overflow-y:auto;" role="dialog" aria-modal="true" aria-label="${escapeHtml(frase)}">
          <div class="modal-header">
            <div>
              <h2 class="modal-title" style="margin:0;">${escapeHtml(frase)}</h2>
              <div style="font-size:13px;color:var(--color-text-muted);margin-top:4px;">${fmtDT(ev.ts)} (${this._tempoRelativo(ev.ts)})</div>
            </div>
            <button class="modal-close" aria-label="Fechar">✕</button>
          </div>
          <div class="modal-content">
            <div style="padding:var(--sp-md);background:var(--color-surface-2);border-radius:8px;margin-bottom:var(--sp-md);">
              <div style="display:grid;grid-template-columns:120px 1fr;gap:10px;font-size:14px;line-height:1.7;">
                <div style="color:var(--color-text-muted);">Quem fez</div>
                <div><strong>${escapeHtml(ev.userEmail || '—')}</strong></div>
                <div style="color:var(--color-text-muted);">O que fez</div>
                <div><span style="background:${verbInfo.bg};color:${verbInfo.cor};padding:2px 10px;border-radius:99px;font-weight:700;font-size:13px;">${escapeHtml(verbInfo.verbo)}</span><strong style="margin-left:6px;">${escapeHtml(info.label)}</strong></div>
                <div style="color:var(--color-text-muted);">Resultado</div>
                <div style="color:${statusInfo.cor};font-weight:600;">${statusInfo.texto}</div>
              </div>
            </div>
            ${secaoMudancas}
            <details style="margin-top:var(--sp-md);">
              <summary style="cursor:pointer;font-size:13px;font-weight:600;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em;">Detalhes técnicos</summary>
              <div style="display:grid;grid-template-columns:130px 1fr;gap:8px;font-size:12px;margin:8px 0;color:var(--color-text-muted);">
                ${ev.entityId ? `<div>Identificador</div><div style="font-family:monospace;">${escapeHtml(ev.entityId)}</div>` : ''}
                <div>De qual rede (IP)</div><div style="font-family:monospace;">${escapeHtml(ev.ip || '—')}</div>
              </div>
              ${ev.body && Object.keys(ev.body || {}).length > 0 ? `<pre style="background:var(--color-bg);border:1px solid var(--color-border);border-radius:6px;padding:var(--sp-md);font-size:12px;font-family:monospace;overflow:auto;max-height:300px;white-space:pre-wrap;margin-top:8px;">${escapeHtml(bodyJson)}</pre>` : ''}
            </details>
          </div>
          <div class="modal-footer"><button class="btn btn-secondary" id="btnAuditClose">Fechar</button></div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalAudit');
    const close = () => {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      if (this._lastFocus && document.contains(this._lastFocus)) { try { this._lastFocus.focus(); } catch {} }
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnAuditClose').addEventListener('click', close);
    const closeBtn = overlay.querySelector('.modal-close');
    if (closeBtn) closeBtn.focus();
  },
};
