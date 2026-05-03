window.Obras = {
  _map: null,
  _markers: [],
  _heatLayer: null,
  _viewMode: (() => { try { return localStorage.getItem('rh-obras-view') || 'markers'; } catch { return 'markers'; } })(),
  filters: { status: '', clientSearch: '', valorMin: '', valorMax: '', dataInicio: '', dataFim: '' },

  async render() {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading-spinner">Carregando...</div>';

    try {
      await Store.loadAll();

      app.innerHTML = `
        <div class="page-header">
          <div>
            <h1 class="page-title">Mapa de Obras</h1>
            <p class="page-subtitle">Localização geográfica de todos os contratos</p>
          </div>
        </div>

        <!-- Filtros -->
        <div class="card" style="margin-bottom:var(--sp-lg);padding:var(--sp-md);">
          <div style="display:flex;gap:var(--sp-md);flex-wrap:wrap;align-items:flex-end;">
            <div style="flex:1;min-width:160px;">
              <label style="display:block;font-size:15px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;margin-bottom:4px;">Status</label>
              <select class="form-control" id="filtroStatus">
                <option value="">Todos</option>
                <option value="prospeccao">Prospecção</option>
                <option value="ativo">Ativo</option>
                <option value="pausado">Pausado</option>
                <option value="concluido">Concluído</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
            <div style="flex:1;min-width:160px;">
              <label style="display:block;font-size:15px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;margin-bottom:4px;">Empresa / Cliente</label>
              <input class="form-control" id="filtroCliente" placeholder="Buscar por cliente..." value="${this.filters.clientSearch}">
            </div>
            <div style="flex:0 0 130px;">
              <label style="display:block;font-size:15px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;margin-bottom:4px;">Valor mín.</label>
              <input class="form-control" id="filtroValorMin" data-currency placeholder="0,00" value="${this.filters.valorMin}">
            </div>
            <div style="flex:0 0 130px;">
              <label style="display:block;font-size:15px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;margin-bottom:4px;">Valor máx.</label>
              <input class="form-control" id="filtroValorMax" data-currency placeholder="0,00" value="${this.filters.valorMax}">
            </div>
            <div style="flex:0 0 140px;">
              <label style="display:block;font-size:15px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;margin-bottom:4px;">Início após</label>
              <input class="form-control" id="filtroDataInicio" type="date" value="${this.filters.dataInicio}">
            </div>
            <div style="flex:0 0 140px;">
              <label style="display:block;font-size:15px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;margin-bottom:4px;">Fim antes de</label>
              <input class="form-control" id="filtroDataFim" type="date" value="${this.filters.dataFim}">
            </div>
            <button class="btn" id="btnLimparFiltros" style="white-space:nowrap;background:transparent;color:var(--color-text);border:1px solid var(--color-border);font-weight:600;font-size:15px;">✕ Limpar</button>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 320px;gap:var(--sp-lg);align-items:start;">
          <!-- Mapa -->
          <div class="card" style="padding:0;overflow:hidden;position:relative;">
            <div role="group" aria-label="Modo do mapa" style="position:absolute;top:12px;right:12px;z-index:600;display:inline-flex;background:var(--color-surface);border:1px solid var(--color-border);border-radius:999px;overflow:hidden;box-shadow:var(--shadow-md);">
              <button class="btn btn-sm" id="obrasViewMarkers" style="border-radius:0;${this._viewMode==='markers'?'background:var(--color-primary);color:#fff;':'background:transparent;'}">Marcadores</button>
              <button class="btn btn-sm" id="obrasViewHeat" style="border-radius:0;${this._viewMode==='heat'?'background:var(--color-primary);color:#fff;':'background:transparent;'}">Heatmap</button>
            </div>
            <div id="mapaObras" style="height:600px;width:100%;"></div>
          </div>

          <!-- Lista lateral -->
          <div class="card" style="max-height:620px;overflow-y:auto;">
            <div class="card-header" style="position:sticky;top:0;background:var(--color-surface);z-index:1;">
              <h3 class="card-title">Obras</h3>
              <span id="contadorObras" style="font-size:15px;color:var(--color-text-muted);"></span>
            </div>
            <div id="listaObras" style="display:flex;flex-direction:column;gap:0;"></div>
          </div>
        </div>
      `;

      this._initMap();
      this._bindFiltros();

    } catch (e) {
      console.error(e);
      app.innerHTML = '<div class="card"><p class="text-danger">Erro ao carregar obras. Tente novamente.</p></div>';
    }
  },

  _getStatusCor(status) {
    return {
      ativo:      '#38A169',
      prospeccao: '#3182CE',
      pausado:    '#D69E2E',
      concluido:  '#718096',
      cancelado:  '#E53E3E'
    }[status] || '#718096';
  },

  _getStatusLabel(status) {
    return {
      ativo:      'Ativo',
      prospeccao: 'Prospecção',
      pausado:    'Pausado',
      concluido:  'Concluído',
      cancelado:  'Cancelado'
    }[status] || status;
  },

  _filtrarContratos() {
    let contratos = (Store.state.contracts || []).filter(c => c.lat && c.lng);

    if (this.filters.status)
      contratos = contratos.filter(c => c.status === this.filters.status);

    if (this.filters.clientSearch)
      contratos = contratos.filter(c =>
        (c.client || '').toLowerCase().includes(this.filters.clientSearch.toLowerCase())
      );

    if (this.filters.valorMin) {
      const min = window.BRLInput.parse(this.filters.valorMin);
      contratos = contratos.filter(c => (c.value || 0) >= min);
    }

    if (this.filters.valorMax) {
      const max = window.BRLInput.parse(this.filters.valorMax);
      contratos = contratos.filter(c => (c.value || 0) <= max);
    }

    if (this.filters.dataInicio)
      contratos = contratos.filter(c => !c.startDate || c.startDate >= this.filters.dataInicio);

    if (this.filters.dataFim)
      contratos = contratos.filter(c => !c.endDate || c.endDate <= this.filters.dataFim);

    return contratos;
  },

  _initMap() {
    if (this._map) { this._map.remove(); this._map = null; }

    const mapaDiv = document.getElementById('mapaObras');
    if (!mapaDiv || typeof L === 'undefined') return;

    // Centro padrão: Brasil
    this._map = L.map('mapaObras').setView([-15.7801, -47.9292], 5);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>'
    }).addTo(this._map);

    this._atualizarMarcadores();
  },

  _atualizarMarcadores() {
    // Limpar marcadores anteriores
    this._markers.forEach(m => m.remove());
    this._markers = [];
    if (this._heatLayer) { this._heatLayer.remove(); this._heatLayer = null; }

    // Bind dos botões de modo (G3) — idempotente
    const setMode = (m) => {
      this._viewMode = m;
      try { localStorage.setItem('rh-obras-view', m); } catch {}
      this.render();
    };
    const bMk = document.getElementById('obrasViewMarkers');
    const bHt = document.getElementById('obrasViewHeat');
    if (bMk && !bMk._bound) { bMk._bound = true; bMk.addEventListener('click', () => setMode('markers')); }
    if (bHt && !bHt._bound) { bHt._bound = true; bHt.addEventListener('click', () => setMode('heat')); }

    const contratos = this._filtrarContratos();
    const lista = document.getElementById('listaObras');
    const contador = document.getElementById('contadorObras');

    if (contador) contador.textContent = `${contratos.length} obra${contratos.length !== 1 ? 's' : ''}`;

    const semCoordenadas = (Store.state.contracts || []).filter(c => !c.lat || !c.lng);

    if (!lista) return;

    if (contratos.length === 0) {
      lista.innerHTML = `<div style="padding:var(--sp-lg);text-align:center;color:var(--color-text-muted);font-size:15px;">
        Nenhuma obra com localização cadastrada.
        ${semCoordenadas.length > 0 ? `<div style="margin-top:var(--sp-sm);">${semCoordenadas.length} contrato(s) sem endereço.</div>` : ''}
      </div>`;
      return;
    }

    lista.innerHTML = '';
    const bounds = [];

    // Modo Heatmap: círculos transparentes proporcionais ao valor
    if (this._viewMode === 'heat') {
      const valores = contratos.map(c => parseFloat(c.value) || 0);
      const maxVal = Math.max(1, ...valores);
      const group = L.layerGroup();
      contratos.forEach((c) => {
        const lat = parseFloat(c.lat); const lng = parseFloat(c.lng);
        if (isNaN(lat) || isNaN(lng)) return;
        bounds.push([lat, lng]);
        const intensity = Math.max(0.15, (parseFloat(c.value) || 0) / maxVal);
        const radius = 25 + intensity * 55;
        const corH = this._getStatusCor(c.status);
        const nfsH = (Store.state.notas_fiscais || []).filter(nf => nf.contractId === c.id && nf.emitida);
        const totalMedidoH = nfsH.reduce((s, nf) => s + (parseFloat(nf.valor) || 0), 0);
        const pctMedidoH = c.value > 0 ? (totalMedidoH / c.value * 100) : null;
        const heatPopup = `
          <div class="obra-popup">
            <h4 style="margin:0 0 2px;">${escapeHtml(c.name)}</h4>
            <div class="pop-sub" style="margin-bottom:6px;">${escapeHtml(c.client)}</div>
            <span style="background:${corH};color:#fff;font-size:11px;padding:2px 8px;border-radius:99px;font-weight:700;">${this._getStatusLabel(c.status)}</span>
            <div style="margin-top:6px;" class="pop-val">${Store.formatBRL(c.value || 0)}</div>
            ${pctMedidoH !== null ? `<div style="font-size:12px;color:#666;">${pctMedidoH.toFixed(0)}% medido</div>` : ''}
            <a href="#/contratos/${c.id}" style="display:block;margin-top:8px;font-size:13px;font-weight:700;color:#55588B;">Ver contrato →</a>
          </div>
        `;
        L.circle([lat, lng], {
          radius: radius * 1000, // em metros
          color: corH,
          fillColor: corH,
          fillOpacity: 0.18 + intensity * 0.25,
          weight: 1.2,
        }).addTo(group).bindPopup(heatPopup);
      });
      group.addTo(this._map);
      this._heatLayer = group;
      // Lista lateral
      lista.innerHTML = contratos.map(c => `<div class="obra-lista-item" style="padding:8px 12px;border-bottom:1px solid var(--color-border);"><strong>${escapeHtml(c.name)}</strong><br><span style="font-size:13px;color:var(--color-text-muted);">${Store.formatBRL(c.value || 0)}</span></div>`).join('');
      if (bounds.length) this._map.fitBounds(bounds, { padding: [40, 40] });
      return;
    }

    contratos.forEach((c, idx) => {
      const lat = parseFloat(c.lat);
      const lng = parseFloat(c.lng);
      const cor = this._getStatusCor(c.status);
      bounds.push([lat, lng]);

      // Ícone personalizado
      const icon = L.divIcon({
        html: `<div style="
          width:32px;height:32px;border-radius:50% 50% 50% 0;
          background:${cor};border:3px solid #fff;
          box-shadow:0 2px 8px rgba(0,0,0,.4);
          transform:rotate(-45deg);
          display:flex;align-items:center;justify-content:center;
        "><span style="transform:rotate(45deg);font-size:15px;">🏗</span></div>`,
        className: '',
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -34]
      });

      const marker = L.marker([lat, lng], { icon }).addTo(this._map);

      const endCurto = (c.endereco || '').split(',').slice(0, 2).join(',');
      const nfsMedidas = (Store.state.notas_fiscais || []).filter(nf => nf.contractId === c.id && nf.emitida);
      const totalMedido = nfsMedidas.reduce((s, nf) => s + (parseFloat(nf.valor) || 0), 0);
      const pctMedido = c.value > 0 ? (totalMedido / c.value * 100) : null;
      const popup = `
        <div class="obra-popup">
          <h4 style="margin:0 0 2px;">${escapeHtml(c.name)}</h4>
          <div class="pop-sub" style="margin-bottom:6px;">${escapeHtml(c.client)}</div>
          <span style="background:${cor};color:#fff;font-size:11px;padding:2px 8px;border-radius:99px;font-weight:700;">${this._getStatusLabel(c.status)}</span>
          ${endCurto ? `<div style="font-size:13px;color:#888;margin-top:6px;">📍 ${escapeHtml(endCurto)}</div>` : ''}
          <div style="margin-top:6px;" class="pop-val">${Store.formatBRL(c.value || 0)}</div>
          ${pctMedido !== null ? `<div style="font-size:12px;color:#666;">${pctMedido.toFixed(0)}% medido</div>` : ''}
          ${c.startDate || c.endDate ? `<div style="font-size:13px;color:#888;margin-top:4px;">
            ${c.startDate ? new Date(c.startDate + 'T12:00:00').toLocaleDateString('pt-BR') : '?'}
            → ${c.endDate ? new Date(c.endDate + 'T12:00:00').toLocaleDateString('pt-BR') : '?'}
          </div>` : ''}
          <a href="#/contratos/${c.id}" style="display:block;margin-top:8px;font-size:13px;font-weight:700;color:#55588B;">Ver contrato →</a>
        </div>
      `;
      marker.bindPopup(popup);
      this._markers.push(marker);

      // Clique no marcador destaca item na lista
      marker.on('click', () => {
        document.querySelectorAll('.obra-lista-item').forEach(el => el.style.background = '');
        const item = document.getElementById(`obra-item-${c.id}`);
        if (item) { item.style.background = 'var(--color-bg)'; item.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
      });

      // Item na lista lateral
      const dias = c.endDate
        ? Math.floor((new Date(c.endDate) - new Date()) / 86400000)
        : null;
      const diasLabel = dias === null ? '' : dias < 0
        ? `<span style="color:#E53E3E;font-size:15px;font-weight:700;">encerrado ${Math.abs(dias)}d</span>`
        : `<span style="color:${dias <= 7 ? '#E53E3E' : dias <= 30 ? '#D69E2E' : '#718096'};font-size:15px;">vence em ${dias}d</span>`;

      const itemEl = document.createElement('div');
      itemEl.id = `obra-item-${c.id}`;
      itemEl.className = 'obra-lista-item';
      itemEl.style.cssText = 'padding:var(--sp-md);border-bottom:1px solid var(--color-border);cursor:pointer;transition:background .1s;';
      itemEl.innerHTML = `
        <div style="display:flex;align-items:flex-start;gap:var(--sp-sm);">
          <div style="width:8px;height:8px;border-radius:50%;background:${cor};margin-top:5px;flex-shrink:0;"></div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(c.name)}</div>
            <div style="font-size:15px;color:var(--color-text-muted);margin-bottom:2px;">${escapeHtml(c.client)}</div>
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <span style="font-size:15px;font-weight:700;color:var(--color-success);">${Store.formatBRL(c.value || 0)}</span>
              ${diasLabel}
            </div>
          </div>
        </div>
      `;
      itemEl.addEventListener('click', () => {
        this._map.setView([lat, lng], 15);
        marker.openPopup();
      });
      itemEl.addEventListener('mouseenter', () => itemEl.style.background = 'var(--color-bg)');
      itemEl.addEventListener('mouseleave', () => itemEl.style.background = '');
      lista.appendChild(itemEl);
    });

    // Ajustar mapa para mostrar todos os marcadores
    if (bounds.length > 0) {
      if (bounds.length === 1) {
        this._map.setView(bounds[0], 14);
      } else {
        this._map.fitBounds(bounds, { padding: [40, 40] });
      }
    }

    // Aviso de contratos sem endereço
    if (semCoordenadas.length > 0) {
      const aviso = document.createElement('div');
      aviso.style.cssText = 'padding:var(--sp-sm) var(--sp-md);font-size:15px;color:var(--color-text-muted);background:var(--color-bg);border-top:1px solid var(--color-border);';
      aviso.textContent = `${semCoordenadas.length} contrato(s) sem endereço cadastrado`;
      lista.appendChild(aviso);
    }
  },

  _bindFiltros() {
    const apply = () => {
      this.filters.status      = document.getElementById('filtroStatus')?.value || '';
      this.filters.clientSearch= document.getElementById('filtroCliente')?.value || '';
      this.filters.valorMin    = document.getElementById('filtroValorMin')?.value || '';
      this.filters.valorMax    = document.getElementById('filtroValorMax')?.value || '';
      this.filters.dataInicio  = document.getElementById('filtroDataInicio')?.value || '';
      this.filters.dataFim     = document.getElementById('filtroDataFim')?.value || '';
      this._atualizarMarcadores();
    };

    ['filtroStatus','filtroCliente','filtroValorMin','filtroValorMax','filtroDataInicio','filtroDataFim']
      .forEach(id => document.getElementById(id)?.addEventListener('input', apply));
    ['filtroStatus','filtroDataInicio','filtroDataFim']
      .forEach(id => document.getElementById(id)?.addEventListener('change', apply));

    document.getElementById('btnLimparFiltros')?.addEventListener('click', () => {
      this.filters = { status:'', clientSearch:'', valorMin:'', valorMax:'', dataInicio:'', dataFim:'' };
      document.getElementById('filtroStatus').value = '';
      document.getElementById('filtroCliente').value = '';
      document.getElementById('filtroValorMin').value = '';
      document.getElementById('filtroValorMax').value = '';
      document.getElementById('filtroDataInicio').value = '';
      document.getElementById('filtroDataFim').value = '';
      this._atualizarMarcadores();
    });
  }
};
