window.Clientes = {
  busca: '',

  async render() {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading-spinner">Carregando...</div>';

    try {
      await Store.loadAll();

      const termo = (this.busca || '').toLowerCase().trim();
      const filtrados = termo
        ? Store.state.clientes.filter(c =>
            (c.nome || '').toLowerCase().includes(termo) ||
            (c.empresa || '').toLowerCase().includes(termo) ||
            (c.email || '').toLowerCase().includes(termo) ||
            (c.telefone || '').includes(termo) ||
            (c.cargo || '').toLowerCase().includes(termo) ||
            (c.setor || '').toLowerCase().includes(termo))
        : Store.state.clientes;

      const html = `
        <div class="page-header">
          <div>
            <h1 class="page-title">Clientes</h1>
            <p class="page-subtitle">${Store.state.clientes.length} cliente${Store.state.clientes.length !== 1 ? 's' : ''} cadastrado${Store.state.clientes.length !== 1 ? 's' : ''}</p>
          </div>
          <button class="btn btn-primary btn-lg" id="btnNovoCliente">+ Novo Cliente</button>
        </div>

        <div class="card" style="padding:var(--sp-md);margin-bottom:var(--sp-lg);">
          <input class="form-control" id="inputBusca" placeholder="🔍 Buscar por nome, empresa, email ou telefone..." value="${this.busca}">
        </div>

        <div class="card">
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Empresa</th>
                  <th>Cargo / Setor</th>
                  <th>Telefone</th>
                  <th>Email</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                ${filtrados.length === 0 ? `
                  <tr><td colspan="6" class="text-center text-muted" style="padding:var(--sp-xl);">
                    ${termo ? 'Nenhum cliente encontrado para a busca' : 'Nenhum cliente cadastrado'}
                  </td></tr>
                ` : filtrados.map(c => `
                  <tr>
                    <td><strong>${escapeHtml(c.nome) || '—'}</strong></td>
                    <td>${escapeHtml(c.empresa) || '—'}</td>
                    <td>
                      ${c.cargo ? `<div style="font-size:15px;">${escapeHtml(c.cargo)}</div>` : ''}
                      ${c.setor ? `<div style="font-size:15px;color:var(--color-text-muted);">${escapeHtml(c.setor)}</div>` : ''}
                      ${!c.cargo && !c.setor ? '—' : ''}
                    </td>
                    <td>${c.telefone ? `<a href="tel:${escapeHtml(c.telefone)}" style="color:var(--color-primary);text-decoration:none;">${escapeHtml(c.telefone)}</a>` : '—'}</td>
                    <td>${c.email ? `<a href="mailto:${escapeHtml(c.email)}" style="color:var(--color-primary);text-decoration:none;">${escapeHtml(c.email)}</a>` : '—'}</td>
                    <td>
                      <div class="actions-cell">
                        <a class="action-link btn-editar" data-id="${c.id}">Editar</a>
                        <a class="action-link danger btn-excluir" data-id="${c.id}">Excluir</a>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;

      app.innerHTML = html;

      document.getElementById('btnNovoCliente').addEventListener('click', () => this.showModal());
      document.getElementById('inputBusca').addEventListener('input', e => {
        this.busca = e.target.value;
        // Re-renderiza apenas a tabela (debounce simples: só a cada 250ms)
        clearTimeout(this._tBusca);
        this._tBusca = setTimeout(() => this.render(), 250);
      });

      document.querySelectorAll('.btn-editar').forEach(b => b.addEventListener('click', e => this.showModal(e.target.dataset.id)));
      document.querySelectorAll('.btn-excluir').forEach(b => b.addEventListener('click', e => this.deleteCliente(e.target.dataset.id)));
    } catch (e) {
      console.error(e);
      app.innerHTML = '<div class="card"><p class="text-danger">Erro ao carregar clientes. Tente novamente.</p></div>';
    }
  },

  showModal(clienteId) {
    const cliente = clienteId ? Store.state.clientes.find(c => c.id === clienteId) : null;
    const title = cliente ? 'Editar Cliente' : 'Novo Cliente';

    const html = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal" style="width:620px;">
          <div class="modal-header">
            <h2 class="modal-title">${title}</h2>
            <button class="modal-close">✕</button>
          </div>
          <form id="formCliente" class="modal-content">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Nome *</label>
                <input class="form-control" name="nome" value="${cliente?.nome || ''}" required>
              </div>
              <div class="form-group">
                <label class="form-label">Empresa</label>
                <input class="form-control" name="empresa" value="${cliente?.empresa || ''}" placeholder="Razão social">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Cargo</label>
                <input class="form-control" name="cargo" value="${cliente?.cargo || ''}" placeholder="Ex: Gerente de Compras">
              </div>
              <div class="form-group">
                <label class="form-label">Setor</label>
                <input class="form-control" name="setor" value="${cliente?.setor || ''}" placeholder="Ex: Engenharia, TI, Operações">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Telefone</label>
                <input class="form-control" name="telefone" value="${cliente?.telefone || ''}" placeholder="(00) 00000-0000">
              </div>
              <div class="form-group">
                <label class="form-label">Email</label>
                <input class="form-control" name="email" type="email" value="${cliente?.email || ''}" placeholder="email@exemplo.com">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Endereço</label>
              <div style="position:relative;" id="enderecoWrap">
                <input class="form-control" id="enderecoInput" name="endereco"
                  value="${cliente?.endereco || ''}"
                  placeholder="Buscar endereço no mapa..."
                  autocomplete="off"
                  style="padding-right:36px;">
                <span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:16px;pointer-events:none;">📍</span>
                <div id="nominatimDropdown" class="nominatim-dropdown" style="display:none;top:calc(100% + 4px);left:0;"></div>
              </div>
              <input type="hidden" id="enderecoLat" name="lat" value="${cliente?.lat || ''}">
              <input type="hidden" id="enderecoLng" name="lng" value="${cliente?.lng || ''}">
              <div id="miniMapa" style="height:160px;border-radius:6px;margin-top:8px;overflow:hidden;border:1px solid var(--color-border);${cliente?.lat ? '' : 'display:none;'}"></div>
            </div>
            <div class="form-group">
              <label class="form-label">Notas</label>
              <textarea class="form-control" name="notas" style="min-height:60px;">${cliente?.notas || ''}</textarea>
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelar">Cancelar</button>
            <button class="btn btn-primary" id="btnSalvar">${cliente ? 'Atualizar' : 'Criar'}</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalOverlay');
    const close = () => {
      if (window.Clientes._miniMap) { window.Clientes._miniMap.remove(); window.Clientes._miniMap = null; }
      overlay.remove();
    };
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnCancelar').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    this._initEnderecoSearch(cliente?.lat, cliente?.lng, cliente?.endereco);

    document.getElementById('btnSalvar').addEventListener('click', async () => {
      const fd = new FormData(document.getElementById('formCliente'));
      const data = Object.fromEntries(fd);
      if (!data.nome || !data.nome.trim()) { window.showToast('Nome é obrigatório', 'error'); return; }

      try {
        if (cliente) await Store.updateCliente(clienteId, data);
        else await Store.createCliente(data);
        window.showToast(cliente ? 'Cliente atualizado' : 'Cliente criado', 'success');
        close();
        this.render();
      } catch (e) { window.showToast(e.message, 'error'); }
    });
  },

  _miniMap: null,

  _initEnderecoSearch(lat, lng, enderecoSalvo) {
    const input    = document.getElementById('enderecoInput');
    const dropdown = document.getElementById('nominatimDropdown');
    const latInput = document.getElementById('enderecoLat');
    const lngInput = document.getElementById('enderecoLng');
    const mapaDiv  = document.getElementById('miniMapa');
    if (!input) return;

    const mostrarMiniMapa = (la, lo, label) => {
      mapaDiv.style.display = 'block';
      setTimeout(() => {
        if (this._miniMap) { this._miniMap.remove(); this._miniMap = null; }
        this._miniMap = L.map(mapaDiv, { zoomControl: true, scrollWheelZoom: false })
          .setView([la, lo], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap'
        }).addTo(this._miniMap);
        L.marker([la, lo]).addTo(this._miniMap).bindPopup(label).openPopup();
      }, 50);
    };

    if (lat && lng) mostrarMiniMapa(parseFloat(lat), parseFloat(lng), enderecoSalvo || 'Local');

    let debounce = null;
    input.addEventListener('input', () => {
      clearTimeout(debounce);
      const q = input.value.trim();
      if (q.length < 4) { dropdown.style.display = 'none'; return; }
      debounce = setTimeout(async () => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=6&addressdetails=1`,
            { headers: { 'Accept-Language': 'pt-BR,pt;q=0.9' } }
          );
          const results = await res.json();
          if (!results.length) { dropdown.style.display = 'none'; return; }

          dropdown.innerHTML = results.map(r => {
            const name   = r.display_name.split(',').slice(0, 3).join(',');
            const detail = r.display_name.split(',').slice(3).join(',').trim();
            return `<div class="nominatim-item" data-lat="${r.lat}" data-lng="${r.lon}" data-name="${r.display_name.replace(/"/g, '&quot;')}">
              <strong>${name}</strong><span>${detail}</span>
            </div>`;
          }).join('');
          dropdown.style.display = 'block';

          dropdown.querySelectorAll('.nominatim-item').forEach(el => {
            el.addEventListener('click', () => {
              const la = parseFloat(el.dataset.lat);
              const lo = parseFloat(el.dataset.lng);
              const nome = el.dataset.name;
              input.value = nome;
              latInput.value = la;
              lngInput.value = lo;
              dropdown.style.display = 'none';
              mostrarMiniMapa(la, lo, nome);
            });
          });
        } catch { dropdown.style.display = 'none'; }
      }, 450);
    });

    document.addEventListener('click', e => {
      if (!document.getElementById('enderecoWrap')?.contains(e.target))
        dropdown.style.display = 'none';
    });
  },

  async deleteCliente(id) {
    if (!confirm('Excluir este cliente?')) return;
    try {
      await Store.deleteCliente(id);
      window.showToast('Cliente removido', 'success');
      this.render();
    } catch (e) { window.showToast(e.message, 'error'); }
  }
};
