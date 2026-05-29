// Almoxarifado / Estoque — versão simplificada com matriz Central × Obras + ações em linguagem natural.
// Backend cria Central automaticamente e gera almox de obra on-the-fly via "auto-obra:<contractId>".
window.Estoque = {
  _almoxs: [],          // [{ id, nome, contract_id, contract_name, endereco }]
  _itens: [],           // [{ id, codigo, descricao, ..., custo_medio, saldos: [{almoxId, qtd}] }]
  _historico: [],       // últimas movimentações
  // Filtros e aba persistidos (sobrevivem a reload)
  _filterStore: (window.UIKit?.persistFilter?.('estoque', { busca: '', filtroCategoria: '', tab: 'geral' })) || null,
  get _busca()           { return this._filterStore?.get('busca')           ?? ''; },
  set _busca(v)          { this._filterStore?.set('busca', v); },
  get _filtroCategoria() { return this._filterStore?.get('filtroCategoria') ?? ''; },
  set _filtroCategoria(v){ this._filterStore?.set('filtroCategoria', v); },
  get _tab()             { return this._filterStore?.get('tab')             ?? 'geral'; },
  set _tab(v)            { this._filterStore?.set('tab', v); },

  CATEGORIAS_PADRAO: [
    'Material de Consumo',
    'EPI (Equipamento de Proteção)',
    'Ferramenta',
    'Equipamento',
    'Material Elétrico',
    'Material Hidráulico',
    'Material Mecânico',
    'Tubulação e Conexões',
    'Solda e Acessórios',
    'Tinta e Solventes',
    'Lubrificantes',
    'Parafusos e Fixadores',
    'Limpeza e Higiene',
    'Escritório',
    'Outros',
  ],

  UNIDADES_PADRAO: ['pç', 'kg', 'm', 'm²', 'm³', 'l', 'cx', 'pacote', 'rolo', 'galão', 'par', 'jogo'],

  async render() {
    const app = document.getElementById('app');
    // Skeleton inicial — header + KPIs + tabela placeholder
    app.innerHTML = window.UIKit?.skeleton ? `
      <div class="page-header"><div>
        ${window.UIKit.skeleton('title', 1)}
      </div></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;margin-bottom:var(--sp-md);">
        ${window.UIKit.skeleton('card', 1)}${window.UIKit.skeleton('card', 1)}
        ${window.UIKit.skeleton('card', 1)}${window.UIKit.skeleton('card', 1)}
      </div>
      <div class="card" style="padding:var(--sp-md);">
        ${window.UIKit.skeleton('row', 6)}
      </div>` : '<div class="loading-spinner">Carregando estoque...</div>';
    try {
      await this._loadAll();
      this._draw();
    } catch (e) {
      app.innerHTML = `<div class="card"><p class="text-danger">Erro: ${escapeHtml(e.message)}</p></div>`;
    }
  },

  async _loadAll() {
    const safe = (p, label) => p.then(r => r.ok ? r.json() : null).catch(e => {
      console.warn(`[Estoque] fetch ${label} falhou:`, e?.message || e);
      return null;
    });
    const [visao, movs, _] = await Promise.all([
      safe(fetch('/api/estoque/visao-geral'), 'visao-geral'),
      safe(fetch('/api/estoque/movimentacoes?limit=200'), 'movimentacoes'),
      Store.loadAll().catch(e => {
        console.warn('[Estoque] Store.loadAll falhou — contratos podem faltar nos modais:', e?.message || e);
        return null;
      }),
    ]);
    this._almoxs = visao?.almoxarifados || [];
    this._itens = visao?.itens || [];
    this._historico = movs?.movimentacoes || [];
  },

  // Helpers de saldo
  _saldoEm(item, almoxId) {
    const s = (item.saldos || []).find(x => x.almoxId === almoxId);
    return s ? parseFloat(s.qtd) || 0 : 0;
  },
  _saldoTotal(item) {
    return (item.saldos || []).reduce((s, x) => s + (parseFloat(x.qtd) || 0), 0);
  },
  _saldoCentral(item) {
    const central = this._almoxs.find(a => !a.contractId);
    return central ? this._saldoEm(item, central.id) : 0;
  },
  _idCentral() {
    return this._almoxs.find(a => !a.contractId)?.id || null;
  },
  _almoxsObras() {
    return this._almoxs.filter(a => a.contractId);
  },
  _contratosAtivos() {
    return (Store.state.contracts || []).filter(c => c.status === 'ativo' || c.status === 'pausado');
  },

  _draw() {
    const app = document.getElementById('app');
    const fmt = (v) => Store.formatBRL(v);
    const totalItens = this._itens.length;
    const valorTotal = this._itens.reduce((s, i) => s + this._saldoTotal(i) * (parseFloat(i.custoMedio) || 0), 0);
    const abaixoMin = this._itens.filter(i => this._saldoTotal(i) < (parseFloat(i.estoqueMinimo) || 0)).length;
    const obras = this._almoxsObras();

    const headerHtml = window.UIKit?.pageHeader ? window.UIKit.pageHeader({
      title: 'Almoxarifado',
      icon: window.rhIcon('package', 22),
      subtitle: 'Central + 1 almoxarifado por obra (auto)',
      actions: '<button class="btn btn-primary btn-lg" id="btnNovoItem">+ Novo item</button>',
    }) : '';

    const kpisHtml = window.UIKit?.kpiGrid ? window.UIKit.kpiGrid([
      { label: 'Itens cadastrados', value: totalItens, color: 'var(--color-primary)' },
      { label: 'Valor em estoque',  value: fmt(valorTotal), color: 'var(--color-violet)' },
      { label: 'Abaixo do mínimo',  value: abaixoMin,
        color: abaixoMin > 0 ? 'var(--color-danger)' : 'var(--color-success)',
        hint: abaixoMin > 0 ? '⚠ reposição' : '✓ ok' },
      { label: 'Obras com estoque', value: obras.length, color: 'var(--color-warning)' },
    ]) : '';

    app.innerHTML = `
      ${headerHtml}
      ${kpisHtml}

      <!-- Tabs -->
      <div style="display:flex;gap:2px;margin-bottom:var(--sp-md);border-bottom:1px solid var(--color-border);">
        ${[
          { k: 'geral',     l: '📊 Visão geral' },
          { k: 'historico', l: '🔁 Histórico' },
        ].map(t => `
          <button class="btn-tab-est" data-tab="${t.k}" style="padding:10px 16px;background:${this._tab === t.k ? 'var(--color-primary)' : 'transparent'};color:${this._tab === t.k ? '#fff' : 'var(--color-text)'};border:none;border-radius:6px 6px 0 0;cursor:pointer;font-weight:${this._tab === t.k ? '700' : '500'};">${t.l}</button>
        `).join('')}
      </div>

      <div id="estoqueConteudo">
        ${this._tab === 'geral'     ? this._renderGeral() : ''}
        ${this._tab === 'historico' ? this._renderHistorico() : ''}
      </div>
    `;

    document.querySelectorAll('.btn-tab-est').forEach(b => {
      b.addEventListener('click', () => { this._tab = b.dataset.tab; this._draw(); });
    });
    document.getElementById('btnNovoItem').addEventListener('click', () => this._modalNovoItem());
    this._attachListenersGeral();
    this._attachListenersHistorico();
  },

  // ─────────── Visão Geral (matriz item × almoxarifado) ───────────
  _renderGeral() {
    if (this._itens.length === 0) {
      return `<div class="card">${window.UIKit?.empty ? window.UIKit.empty({
        icon: window.rhIcon('package', 40),
        title: 'Nenhum item cadastrado',
        desc: 'Comece cadastrando seu primeiro item de almoxarifado. Depois use os botões 🟢 Comprei / 🔵 Enviar / 🔴 Usei pra movimentar o estoque.',
        cta: '<button class="btn btn-primary" onclick="document.getElementById(\'btnNovoItem\')?.click()">+ Cadastrar primeiro item</button>',
      }) : `<div style="padding:var(--sp-xl);text-align:center;color:var(--color-text-muted);">
        <div style="font-size:48px;margin-bottom:8px;">📦</div>
        <div style="font-weight:600;font-size:16px;">Nenhum item cadastrado</div>
      </div>`}</div>`;
    }

    const central = this._almoxs.find(a => !a.contractId);
    const obras = this._almoxsObras();
    const filtro = this._busca.toLowerCase();
    const filtrados = this._itens.filter(i => {
      if (this._filtroCategoria && i.categoria !== this._filtroCategoria) return false;
      if (!filtro) return true;
      return (i.descricao || '').toLowerCase().includes(filtro)
          || (i.codigo || '').toLowerCase().includes(filtro)
          || (i.categoria || '').toLowerCase().includes(filtro);
    });

    const categorias = [...new Set(this._itens.map(i => i.categoria).filter(Boolean))].sort();

    return `
      <div class="card" style="padding:var(--sp-md);margin-bottom:var(--sp-md);display:grid;grid-template-columns:1fr 220px;gap:8px;">
        <input class="form-control" id="inputBuscaEstoque" placeholder="🔎 Buscar por descrição, código ou categoria..." value="${escapeHtml(this._busca)}">
        <select class="form-control" id="filtroCategoriaEstoque">
          <option value="">Todas categorias</option>
          ${categorias.map(c => `<option value="${escapeHtml(c)}" ${c === this._filtroCategoria ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
        </select>
      </div>

      <div class="card" style="padding:0;overflow:hidden;">
        <div style="overflow-x:auto;">
          <table class="table" style="margin:0;">
            <thead>
              <tr style="background:var(--color-surface-2);">
                <th scope="col" style="min-width:260px;">Item</th>
                <th scope="col">Categoria</th>
                <th scope="col" style="text-align:center;background:rgba(59,130,246,.08);" title="Saldo no almoxarifado Central">🏠 Central</th>
                <th scope="col" style="text-align:center;background:rgba(245,158,11,.08);" title="Soma do saldo distribuído nas obras">🏗️ Σ Obras</th>
                <th scope="col" style="text-align:center;" title="Em quantas obras o item tem saldo">Obras c/ item</th>
                <th scope="col" style="text-align:center;background:var(--color-surface-2);">Σ Total</th>
                <th scope="col" style="text-align:right;">Custo médio</th>
                <th scope="col" style="text-align:center;width:280px;">Ações</th>
              </tr>
            </thead>
            <tbody>
              ${filtrados.length === 0 ? `<tr><td colspan="8" style="text-align:center;color:var(--color-text-muted);padding:var(--sp-md);">Nenhum item no filtro</td></tr>` : ''}
              ${filtrados.map(item => {
                const total = this._saldoTotal(item);
                const min = parseFloat(item.estoqueMinimo) || 0;
                const abaixo = total < min && min > 0;
                const corLinha = abaixo ? 'rgba(220,38,38,.05)' : 'transparent';
                const saldoCentral = central ? this._saldoEm(item, central.id) : 0;
                const saldoObras = obras.reduce((s, o) => s + this._saldoEm(item, o.id), 0);
                const nObras = obras.filter(o => this._saldoEm(item, o.id) > 0).length;

                return `
                <tr style="background:${corLinha};">
                  <td>
                    <div style="display:flex;align-items:flex-start;gap:8px;">
                      <button class="btn-toggle-obras" data-id="${item.id}" title="Ver/ocultar quantidade por obra" style="background:none;border:none;cursor:pointer;font-size:12px;line-height:1.4;padding:2px 4px;color:var(--color-text-muted);flex:0 0 auto;">▶</button>
                      <div style="flex:1;min-width:0;">
                        <span class="link-item-est" data-id="${item.id}" style="color:var(--color-text);font-weight:600;cursor:pointer;" title="Ver quantidade por obra">${escapeHtml(item.descricao || '')}</span>
                        ${item.codigo ? `<div class="text-muted font-sm">cod. ${escapeHtml(item.codigo)} · ${escapeHtml(item.unidade || '')}</div>` : `<div class="text-muted font-sm">${escapeHtml(item.unidade || '')}</div>`}
                        ${abaixo ? `<div style="font-size:11px;color:var(--color-danger);">⚠ abaixo do mínimo (${min})</div>` : ''}
                      </div>
                    </div>
                  </td>
                  <td><span class="badge" style="background:var(--color-surface-2);font-size:11px;">${escapeHtml(item.categoria || '—')}</span></td>
                  <td style="text-align:center;font-weight:700;background:rgba(59,130,246,.04);">${saldoCentral.toFixed(2)}</td>
                  <td style="text-align:center;font-weight:700;background:rgba(245,158,11,.04);">
                    ${nObras > 0
                      ? `<a href="#" class="link-item-est" data-id="${item.id}" style="color:var(--color-primary);text-decoration:none;" title="Ver lista de obras com este item">${saldoObras.toFixed(2)}</a>`
                      : saldoObras.toFixed(2)}
                  </td>
                  <td style="text-align:center;">
                    ${nObras > 0
                      ? `<a href="#" class="link-item-est" data-id="${item.id}" style="color:var(--color-primary);text-decoration:none;font-weight:600;" title="Ver lista de obras com este item">${nObras}</a>`
                      : '<span class="text-muted">0</span>'}
                  </td>
                  <td style="text-align:center;font-weight:700;background:var(--color-surface-2);">${total.toFixed(2)}</td>
                  <td style="text-align:right;">${Store.formatBRL(parseFloat(item.custoMedio) || 0)}</td>
                  <td style="text-align:center;white-space:nowrap;">
                    <button class="btn-acao-est btn-comprei" data-id="${item.id}" title="Comprei / Recebi" style="background:#10b981;color:#fff;border:none;border-radius:4px;padding:4px 8px;cursor:pointer;font-size:11px;margin:1px;">🟢 Comprei</button>
                    <button class="btn-acao-est btn-enviar" data-id="${item.id}" title="Enviar para obra" ${saldoCentral <= 0 ? 'disabled' : ''} style="background:${saldoCentral > 0 ? '#3b82f6' : '#94a3b8'};color:#fff;border:none;border-radius:4px;padding:4px 8px;cursor:${saldoCentral > 0 ? 'pointer' : 'not-allowed'};font-size:11px;margin:1px;">🔵 Enviar</button>
                    <button class="btn-acao-est btn-usei" data-id="${item.id}" title="Usei na obra" style="background:#dc2626;color:#fff;border:none;border-radius:4px;padding:4px 8px;cursor:pointer;font-size:11px;margin:1px;">🔴 Usei</button>
                    <button class="btn-acao-est btn-mais" data-id="${item.id}" title="Mais opções" style="background:var(--color-surface-2);color:var(--color-text);border:1px solid var(--color-border);border-radius:4px;padding:4px 8px;cursor:pointer;font-size:11px;margin:1px;">⋯</button>
                  </td>
                </tr>
                <tr class="row-detalhe-obras" id="detalhe-${item.id}" style="display:none;">
                  <td colspan="8" style="padding:0;background:var(--color-surface-2);border-top:1px solid var(--color-border);">
                    ${this._listaPorObra(item)}
                  </td>
                </tr>
              `;}).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="text-muted font-sm" style="margin-top:6px;font-size:12px;">
        💡 Clique na <strong>setinha ▶</strong> ao lado do item (ou no nome / números coloridos) para abrir a lista com a quantidade por obra.
      </div>

      <div class="text-muted font-sm" style="margin-top:var(--sp-md);padding:var(--sp-md);background:var(--color-surface-2);border-radius:6px;">
        <strong>Como usar:</strong>
        <span style="color:#10b981;">🟢 Comprei</span> entra mercadoria no Central ·
        <span style="color:#3b82f6;">🔵 Enviar</span> transfere Central → Obra ·
        <span style="color:#dc2626;">🔴 Usei</span> consome na obra (lança custo no contrato) ·
        <span>⋯</span> Voltar da obra · Ajustar saldo · Editar item
      </div>
    `;
  },

  _attachListenersGeral() {
    if (this._tab !== 'geral') return;
    const inp = document.getElementById('inputBuscaEstoque');
    if (inp) {
      inp.addEventListener('input', (e) => {
        this._busca = e.target.value;
        this._draw();
        const inp2 = document.getElementById('inputBuscaEstoque');
        if (inp2) { inp2.focus(); inp2.setSelectionRange(inp2.value.length, inp2.value.length); }
      });
    }
    const sel = document.getElementById('filtroCategoriaEstoque');
    if (sel) sel.addEventListener('change', (e) => { this._filtroCategoria = e.target.value; this._draw(); });

    document.querySelectorAll('.btn-comprei').forEach(b => b.addEventListener('click', () => {
      const item = this._itens.find(x => x.id === b.dataset.id);
      if (item) this._modalComprei(item);
    }));
    document.querySelectorAll('.btn-enviar:not([disabled])').forEach(b => b.addEventListener('click', () => {
      const item = this._itens.find(x => x.id === b.dataset.id);
      if (item) this._modalEnviarObra(item);
    }));
    document.querySelectorAll('.btn-usei').forEach(b => b.addEventListener('click', () => {
      const item = this._itens.find(x => x.id === b.dataset.id);
      if (item) this._modalUseiObra(item);
    }));
    document.querySelectorAll('.btn-mais').forEach(b => b.addEventListener('click', (e) => {
      const item = this._itens.find(x => x.id === b.dataset.id);
      if (item) this._modalMaisOpcoes(item, e);
    }));
    const toggleObras = (id) => {
      const row = document.getElementById('detalhe-' + id);
      if (!row) return;
      const aberto = row.style.display !== 'none';
      row.style.display = aberto ? 'none' : '';
      const arrow = document.querySelector(`.btn-toggle-obras[data-id="${id}"]`);
      if (arrow) arrow.textContent = aberto ? '▶' : '▼';
    };
    document.querySelectorAll('.btn-toggle-obras').forEach(b => b.addEventListener('click', (e) => {
      e.preventDefault();
      toggleObras(b.dataset.id);
    }));
    document.querySelectorAll('.link-item-est').forEach(a => a.addEventListener('click', (e) => {
      e.preventDefault();
      toggleObras(a.dataset.id);
    }));
  },

  // Lista inline (dropdown): quantidade do item por almoxarifado (Central + cada obra com saldo)
  _listaPorObra(item) {
    const central = this._almoxs.find(a => !a.contractId);
    const obras = this._almoxsObras();
    const saldoCentral = central ? this._saldoEm(item, central.id) : 0;
    const linhasObras = obras
      .map(o => ({ almox: o, saldo: this._saldoEm(item, o.id) }))
      .filter(r => r.saldo > 0)
      .sort((a, b) => b.saldo - a.saldo);

    const total = saldoCentral + linhasObras.reduce((s, r) => s + r.saldo, 0);
    const custo = parseFloat(item.custoMedio) || 0;
    const un = escapeHtml(item.unidade || '');

    if (total === 0) {
      return `<div style="padding:12px 20px 12px 44px;color:var(--color-text-muted);font-size:13px;">Item sem saldo em nenhum almoxarifado.</div>`;
    }

    const linhaTpl = (icon, titulo, saldo) => {
      const valor = saldo * custo;
      const pct = total > 0 ? (saldo / total * 100) : 0;
      return `
        <div style="display:flex;align-items:center;gap:12px;padding:8px 20px 8px 44px;border-top:1px solid var(--color-border);">
          <div style="flex:0 0 22px;font-size:18px;text-align:center;">${icon}</div>
          <div style="flex:1;min-width:0;font-size:13px;font-weight:600;">${escapeHtml(titulo)}</div>
          <div style="flex:0 0 auto;text-align:right;min-width:140px;">
            <span style="font-weight:800;font-size:14px;">${saldo.toFixed(2)} <span style="font-size:11px;font-weight:600;color:var(--color-text-muted);">${un}</span></span>
            <span class="text-muted font-sm" style="font-size:11px;margin-left:6px;">${Store.formatBRL(valor)} · ${pct.toFixed(1)}%</span>
          </div>
        </div>`;
    };

    return `
      <div style="padding:4px 0 8px;">
        ${saldoCentral > 0 ? linhaTpl('🏠', 'Central', saldoCentral) : ''}
        ${linhasObras.map(r => linhaTpl('🏗️', r.almox.contractName || r.almox.nome, r.saldo)).join('')}
      </div>`;
  },

  // ─────────── Histórico ───────────
  _renderHistorico() {
    if (this._historico.length === 0) {
      return `<div class="card" style="padding:var(--sp-xl);text-align:center;color:var(--color-text-muted);">
        Nenhuma movimentação ainda. Use os botões verdes/azuis/vermelhos da Visão Geral.</div>`;
    }
    const fmtData = (s) => s ? new Date(s + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
    const central = this._almoxs.find(a => !a.contractId);
    const isCentral = (almoxId) => central && almoxId === central.id;
    const nomeAlmox = (almoxId) => {
      if (!almoxId) return '—';
      if (isCentral(almoxId)) return '🏠 Central';
      const a = this._almoxs.find(x => x.id === almoxId);
      return a ? `🏗️ ${a.contractName || a.nome}` : 'Almox removido';
    };
    const friendlyMov = (m) => {
      const itemDesc = `<strong>${escapeHtml(m.itemDesc || '?')}</strong>`;
      const qtd = `${parseFloat(m.quantidade).toFixed(2)} ${escapeHtml(m.unidade || '')}`;
      if (m.tipo === 'entrada') {
        return `🟢 <strong>Recebi</strong> ${qtd} de ${itemDesc} no ${nomeAlmox(m.almoxarifadoDestinoId)}` +
               (m.custoUnit > 0 ? ` — R$ ${parseFloat(m.custoUnit).toFixed(2)}/un` : '') +
               (m.documento ? ` — ${escapeHtml(m.documento)}` : '');
      }
      if (m.tipo === 'saida') {
        return `🔴 <strong>Usei</strong> ${qtd} de ${itemDesc} em ${escapeHtml(m.contractName || nomeAlmox(m.almoxarifadoOrigemId))}` +
               (m.notas ? ` — ${escapeHtml(m.notas).slice(0, 60)}` : '');
      }
      if (m.tipo === 'transferencia') {
        const sentidoIcon = isCentral(m.almoxarifadoOrigemId) ? '🔵' : '🟡';
        const verbo = isCentral(m.almoxarifadoOrigemId) ? 'Enviei' : 'Voltou';
        return `${sentidoIcon} <strong>${verbo}</strong> ${qtd} de ${itemDesc}: ${nomeAlmox(m.almoxarifadoOrigemId)} → ${nomeAlmox(m.almoxarifadoDestinoId)}`;
      }
      if (m.tipo === 'ajuste') {
        return `🟠 <strong>Ajuste</strong> de ${qtd} em ${itemDesc} (${nomeAlmox(m.almoxarifadoDestinoId || m.almoxarifadoOrigemId)})`;
      }
      return `${m.tipo} — ${itemDesc}`;
    };

    return `
      <div class="card" style="padding:0;overflow:hidden;">
        <table class="table" style="margin:0;">
          <thead>
            <tr><th scope="col" style="width:120px;">Data</th><th scope="col">Movimentação</th><th scope="col" style="text-align:center;width:80px;">Ação</th></tr>
          </thead>
          <tbody>
            ${this._historico.map(m => `
              <tr>
                <td style="white-space:nowrap;">${fmtData(m.data)}</td>
                <td>${friendlyMov(m)}</td>
                <td style="text-align:center;">
                  <button class="btn btn-sm btn-secondary btn-rev-mov" data-id="${m.id}" title="Reverter movimentação (devolve saldo)">↩️</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  _attachListenersHistorico() {
    if (this._tab !== 'historico') return;
    document.querySelectorAll('.btn-rev-mov').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Reverter esta movimentação? O saldo será ajustado de volta.')) return;
      try {
        const r = await fetch(`/api/estoque/movimentacoes/${b.dataset.id}`, { method: 'DELETE' });
        if (!r.ok) throw new Error(await r.text());
        window.showToast('Movimentação revertida', 'success');
        await this._loadAll(); this._draw();
      } catch (e) { window.showToast(e.message, 'error'); }
    }));
  },

  // ═════════════ Modais ═════════════

  // Modal: + Novo item (simples, só dados do item — sem estoque inicial)
  _modalNovoItem(item) {
    const editing = !!item;
    const datalistCat = this.CATEGORIAS_PADRAO.map(c => `<option value="${escapeHtml(c)}">`).join('');
    const datalistUnid = this.UNIDADES_PADRAO.map(u => `<option value="${escapeHtml(u)}">`).join('');

    // Saldo info pra modo edição
    const saldoTotal = editing ? this._saldoTotal(item) : 0;
    const valorTotal = editing ? saldoTotal * (parseFloat(item.custoMedio) || 0) : 0;

    const html = `
      <div class="modal-overlay" id="modalItem">
        <div class="modal" style="width:560px;max-height:90vh;display:flex;flex-direction:column;">
          <div class="modal-header" style="flex-shrink:0;">
            <h2 class="modal-title"><span style="display:inline-flex;align-items:center;gap:8px;">${window.rhIcon(editing ? 'edit' : 'plus', 18)}${editing ? 'Editar' : 'Novo'} item</span></h2>
            <button class="modal-close">✕</button>
          </div>
          <form id="formItem" class="modal-content" style="overflow-y:auto;flex:1;">

            ${editing ? `
              <div style="background:linear-gradient(135deg,rgba(59,130,246,.08),rgba(139,92,246,.08));border:1px solid var(--color-border);border-radius:8px;padding:var(--sp-md);margin-bottom:var(--sp-lg);">
                <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--color-text-muted);margin-bottom:8px;">📊 Estoque atual</div>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:var(--sp-sm);">
                  <div>
                    <div class="text-muted font-sm">Saldo total</div>
                    <div style="font-size:20px;font-weight:800;">${saldoTotal.toFixed(2)} <span style="font-size:13px;font-weight:600;">${escapeHtml(item.unidade || '')}</span></div>
                  </div>
                  <div>
                    <div class="text-muted font-sm">Custo médio</div>
                    <div style="font-size:18px;font-weight:700;">${Store.formatBRL(parseFloat(item.custoMedio) || 0)}</div>
                  </div>
                  <div>
                    <div class="text-muted font-sm">Valor total</div>
                    <div style="font-size:18px;font-weight:700;">${Store.formatBRL(valorTotal)}</div>
                  </div>
                </div>
                <div style="margin-top:var(--sp-sm);padding-top:var(--sp-sm);border-top:1px solid var(--color-border);font-size:13px;">
                  ${(item.saldos || []).filter(s => s.qtd > 0).map(s => {
                    const a = this._almoxs.find(x => x.id === s.almoxId);
                    return `<span style="margin-right:12px;">${a && !a.contractId ? '🏠' : '🏗️'} ${escapeHtml(a?.contractName || a?.nome || '?')}: <strong>${parseFloat(s.qtd).toFixed(2)}</strong></span>`;
                  }).join('') || '<span class="text-muted">Sem saldo</span>'}
                </div>
              </div>
            ` : `
              <div style="background:rgba(59,130,246,.08);border-left:3px solid #3b82f6;border-radius:6px;padding:10px 14px;margin-bottom:var(--sp-md);font-size:13px;">
                💡 <strong>Após criar o item</strong>, use o botão <span style="background:#10b981;color:#fff;padding:1px 6px;border-radius:3px;font-size:11px;">🟢 Comprei</span> na lista para adicionar saldo no Central.
              </div>
            `}

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Código</label>
                <input class="form-control" name="codigo" placeholder="Ex: PRF-001" value="${escapeHtml(item?.codigo || '')}">
              </div>
              <div class="form-group">
                <label class="form-label">Unidade *</label>
                <input class="form-control" name="unidade" list="unidades-estoque" required placeholder="Selecione ou digite..." value="${escapeHtml(item?.unidade || '')}">
                <datalist id="unidades-estoque">${datalistUnid}</datalist>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Descrição *</label>
              <input class="form-control" name="descricao" required placeholder="Ex: Parafuso sextavado M8 x 30mm" value="${escapeHtml(item?.descricao || '')}">
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Categoria *</label>
                <input class="form-control" name="categoria" list="categorias-estoque" required placeholder="Selecione ou digite..." value="${escapeHtml(item?.categoria || '')}">
                <datalist id="categorias-estoque">${datalistCat}</datalist>
              </div>
              <div class="form-group">
                <label class="form-label">Estoque mínimo</label>
                <input class="form-control" type="number" step="0.01" min="0" name="estoqueMinimo" value="${item?.estoqueMinimo || 0}">
                <span style="font-size:12px;color:var(--color-text-muted);">Alerta vermelho quando saldo total for menor</span>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Notas</label>
              <textarea class="form-control" name="notas" rows="2" placeholder="Observações sobre o item">${escapeHtml(item?.notas || '')}</textarea>
            </div>
          </form>
          <div class="modal-footer" style="flex-shrink:0;">
            ${editing ? `<button class="btn btn-danger" id="btnInativarItem" style="margin-right:auto;">Inativar item</button>` : ''}
            <button class="btn btn-secondary" id="btnCancelItem">Cancelar</button>
            <button class="btn btn-primary" id="btnSaveItem">${editing ? 'Salvar' : 'Criar item'}</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalItem');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnCancelItem').addEventListener('click', close);

    document.getElementById('btnInativarItem')?.addEventListener('click', async () => {
      if (!confirm(`Inativar "${item.descricao}"? Histórico e saldos preservados.`)) return;
      try {
        const r = await fetch(`/api/estoque/itens/${item.id}`, { method: 'DELETE' });
        if (!r.ok) throw new Error(await r.text());
        window.showToast('Item inativado', 'success');
        close();
        await this._loadAll(); this._draw();
      } catch (e) { window.showToast(e.message, 'error'); }
    });

    document.getElementById('btnSaveItem').addEventListener('click', async () => {
      const fd = new FormData(document.getElementById('formItem'));
      const data = Object.fromEntries(fd);
      if (!data.descricao?.trim()) { window.showToast('Descrição obrigatória', 'error'); return; }
      if (!data.unidade?.trim())   { window.showToast('Unidade obrigatória', 'error'); return; }
      if (!data.categoria?.trim()) { window.showToast('Categoria obrigatória', 'error'); return; }
      try {
        const url = editing ? `/api/estoque/itens/${item.id}` : `/api/estoque/itens`;
        const method = editing ? 'PUT' : 'POST';
        const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        if (!r.ok) throw new Error(await r.text());
        window.showToast(editing ? 'Item atualizado' : 'Item criado', 'success');
        close();
        await this._loadAll(); this._draw();
      } catch (e) { window.showToast(e.message, 'error'); }
    });
  },

  // Modal: 🟢 Comprei / Recebi (entrada no Central)
  _modalComprei(item) {
    const hoje = new Date().toISOString().split('T')[0];
    const fornecedores = (Store.state.fornecedores || []).filter(f => f.ativo !== false);
    const html = `
      <div class="modal-overlay" id="modalCompra">
        <div class="modal" style="width:520px;">
          <div class="modal-header">
            <h2 class="modal-title">🟢 Comprei / Recebi</h2>
            <button class="modal-close">✕</button>
          </div>
          <form id="formCompra" class="modal-content">
            <div style="background:rgba(16,185,129,.08);border-left:3px solid #10b981;border-radius:6px;padding:10px 14px;margin-bottom:var(--sp-md);">
              <strong>${escapeHtml(item.descricao)}</strong>
              <div style="font-size:13px;color:var(--color-text-muted);">Saldo Central atual: ${this._saldoCentral(item).toFixed(2)} ${escapeHtml(item.unidade || '')}</div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Quantidade *</label>
                <input class="form-control" type="number" step="0.001" min="0.001" name="quantidade" id="qtdComprei" required>
              </div>
              <div class="form-group">
                <label class="form-label">Custo unitário (R$)</label>
                <input class="form-control" type="number" step="0.01" min="0" name="custoUnit" id="custoComprei" placeholder="0,00">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Custo total</label>
              <div id="custoTotal" style="padding:8px 12px;background:var(--color-surface-2);border-radius:6px;font-weight:700;font-size:18px;">R$ 0,00</div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Fornecedor</label>
                <input class="form-control" name="fornecedor" list="fornecedores-list" placeholder="Nome ou selecione...">
                <datalist id="fornecedores-list">${fornecedores.map(f => `<option value="${escapeHtml(f.nome)}">`).join('')}</datalist>
              </div>
              <div class="form-group">
                <label class="form-label">Nº Nota Fiscal</label>
                <input class="form-control" name="nfNumero" placeholder="Ex: 12345">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Data</label>
              <input class="form-control" type="date" name="data" value="${hoje}">
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelCompra">Cancelar</button>
            <button class="btn btn-primary" id="btnSaveCompra" style="background:#10b981;border-color:#10b981;">🟢 Confirmar entrada</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalCompra');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnCancelCompra').addEventListener('click', close);

    // Cálculo de custo total em tempo real
    const calcTotal = () => {
      const q = parseFloat(document.getElementById('qtdComprei').value) || 0;
      const c = parseFloat(document.getElementById('custoComprei').value) || 0;
      document.getElementById('custoTotal').textContent = Store.formatBRL(q * c);
    };
    document.getElementById('qtdComprei').addEventListener('input', calcTotal);
    document.getElementById('custoComprei').addEventListener('input', calcTotal);

    document.getElementById('btnSaveCompra').addEventListener('click', async () => {
      const fd = new FormData(document.getElementById('formCompra'));
      const data = Object.fromEntries(fd);
      const qtd = parseFloat(data.quantidade);
      if (!(qtd > 0)) { window.showToast('Quantidade obrigatória', 'error'); return; }
      try {
        const docs = [data.fornecedor, data.nfNumero ? `NF ${data.nfNumero}` : ''].filter(Boolean).join(' - ');
        const r = await fetch('/api/estoque/movimentacoes', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tipo: 'entrada',
            itemId: item.id,
            almoxarifadoDestinoId: 'auto-central',
            quantidade: qtd,
            custoUnit: parseFloat(data.custoUnit) || 0,
            data: data.data || new Date().toISOString().split('T')[0],
            documento: docs || 'Compra/Recebimento',
            notas: null,
          }),
        });
        if (!r.ok) throw new Error(await r.text());
        window.showToast(`Entrada registrada: ${qtd} ${escapeHtml(item.unidade || '')} no Central`, 'success');
        close();
        await this._loadAll(); this._draw();
      } catch (e) { window.showToast(e.message, 'error'); }
    });
  },

  // Modal: 🔵 Enviar para obra (transferência Central → Almox da Obra)
  _modalEnviarObra(item) {
    const central = this._almoxs.find(a => !a.contractId);
    if (!central) { window.showToast('Central não disponível', 'error'); return; }
    const saldoCentral = this._saldoEm(item, central.id);
    if (saldoCentral <= 0) { window.showToast('Sem saldo no Central pra enviar', 'error'); return; }
    const contratos = this._contratosAtivos();
    if (contratos.length === 0) { window.showToast('Sem obras ativas pra enviar', 'error'); return; }
    const hoje = new Date().toISOString().split('T')[0];

    const html = `
      <div class="modal-overlay" id="modalEnviar">
        <div class="modal" style="width:540px;max-height:90vh;display:flex;flex-direction:column;">
          <div class="modal-header" style="flex-shrink:0;">
            <h2 class="modal-title">🔵 Enviar para obra</h2>
            <button class="modal-close">✕</button>
          </div>
          <form id="formEnviar" class="modal-content" style="overflow-y:auto;flex:1;">
            <div style="background:rgba(59,130,246,.08);border-left:3px solid #3b82f6;border-radius:6px;padding:10px 14px;margin-bottom:var(--sp-md);">
              <strong>${escapeHtml(item.descricao)}</strong>
              <div style="font-size:13px;color:var(--color-text-muted);">Disponível no Central: <strong>${saldoCentral.toFixed(2)} ${escapeHtml(item.unidade || '')}</strong></div>
            </div>
            <div class="form-group">
              <label class="form-label">Quantidade a enviar *</label>
              <input class="form-control" type="number" step="0.001" min="0.001" max="${saldoCentral}" name="quantidade" required>
              <span style="font-size:12px;color:var(--color-text-muted);">Máximo: ${saldoCentral.toFixed(2)}</span>
            </div>
            <div class="form-group">
              <label class="form-label">Para qual obra? *</label>
              <div style="display:flex;flex-direction:column;gap:6px;max-height:200px;overflow-y:auto;border:1px solid var(--color-border);border-radius:6px;padding:8px;">
                ${contratos.map((c, i) => `
                  <label style="display:flex;align-items:center;gap:8px;padding:8px;background:var(--color-surface-2);border-radius:4px;cursor:pointer;">
                    <input type="radio" name="contractId" value="${c.id}" ${i === 0 ? 'checked' : ''}>
                    <div style="flex:1;">
                      <strong>${escapeHtml(c.name)}</strong>
                      <div class="text-muted font-sm">${escapeHtml(c.client || '')}</div>
                    </div>
                  </label>
                `).join('')}
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Data</label>
                <input class="form-control" type="date" name="data" value="${hoje}">
              </div>
              <div class="form-group">
                <label class="form-label">Quem retirou (opcional)</label>
                <input class="form-control" name="quemRetirou" placeholder="Nome do colaborador">
              </div>
            </div>
          </form>
          <div class="modal-footer" style="flex-shrink:0;">
            <button class="btn btn-secondary" id="btnCancelEnviar">Cancelar</button>
            <button class="btn btn-primary" id="btnSaveEnviar" style="background:#3b82f6;border-color:#3b82f6;">🔵 Confirmar envio</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalEnviar');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnCancelEnviar').addEventListener('click', close);

    document.getElementById('btnSaveEnviar').addEventListener('click', async () => {
      const fd = new FormData(document.getElementById('formEnviar'));
      const data = Object.fromEntries(fd);
      const qtd = parseFloat(data.quantidade);
      if (!(qtd > 0)) { window.showToast('Quantidade obrigatória', 'error'); return; }
      if (qtd > saldoCentral) { window.showToast(`Saldo insuficiente (máx ${saldoCentral.toFixed(2)})`, 'error'); return; }
      if (!data.contractId)  { window.showToast('Escolha a obra', 'error'); return; }
      try {
        const r = await fetch('/api/estoque/movimentacoes', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tipo: 'transferencia',
            itemId: item.id,
            almoxarifadoOrigemId: central.id,
            almoxarifadoDestinoId: `auto-obra:${data.contractId}`,
            quantidade: qtd,
            data: data.data || new Date().toISOString().split('T')[0],
            documento: 'Envio pra obra',
            notas: data.quemRetirou ? `Retirou: ${data.quemRetirou}` : null,
          }),
        });
        if (!r.ok) throw new Error(await r.text());
        window.showToast(`Enviado: ${qtd} ${escapeHtml(item.unidade || '')} pra obra`, 'success');
        close();
        await this._loadAll(); this._draw();
      } catch (e) { window.showToast(e.message, 'error'); }
    });
  },

  // Modal: 🔴 Usei na obra (saída com vínculo a contrato)
  _modalUseiObra(item) {
    const obras = this._almoxsObras().map(a => ({
      almoxId: a.id, contractId: a.contractId, name: a.contractName || a.nome,
      saldo: this._saldoEm(item, a.id),
    })).filter(o => o.saldo > 0);

    if (obras.length === 0) {
      const total = this._saldoTotal(item);
      const msg = total > 0
        ? 'Esse item só tem saldo no Central. Use 🔵 Enviar pra obra primeiro.'
        : 'Sem saldo desse item em nenhum lugar. Use 🟢 Comprei primeiro.';
      window.showToast(msg, 'warning');
      return;
    }
    const hoje = new Date().toISOString().split('T')[0];

    const html = `
      <div class="modal-overlay" id="modalUsei">
        <div class="modal" style="width:520px;max-height:90vh;display:flex;flex-direction:column;">
          <div class="modal-header" style="flex-shrink:0;">
            <h2 class="modal-title">🔴 Usei na obra</h2>
            <button class="modal-close">✕</button>
          </div>
          <form id="formUsei" class="modal-content" style="overflow-y:auto;flex:1;">
            <div style="background:rgba(220,38,38,.08);border-left:3px solid #dc2626;border-radius:6px;padding:10px 14px;margin-bottom:var(--sp-md);">
              <strong>${escapeHtml(item.descricao)}</strong>
              <div style="font-size:13px;color:var(--color-text-muted);">Custo médio: ${Store.formatBRL(parseFloat(item.custoMedio) || 0)}/un</div>
            </div>
            <div class="form-group">
              <label class="form-label">De qual obra? *</label>
              <div style="display:flex;flex-direction:column;gap:6px;max-height:160px;overflow-y:auto;border:1px solid var(--color-border);border-radius:6px;padding:8px;">
                ${obras.map((o, i) => `
                  <label style="display:flex;align-items:center;gap:8px;padding:8px;background:var(--color-surface-2);border-radius:4px;cursor:pointer;">
                    <input type="radio" name="obra" value="${o.almoxId}|${o.contractId}|${o.saldo}" ${i === 0 ? 'checked' : ''}>
                    <div style="flex:1;">
                      <strong>🏗️ ${escapeHtml(o.name)}</strong>
                      <div class="text-muted font-sm">Disponível: ${o.saldo.toFixed(2)} ${escapeHtml(item.unidade || '')}</div>
                    </div>
                  </label>
                `).join('')}
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Quantidade usada *</label>
              <input class="form-control" type="number" step="0.001" min="0.001" name="quantidade" id="qtdUsei" required>
              <div id="custoLancado" style="margin-top:4px;font-size:13px;color:var(--color-text-muted);">Custo a lançar na obra: R$ 0,00</div>
            </div>
            <div class="form-group">
              <label class="form-label">Atividade / serviço</label>
              <input class="form-control" name="atividade" placeholder="Ex: Montagem painel elétrico">
            </div>
            <div class="form-group">
              <label class="form-label">Data</label>
              <input class="form-control" type="date" name="data" value="${hoje}">
            </div>
          </form>
          <div class="modal-footer" style="flex-shrink:0;">
            <button class="btn btn-secondary" id="btnCancelUsei">Cancelar</button>
            <button class="btn btn-primary" id="btnSaveUsei" style="background:#dc2626;border-color:#dc2626;">🔴 Confirmar consumo</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalUsei');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnCancelUsei').addEventListener('click', close);

    const recalc = () => {
      const q = parseFloat(document.getElementById('qtdUsei').value) || 0;
      const c = parseFloat(item.custoMedio) || 0;
      document.getElementById('custoLancado').textContent = `Custo a lançar na obra: ${Store.formatBRL(q * c)}`;
    };
    document.getElementById('qtdUsei').addEventListener('input', recalc);

    document.getElementById('btnSaveUsei').addEventListener('click', async () => {
      const fd = new FormData(document.getElementById('formUsei'));
      const data = Object.fromEntries(fd);
      const qtd = parseFloat(data.quantidade);
      if (!(qtd > 0)) { window.showToast('Quantidade obrigatória', 'error'); return; }
      if (!data.obra) { window.showToast('Escolha a obra', 'error'); return; }
      const [almoxId, contractId, saldoStr] = data.obra.split('|');
      const saldo = parseFloat(saldoStr);
      if (qtd > saldo) { window.showToast(`Saldo insuficiente nessa obra (máx ${saldo.toFixed(2)})`, 'error'); return; }
      try {
        const r = await fetch('/api/estoque/movimentacoes', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tipo: 'saida',
            itemId: item.id,
            almoxarifadoOrigemId: almoxId,
            quantidade: qtd,
            data: data.data || new Date().toISOString().split('T')[0],
            contractId,
            documento: 'Consumo em obra',
            notas: data.atividade || null,
          }),
        });
        if (!r.ok) throw new Error(await r.text());
        window.showToast(`Consumido: ${qtd} ${escapeHtml(item.unidade || '')} na obra`, 'success');
        close();
        await this._loadAll(); this._draw();
      } catch (e) { window.showToast(e.message, 'error'); }
    });
  },

  // Modal: 🟡 Voltou da obra (transferência Obra → Central)
  _modalVoltouObra(item) {
    const central = this._almoxs.find(a => !a.contractId);
    if (!central) { window.showToast('Central não disponível', 'error'); return; }
    const obras = this._almoxsObras().map(a => ({
      almoxId: a.id, name: a.contractName || a.nome,
      saldo: this._saldoEm(item, a.id),
    })).filter(o => o.saldo > 0);
    if (obras.length === 0) { window.showToast('Nenhuma obra tem saldo desse item', 'warning'); return; }
    const hoje = new Date().toISOString().split('T')[0];

    const html = `
      <div class="modal-overlay" id="modalVoltou">
        <div class="modal" style="width:520px;max-height:90vh;display:flex;flex-direction:column;">
          <div class="modal-header" style="flex-shrink:0;">
            <h2 class="modal-title">🟡 Voltou da obra</h2>
            <button class="modal-close">✕</button>
          </div>
          <form id="formVoltou" class="modal-content" style="overflow-y:auto;flex:1;">
            <div style="background:rgba(245,158,11,.08);border-left:3px solid #f59e0b;border-radius:6px;padding:10px 14px;margin-bottom:var(--sp-md);">
              <strong>${escapeHtml(item.descricao)}</strong>
              <div style="font-size:13px;color:var(--color-text-muted);">Esta ação devolve mercadoria da obra para o Central</div>
            </div>
            <div class="form-group">
              <label class="form-label">Voltou de qual obra? *</label>
              <div style="display:flex;flex-direction:column;gap:6px;max-height:160px;overflow-y:auto;border:1px solid var(--color-border);border-radius:6px;padding:8px;">
                ${obras.map((o, i) => `
                  <label style="display:flex;align-items:center;gap:8px;padding:8px;background:var(--color-surface-2);border-radius:4px;cursor:pointer;">
                    <input type="radio" name="obra" value="${o.almoxId}|${o.saldo}" ${i === 0 ? 'checked' : ''}>
                    <div style="flex:1;">
                      <strong>🏗️ ${escapeHtml(o.name)}</strong>
                      <div class="text-muted font-sm">Disponível: ${o.saldo.toFixed(2)} ${escapeHtml(item.unidade || '')}</div>
                    </div>
                  </label>
                `).join('')}
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Quantidade *</label>
                <input class="form-control" type="number" step="0.001" min="0.001" name="quantidade" required>
              </div>
              <div class="form-group">
                <label class="form-label">Data</label>
                <input class="form-control" type="date" name="data" value="${hoje}">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Motivo (opcional)</label>
              <input class="form-control" name="motivo" placeholder="Ex: Sobra de obra concluída">
            </div>
          </form>
          <div class="modal-footer" style="flex-shrink:0;">
            <button class="btn btn-secondary" id="btnCancelVoltou">Cancelar</button>
            <button class="btn btn-primary" id="btnSaveVoltou" style="background:#f59e0b;border-color:#f59e0b;">🟡 Confirmar retorno</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalVoltou');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnCancelVoltou').addEventListener('click', close);

    document.getElementById('btnSaveVoltou').addEventListener('click', async () => {
      const fd = new FormData(document.getElementById('formVoltou'));
      const data = Object.fromEntries(fd);
      const qtd = parseFloat(data.quantidade);
      if (!(qtd > 0))     { window.showToast('Quantidade obrigatória', 'error'); return; }
      if (!data.obra)     { window.showToast('Escolha a obra', 'error'); return; }
      const [almoxId, saldoStr] = data.obra.split('|');
      const saldo = parseFloat(saldoStr);
      if (qtd > saldo)    { window.showToast(`Saldo insuficiente (máx ${saldo.toFixed(2)})`, 'error'); return; }
      try {
        const r = await fetch('/api/estoque/movimentacoes', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tipo: 'transferencia',
            itemId: item.id,
            almoxarifadoOrigemId: almoxId,
            almoxarifadoDestinoId: central.id,
            quantidade: qtd,
            data: data.data || new Date().toISOString().split('T')[0],
            documento: 'Retorno da obra',
            notas: data.motivo || null,
          }),
        });
        if (!r.ok) throw new Error(await r.text());
        window.showToast(`Retornado: ${qtd} ${escapeHtml(item.unidade || '')} pro Central`, 'success');
        close();
        await this._loadAll(); this._draw();
      } catch (e) { window.showToast(e.message, 'error'); }
    });
  },

  // Modal: 🟠 Ajustar saldo (correção/inventário)
  _modalAjuste(item) {
    const hoje = new Date().toISOString().split('T')[0];
    const html = `
      <div class="modal-overlay" id="modalAjuste">
        <div class="modal" style="width:520px;">
          <div class="modal-header">
            <h2 class="modal-title">🟠 Corrigir saldo (ajuste)</h2>
            <button class="modal-close">✕</button>
          </div>
          <form id="formAjuste" class="modal-content">
            <div style="background:rgba(245,158,11,.08);border-left:3px solid #f59e0b;border-radius:6px;padding:10px 14px;margin-bottom:var(--sp-md);font-size:13px;">
              <strong>⚠️ Use só pra correções</strong>: contagem física, perda, quebra. Movimentações normais use os outros botões (verde/azul/vermelho).
            </div>
            <div class="form-group">
              <label class="form-label">Item</label>
              <input class="form-control" disabled value="${escapeHtml(item.descricao)}">
            </div>
            <div class="form-group">
              <label class="form-label">Em qual almoxarifado? *</label>
              <select class="form-control" name="almoxId" required>
                ${this._almoxs.map(a => `<option value="${a.id}">${a.contractId ? '🏗️' : '🏠'} ${escapeHtml(a.contractName || a.nome)} (saldo: ${this._saldoEm(item, a.id).toFixed(2)})</option>`).join('')}
              </select>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Sinal</label>
                <select class="form-control" name="sinal">
                  <option value="+">+ (encontrou / contagem maior)</option>
                  <option value="-">− (perda / quebra / contagem menor)</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Quantidade *</label>
                <input class="form-control" type="number" step="0.001" min="0.001" name="quantidade" required>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Motivo *</label>
              <input class="form-control" name="motivo" required placeholder="Ex: Inventário 04/2026 — perda por quebra">
            </div>
            <div class="form-group">
              <label class="form-label">Data</label>
              <input class="form-control" type="date" name="data" value="${hoje}">
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelAjuste">Cancelar</button>
            <button class="btn btn-primary" id="btnSaveAjuste" style="background:#f59e0b;border-color:#f59e0b;">🟠 Aplicar ajuste</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalAjuste');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnCancelAjuste').addEventListener('click', close);

    document.getElementById('btnSaveAjuste').addEventListener('click', async () => {
      const fd = new FormData(document.getElementById('formAjuste'));
      const data = Object.fromEntries(fd);
      const qtd = parseFloat(data.quantidade);
      if (!(qtd > 0))      { window.showToast('Quantidade obrigatória', 'error'); return; }
      if (!data.motivo?.trim()) { window.showToast('Motivo obrigatório', 'error'); return; }
      try {
        const r = await fetch('/api/estoque/movimentacoes', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tipo: 'ajuste',
            itemId: item.id,
            almoxarifadoDestinoId: data.almoxId,
            quantidade: qtd,
            sinal: data.sinal,
            data: data.data || new Date().toISOString().split('T')[0],
            documento: 'Ajuste manual',
            notas: data.motivo,
          }),
        });
        if (!r.ok) throw new Error(await r.text());
        window.showToast('Ajuste aplicado', 'success');
        close();
        await this._loadAll(); this._draw();
      } catch (e) { window.showToast(e.message, 'error'); }
    });
  },

  // Menu "⋯" de opções avançadas (popover ao lado do botão)
  _modalMaisOpcoes(item, ev) {
    // Remove popover anterior se houver
    document.getElementById('popMaisOpc')?.remove();
    const x = ev.clientX, y = ev.clientY;
    const html = `
      <div id="popMaisOpc" style="position:fixed;top:${y}px;left:${x - 170}px;z-index:9999;background:var(--color-surface);border:1px solid var(--color-border);border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.15);min-width:180px;">
        <button class="pop-opt" data-act="voltou" style="width:100%;text-align:left;padding:10px 14px;background:none;border:none;cursor:pointer;font-size:13px;color:var(--color-text);">🟡 Voltou da obra</button>
        <button class="pop-opt" data-act="ajuste" style="width:100%;text-align:left;padding:10px 14px;background:none;border:none;cursor:pointer;font-size:13px;color:var(--color-text);">🟠 Corrigir saldo</button>
        <hr style="margin:0;border:0;border-top:1px solid var(--color-border);">
        <button class="pop-opt" data-act="editar" style="width:100%;text-align:left;padding:10px 14px;background:none;border:none;cursor:pointer;font-size:13px;color:var(--color-text);"><span style="display:inline-flex;align-items:center;gap:8px;">${window.rhIcon('edit', 15)}Editar item</span></button>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const pop = document.getElementById('popMaisOpc');

    const closePop = () => pop?.remove();
    setTimeout(() => {
      document.addEventListener('click', closePop, { once: true });
    }, 50);

    pop.querySelectorAll('.pop-opt').forEach(b => {
      b.addEventListener('mouseover', () => b.style.background = 'var(--color-surface-2)');
      b.addEventListener('mouseout', () => b.style.background = 'none');
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        closePop();
        const act = b.dataset.act;
        if (act === 'voltou') this._modalVoltouObra(item);
        else if (act === 'ajuste') this._modalAjuste(item);
        else if (act === 'editar') this._modalNovoItem(item);
      });
    });
  },
};
