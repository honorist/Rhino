/* Rhino · ContratoDetail · modais
   Extraído de js/views/ContratoDetail.js (linhas 4775-5049)
   Estende o objeto window.ContratoDetail já definido. */
(function () {
  if (!window.ContratoDetail) { console.error('[contrato/modais] requires ContratoDetail core'); return; }
  Object.assign(window.ContratoDetail, {
  showModalEditarDados(contract) {
    const html = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal" style="width: 680px; max-height: 90vh; display: flex; flex-direction: column;">
          <div class="modal-header" style="flex-shrink: 0;">
            <h2 class="modal-title">Editar Dados do Contrato</h2>
            <button class="modal-close">✕</button>
          </div>
          <form id="formEditarDados" class="modal-content" style="flex: 1; overflow-y: auto; padding-right: 4px;">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Número do Contrato</label>
                <input class="form-control" name="contractNumber" value="${contract.contractNumber || ''}">
              </div>
              <div class="form-group">
                <label class="form-label">Status *</label>
                <select class="form-control" name="status" required>
                  <option value="prospeccao" ${contract.status === 'prospeccao' ? 'selected' : ''}>Prospecção</option>
                  <option value="ativo" ${contract.status === 'ativo' ? 'selected' : ''}>Ativo</option>
                  <option value="pausado" ${contract.status === 'pausado' ? 'selected' : ''}>Pausado</option>
                  <option value="concluido" ${contract.status === 'concluido' ? 'selected' : ''}>Concluído</option>
                  <option value="cancelado" ${contract.status === 'cancelado' ? 'selected' : ''}>Cancelado</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Nome do Contrato *</label>
              <input class="form-control" name="name" value="${escapeHtml(contract.name)}" required>
            </div>

            <div style="border-top: 1px solid var(--color-border); padding-top: var(--sp-lg); margin-top: var(--sp-lg);">
              <h3 class="card-title mb-md">Dados do Cliente</h3>
              <div class="form-group">
                <label class="form-label">Cliente *</label>
                <select class="form-control" id="selectClienteDetail" name="clientId" required>
                  <option value="">Selecione um cliente...</option>
                  ${Store.state.clientes.map(c => {
                    const selected = (contract.clientId && contract.clientId === c.id) ||
                                     (!contract.clientId && contract.client === c.nome);
                    return `<option value="${c.id}" ${selected ? 'selected' : ''}>${escapeHtml(c.nome)}${c.empresa ? ' — ' + escapeHtml(c.empresa) : ''}</option>`;
                  }).join('')}
                  <option value="__outro__" ${!contract.clientId && contract.client && !Store.state.clientes.find(c => c.nome === contract.client) ? 'selected' : ''}>Outro (digitar manualmente)</option>
                </select>
              </div>
              <div class="form-group" id="clienteManualWrapDetail" style="${!contract.clientId && contract.client && !Store.state.clientes.find(c => c.nome === contract.client) ? '' : 'display:none;'}">
                <label class="form-label">Nome/Razão Social *</label>
                <input class="form-control" id="clienteManualDetail" name="client" value="${escapeHtml(contract.client || '')}">
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">CPF/CNPJ</label>
                  <input class="form-control" name="clientDocument" value="${escapeHtml(contract.clientDocument || '')}">
                </div>
                <div class="form-group">
                  <label class="form-label">Email</label>
                  <input class="form-control" name="clientEmail" type="email" value="${escapeHtml(contract.clientEmail || '')}">
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Telefone</label>
                  <input class="form-control" name="clientPhone" value="${escapeHtml(contract.clientPhone || '')}">
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Endereço/Local da Obra</label>
                <div style="position:relative;" id="enderecoWrapDetail">
                  <input class="form-control" id="enderecoInputDetail" name="endereco"
                    value="${escapeHtml(contract.endereco || contract.clientAddress || '')}"
                    placeholder="Buscar endereço no mapa..."
                    autocomplete="off"
                    style="padding-right:36px;">
                  <span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:16px;pointer-events:none;">📍</span>
                  <div id="nominatimDropdownDetail" class="nominatim-dropdown" style="display:none;top:calc(100% + 4px);left:0;"></div>
                </div>
                <input type="hidden" id="enderecoLatDetail" name="lat" value="${contract.lat || ''}">
                <input type="hidden" id="enderecoLngDetail" name="lng" value="${contract.lng || ''}">
                <div id="miniMapaDetail" style="height:160px;border-radius:6px;margin-top:8px;overflow:hidden;border:1px solid var(--color-border);${contract.lat ? '' : 'display:none;'}"></div>
              </div>
            </div>

            <div style="border-top: 1px solid var(--color-border); padding-top: var(--sp-lg); margin-top: var(--sp-lg);">
              <h3 class="card-title mb-md">Dados do Contrato</h3>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Valor Total (BRL) *</label>
                  <input class="form-control" name="value" type="text" data-currency inputmode="numeric" value="${window.BRLInput.toDisplay(contract.value)}" placeholder="0,00" required>
                </div>
                <div class="form-group">
                  <label class="form-label">Moeda/Referência</label>
                  <input class="form-control" name="currency" value="${contract.currency || 'BRL'}" placeholder="BRL">
                </div>
              </div>
              <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap: var(--sp-lg); align-items: start;">
                <div class="form-group" style="margin-bottom: 0;">
                  <label class="form-label">Data de Início</label>
                  <input class="form-control" name="startDate" type="date" value="${contract.startDate}">
                </div>
                <div class="form-group" style="margin-bottom: 0;">
                  <label class="form-label">Data de Término</label>
                  <input class="form-control" name="endDate" type="date" value="${contract.endDate}">
                </div>
                <div class="form-group" style="margin-bottom: 0;">
                  <label class="form-label">Data de Tendência</label>
                  <input class="form-control" name="tendencyDate" type="date" value="${contract.tendencyDate || ''}">
                </div>
              </div>
              <div class="form-helper" style="margin-top: 6px;">💡 <strong>Tendência</strong> é a previsão atualizada do fim da obra. Se maior que o Término contratual, o RDO marca "Atraso de X dias".</div>
            </div>

            <div style="border-top: 1px solid var(--color-border); padding-top: var(--sp-lg); margin-top: var(--sp-lg);">
              <div class="form-group">
                <label class="form-label">Notas/Observações</label>
                <textarea class="form-control" name="notes" style="min-height: 80px;">${contract.notes || ''}</textarea>
              </div>
            </div>
          </form>
          <div class="modal-footer" style="flex-shrink: 0; border-top: 1px solid var(--color-border); background: var(--color-surface);">
            <button class="btn btn-secondary" id="btnCancelar">Cancelar</button>
            <button class="btn btn-primary" id="btnSalvarDados">Salvar Alterações</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

    const overlay = document.getElementById('modalOverlay');
    const closeModal = () => {
      if (this._miniMapDetail) { this._miniMapDetail.remove(); this._miniMapDetail = null; }
      overlay.remove();
    };

    overlay.querySelector('.modal-close').addEventListener('click', closeModal);
    document.getElementById('btnCancelar').addEventListener('click', closeModal);

    // Cliente select logic
    const selectCliente = document.getElementById('selectClienteDetail');
    const manualWrap = document.getElementById('clienteManualWrapDetail');
    const manualInput = document.getElementById('clienteManualDetail');

    const preencherEnderecoDoCliente = (clienteId) => {
      const endInput = document.getElementById('enderecoInputDetail');
      const latInput = document.getElementById('enderecoLatDetail');
      const lngInput = document.getElementById('enderecoLngDetail');
      if (!endInput || endInput.value.trim()) return;
      const cl = Store.state.clientes.find(c => c.id === clienteId);
      if (cl && cl.endereco) {
        endInput.value = cl.endereco;
        latInput.value = cl.lat || '';
        lngInput.value = cl.lng || '';
        if (cl.lat && cl.lng) this._mostrarMiniMapaDetail(parseFloat(cl.lat), parseFloat(cl.lng), cl.endereco);
      }
    };

    selectCliente.addEventListener('change', () => {
      const val = selectCliente.value;
      if (val === '__outro__') {
        manualWrap.style.display = '';
        manualInput.required = true;
      } else {
        manualWrap.style.display = 'none';
        manualInput.required = false;
        preencherEnderecoDoCliente(val);
      }
    });

    this._initEnderecoSearchDetail(
      contract.lat || '',
      contract.lng || '',
      contract.endereco || contract.clientAddress || ''
    );

    document.getElementById('btnSalvarDados').addEventListener('click', async () => {
      const formData = new FormData(document.getElementById('formEditarDados'));
      const data = Object.fromEntries(formData);
      data.value = window.BRLInput.parse(data.value);

      // Resolve client name from select
      const clientId = data.clientId;
      if (clientId && clientId !== '__outro__') {
        const cl = Store.state.clientes.find(c => c.id === clientId);
        if (cl) data.client = cl.nome;
      } else if (clientId === '__outro__') {
        data.clientId = '';
      }
      if (!data.client || !data.client.trim()) { window.showToast('Cliente é obrigatório', 'error'); return; }

      try {
        await Store.updateContract(contract.id, data);
        window.showToast('Contrato atualizado com sucesso', 'success');
        closeModal();
        this.render({ id: contract.id });
      } catch (e) {
        window.showToast(e.message, 'error');
      }
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
  },

  _miniMapDetail: null,

  _mostrarMiniMapaDetail(la, lo, label) {
    const mapaDiv = document.getElementById('miniMapaDetail');
    if (!mapaDiv) return;
    mapaDiv.style.display = 'block';
    setTimeout(() => {
      if (this._miniMapDetail) { this._miniMapDetail.remove(); this._miniMapDetail = null; }
      this._miniMapDetail = L.map(mapaDiv, { zoomControl: true, scrollWheelZoom: false })
        .setView([la, lo], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
      }).addTo(this._miniMapDetail);
      L.marker([la, lo]).addTo(this._miniMapDetail).bindPopup(label).openPopup();
    }, 50);
  },

  _initEnderecoSearchDetail(lat, lng, enderecoSalvo) {
    const input    = document.getElementById('enderecoInputDetail');
    const dropdown = document.getElementById('nominatimDropdownDetail');
    const latInput = document.getElementById('enderecoLatDetail');
    const lngInput = document.getElementById('enderecoLngDetail');
    if (!input) return;

    if (lat && lng) this._mostrarMiniMapaDetail(parseFloat(lat), parseFloat(lng), enderecoSalvo || 'Local');

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
              this._mostrarMiniMapaDetail(la, lo, nome);
            });
          });
        } catch { dropdown.style.display = 'none'; }
      }, 450);
    });

    document.addEventListener('click', e => {
      if (!document.getElementById('enderecoWrapDetail')?.contains(e.target))
        dropdown.style.display = 'none';
    });
  },

  });
})();
