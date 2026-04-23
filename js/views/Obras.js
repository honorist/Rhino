window.Obras = {
  _map: null,
  _markers: [],
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
              <label style="display:block;font-size:11px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;margin-bottom:4px;">Status</label>
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
              <label style="display:block;font-size:11px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;margin-bottom:4px;">Empresa / Cliente</label>
              <input class="form-control" id="filtroCliente" placeholder="Buscar por cliente..." value="${this.filters.clientSearch}">
            </div>
            <div style="flex:0 0 130px;">
              <label style="display:block;font-size:11px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;margin-bottom:4px;">Valor mín.</label>
              <input class="form-control" id="filtroValorMin" data-currency placeholder="0,00" value="${this.filters.valorMin}">
            </div>
            <div style="flex:0 0 130px;">
              <label style="display:block;font-size:11px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;margin-bottom:4px;">Valor máx.</label>
              <input class="form-control" id="filtroValorMax" data-currency placeholder="0,00" value="${this.filters.valorMax}">
            </div>
            <div style="flex:0 0 140px;">
              <label style="display:block;font-size:11px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;margin-bottom:4px;">Início após</label>
              <input class="form-control" id="filtroDataInicio" type="date" value="${this.filters.dataInicio}">
            </div>
            <div style="flex:0 0 140px;">
              <label style="display:block;font-size:11px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;margin-bottom:4px;">Fim antes de</label>
              <input class="form-control" id="filtroDataFim" type="date" value="${this.filters.dataFim}">
            </div>
            <button class="btn btn-secondary" id="btnLimparFiltros" style="white-space:nowrap;">✕ Limpar</button>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 320px;gap:var(--sp-lg);align-items:start;">
          <!-- Mapa -->
          <div class="card" style="padding:0;overflow:hidden;">
            <div id="mapaObras" style="height:600px;width:100%;"></div>
          </div>

          <!-- Lista lateral -->
          <div class="card" style="max-height:620px;overflow-y:auto;">
            <div class="card-header" style="position:sticky;top:0;background:var(--color-surface);z-index:1;">
              <h3 class="card-title">Obras</h3>
              <span id="contadorObras" style="font-size:12px;color:var(--color-text-muted);"></span>
            </div>
            <div id="listaObras" style="display:flex;flex-direction:column;gap:0;"></div>
          </div>
        </div>
      `;

      this._initMap();
      this._bindFiltros();

    } catch (e) {
      app.innerHTML = `<div class="card"><p class="text-danger">Erro: ${e.message}</p></div>`;
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

    const contratos = this._filtrarContratos();
    const lista = document.getElementById('listaObras');
    const contador = document.getElementById('contadorObras');

    if (contador) contador.textContent = `${contratos.length} obra${contratos.length !== 1 ? 's' : ''}`;

    const semCoordenadas = (Store.state.contracts || []).filter(c => !c.lat || !c.lng);

    if (!lista) return;

    if (contratos.length === 0) {
      lista.innerHTML = `<div style="padding:var(--sp-lg);text-align:center;color:var(--color-text-muted);font-size:13px;">
        Nenhuma obra com localização cadastrada.
        ${semCoordenadas.length > 0 ? `<div style="margin-top:var(--sp-sm);">${semCoordenadas.length} contrato(s) sem endereço.</div>` : ''}
      </div>`;
      return;
    }

    lista.innerHTML = '';
    const bounds = [];

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
        "><span style="transform:rotate(45deg);font-size:14px;">🏗</span></div>`,
        className: '',
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -34]
      });

      const marker = L.marker([lat, lng], { icon }).addTo(this._map);

      const endCurto = (c.endereco || '').split(',').slice(0, 2).join(',');
      const popup = `
        <div class="obra-popup">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
            <div style="width:10px;height:10px;border-radius:50%;background:${cor};flex-shrink:0;"></div>
            <span style="font-size:11px;font-weight:700;text-transform:uppercase;color:${cor};">${this._getStatusLabel(c.status)}</span>
          </div>
          <h4>${c.name}</h4>
          <div class="pop-sub">${c.client}</div>
          ${endCurto ? `<div style="font-size:11px;color:#888;margin-bottom:6px;">📍 ${endCurto}</div>` : ''}
          <div class="pop-val">${Store.formatBRL(c.value || 0)}</div>
          ${c.startDate || c.endDate ? `<div style="font-size:11px;color:#888;margin-top:4px;">
            ${c.startDate ? new Date(c.startDate + 'T12:00:00').toLocaleDateString('pt-BR') : '?'}
            → ${c.endDate ? new Date(c.endDate + 'T12:00:00').toLocaleDateString('pt-BR') : '?'}
          </div>` : ''}
          <a href="#/contratos/${c.id}" style="display:inline-block;margin-top:8px;font-size:12px;color:#3182CE;text-decoration:none;font-weight:600;">Ver contrato →</a>
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
        ? `<span style="color:#E53E3E;font-size:10px;font-weight:700;">encerrado ${Math.abs(dias)}d</span>`
        : `<span style="color:${dias <= 7 ? '#E53E3E' : dias <= 30 ? '#D69E2E' : '#718096'};font-size:10px;">vence em ${dias}d</span>`;

      const itemEl = document.createElement('div');
      itemEl.id = `obra-item-${c.id}`;
      itemEl.className = 'obra-lista-item';
      itemEl.style.cssText = 'padding:var(--sp-md);border-bottom:1px solid var(--color-border);cursor:pointer;transition:background .1s;';
      itemEl.innerHTML = `
        <div style="display:flex;align-items:flex-start;gap:var(--sp-sm);">
          <div style="width:8px;height:8px;border-radius:50%;background:${cor};margin-top:5px;flex-shrink:0;"></div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${c.name}</div>
            <div style="font-size:11px;color:var(--color-text-muted);margin-bottom:2px;">${c.client}</div>
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <span style="font-size:13px;font-weight:700;color:var(--color-success);">${Store.formatBRL(c.value || 0)}</span>
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
      aviso.style.cssText = 'padding:var(--sp-sm) var(--sp-md);font-size:11px;color:var(--color-text-muted);background:var(--color-bg);border-top:1px solid var(--color-border);';
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
