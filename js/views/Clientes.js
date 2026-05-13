window.Clientes = {
  busca: '',

  async render() {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading-spinner">Carregando...</div>';

    try {
      await Store.loadFor(['clientes']);

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
                  <tr class="row-cliente" data-id="${c.id}" style="cursor:pointer;" title="Clique para ver detalhes">
                    <td><strong>${escapeHtml(c.nome) || '—'}</strong></td>
                    <td>${escapeHtml(c.empresa) || '—'}</td>
                    <td>
                      ${c.cargo ? `<div style="font-size:15px;">${escapeHtml(c.cargo)}</div>` : ''}
                      ${c.setor ? `<div style="font-size:15px;color:var(--color-text-muted);">${escapeHtml(c.setor)}</div>` : ''}
                      ${!c.cargo && !c.setor ? '—' : ''}
                    </td>
                    <td>${c.telefone ? `<a href="tel:${escapeHtml(c.telefone)}" style="color:var(--color-primary);text-decoration:none;" onclick="event.stopPropagation()">${escapeHtml(c.telefone)}</a>` : '—'}</td>
                    <td>${c.email ? `<a href="mailto:${escapeHtml(c.email)}" style="color:var(--color-primary);text-decoration:none;" onclick="event.stopPropagation()">${escapeHtml(c.email)}</a>` : '—'}</td>
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

      document.querySelectorAll('.btn-editar').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); this.showModal(e.target.dataset.id); }));
      document.querySelectorAll('.btn-excluir').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); this.deleteCliente(e.target.dataset.id); }));

      // Click na linha → abre modal de detalhe (read-only)
      document.querySelectorAll('.row-cliente').forEach(tr => {
        tr.addEventListener('click', (e) => {
          if (e.target.closest('.actions-cell') || e.target.tagName === 'A') return;
          this.showDetail(tr.dataset.id);
        });
      });
    } catch (e) {
      console.error(e);
      app.innerHTML = '<div class="card"><p class="text-danger">Erro ao carregar clientes. Tente novamente.</p></div>';
    }
  },

  // Modal de detalhe do cliente (read-only). Mesmo estilo do detalhe de colaborador.
  showDetail(clienteId) {
    const c = Store.state.clientes.find(x => x.id === clienteId);
    if (!c) return;

    // Busca contratos vinculados a este cliente
    const contratosCliente = (Store.state.contracts || []).filter(ct => ct.clientId === clienteId || ct.client === c.nome || ct.client === c.empresa);
    const totalCarteira = contratosCliente.reduce((s, ct) => s + (parseFloat(ct.value) || 0), 0);
    const ativos = contratosCliente.filter(ct => ct.status === 'ativo').length;

    const fmtPhone = window.formatPhoneBR ? window.formatPhoneBR(c.telefone || '') : (c.telefone || '');
    const linha = (label, value, link) => value ? `
      <div style="padding:10px 0;border-bottom:1px solid var(--rh-ink-200);display:flex;justify-content:space-between;gap:12px;">
        <span class="rh-meta" style="flex-shrink:0;">${escapeHtml(label)}</span>
        <span style="text-align:right;font-weight:600;">${link ? `<a href="${link}" style="color:var(--rh-brand-500);text-decoration:none;">${escapeHtml(value)}</a>` : escapeHtml(value)}</span>
      </div>
    ` : '';

    const html = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal" style="width:640px;max-width:95vw;max-height:90vh;overflow-y:auto;">
          <div class="modal-header">
            <div>
              <h2 class="modal-title">${escapeHtml(c.nome || '—')}</h2>
              <div class="rh-meta" style="margin-top:2px;">${escapeHtml(c.empresa || 'Sem empresa cadastrada')}${c.cargo ? ' · ' + escapeHtml(c.cargo) : ''}</div>
            </div>
            <button class="modal-close">✕</button>
          </div>
          <div class="modal-content">
            <!-- KPIs do relacionamento -->
            <div class="rh-grid-3" style="margin-bottom:var(--sp-md);">
              <div class="rh-pipeline-stage" style="text-align:left;">
                <div class="rh-pipeline-stage-label">Contratos</div>
                <div class="rh-pipeline-stage-count">${contratosCliente.length}</div>
                <div class="rh-pipeline-stage-value">${ativos} ativo${ativos !== 1 ? 's' : ''}</div>
              </div>
              <div class="rh-pipeline-stage" style="text-align:left;">
                <div class="rh-pipeline-stage-label">Carteira total</div>
                <div class="rh-pipeline-stage-count" style="font-size:22px;">${Store.formatBRL(totalCarteira)}</div>
                <div class="rh-pipeline-stage-value">soma dos contratos</div>
              </div>
              <div class="rh-pipeline-stage" style="text-align:left;">
                <div class="rh-pipeline-stage-label">Cadastro</div>
                <div class="rh-pipeline-stage-count" style="font-size:14px;">${c.createdAt ? new Date(c.createdAt).toLocaleDateString('pt-BR') : '—'}</div>
                <div class="rh-pipeline-stage-value">data de criação</div>
              </div>
            </div>

            <!-- Dados do contato -->
            <h3 class="rh-h3" style="margin:var(--sp-md) 0 8px;">Dados do contato</h3>
            ${linha('Nome', c.nome)}
            ${linha('Empresa', c.empresa)}
            ${linha('Cargo', c.cargo)}
            ${linha('Setor', c.setor)}
            ${linha('Telefone', fmtPhone, c.telefone ? 'tel:' + c.telefone : null)}
            ${linha('Email', c.email, c.email ? 'mailto:' + c.email : null)}
            ${linha('Endereço', c.endereco)}
            ${c.notas ? `
              <h3 class="rh-h3" style="margin:var(--sp-md) 0 8px;">Notas</h3>
              <div style="padding:10px;background:var(--rh-ink-100);border-radius:6px;font-size:14px;white-space:pre-wrap;">${escapeHtml(c.notas)}</div>
            ` : ''}

            ${contratosCliente.length > 0 ? `
              <h3 class="rh-h3" style="margin:var(--sp-md) 0 8px;">Contratos</h3>
              <div style="display:flex;flex-direction:column;gap:6px;">
                ${contratosCliente.map(ct => `
                  <a href="#/contratos/${ct.id}" style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border:1px solid var(--rh-ink-200);border-radius:var(--rh-r-sm);text-decoration:none;color:inherit;background:var(--rh-paper);">
                    <div style="min-width:0;">
                      <div style="font-weight:600;font-size:14px;">${escapeHtml(ct.name || '—')}</div>
                      <div class="rh-meta-xs">${ct.status === 'ativo' ? 'ativo' : escapeHtml(ct.status || '—')}${ct.endDate ? ' · até ' + new Date(ct.endDate).toLocaleDateString('pt-BR') : ''}</div>
                    </div>
                    <div style="font-weight:700;text-align:right;">${Store.formatBRL(parseFloat(ct.value) || 0)}</div>
                  </a>
                `).join('')}
              </div>
            ` : ''}
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnFechar">Fechar</button>
            <button class="btn btn-secondary" id="btnGerarProposta" title="Cria nova proposta com este cliente já preenchido">📋 Gerar Proposta</button>
            <button class="btn btn-primary" id="btnEditarDet">Editar</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalOverlay');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnFechar').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.getElementById('btnEditarDet').addEventListener('click', () => { close(); this.showModal(clienteId); });
    document.getElementById('btnGerarProposta')?.addEventListener('click', () => {
      close();
      // Navega para Propostas e abre modal "Nova" pré-preenchido com este cliente
      location.hash = '#/proposta';
      setTimeout(() => {
        if (window.Propostas && typeof window.Propostas.showModalNova === 'function') {
          window.Propostas.showModalNova({ clienteId });
        }
      }, 300);
    });
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
                <input class="form-control" name="telefone" data-phone inputmode="numeric" maxlength="16" value="${cliente?.telefone ? window.formatPhoneBR(cliente.telefone) : ''}" placeholder="(00) 00000-0000">
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
              <textarea class="form-control" name="notas" style="min-height:60px;">${window.escapeHtml(cliente?.notas || '')}</textarea>
            </div>

            <!-- Acesso ao Portal -->
            <div style="margin-top:var(--sp-md);padding-top:var(--sp-md);border-top:1px solid var(--color-border);">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--sp-sm);">
                <h3 style="margin:0;font-size:14px;font-weight:600;">Acesso ao Portal do Cliente</h3>
                ${cliente?.portalEmail ? `<span style="font-size:12px;font-weight:600;padding:2px 8px;border-radius:12px;background:#38A16922;color:#38A169;">● Portal ativo</span>` : ''}
              </div>
              <p style="margin:0 0 var(--sp-sm);font-size:13px;color:var(--color-text-muted);">
                O cliente entrará com o email já cadastrado acima.
              </p>
              <div class="form-group">
                <label class="form-label">${cliente?.portalEmail ? 'Nova senha (vazio = manter)' : 'Senha de acesso'}</label>
                <input class="form-control" name="portalSenha" type="password" autocomplete="new-password" placeholder="${cliente?.portalEmail ? 'Deixe vazio para manter a senha atual' : 'Definir senha de acesso ao portal'}">
              </div>
              ${cliente?.portalEmail ? `
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:#c33;">
                  <input type="checkbox" name="removerPortalAcesso" value="1">
                  Remover acesso ao portal
                </label>
              ` : ''}
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

      // Usa o email do cliente como email de acesso ao portal
      if (data.portalSenha && data.email) data.portalEmail = data.email;
      if (cliente?.portalEmail && data.email) data.portalEmail = data.email; // sincroniza se email mudou

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

    const mostrarMiniMapa = async (la, lo, label) => {
      mapaDiv.style.display = 'block';
      // Carrega Leaflet sob demanda — economiza ~160 KB em rotas sem mapa.
      if (typeof L === 'undefined' && window.RhinoLazy) await window.RhinoLazy.ensure('leaflet');
      if (typeof L === 'undefined') return;
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

          // FIX P0-2: escapa retorno do Nominatim (terceiro, não confiável) antes
          // de inserir em innerHTML. Sem isso, um resultado com `<img onerror=...>`
          // resulta em XSS no contexto autenticado da aplicação.
          dropdown.innerHTML = results.map(r => {
            const name   = r.display_name.split(',').slice(0, 3).join(',');
            const detail = r.display_name.split(',').slice(3).join(',').trim();
            return `<div class="nominatim-item" data-lat="${window.escapeHtml(r.lat)}" data-lng="${window.escapeHtml(r.lon)}" data-name="${window.escapeHtml(r.display_name)}">
              <strong>${window.escapeHtml(name)}</strong><span>${window.escapeHtml(detail)}</span>
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

    const _onDocClick = e => {
      if (!document.getElementById('enderecoWrap')?.contains(e.target))
        dropdown.style.display = 'none';
    };
    document.addEventListener('click', _onDocClick);
    window.viewLifecycle && window.viewLifecycle.onCleanup(() => document.removeEventListener('click', _onDocClick));
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
