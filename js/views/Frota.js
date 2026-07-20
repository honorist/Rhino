// Frota / Veículos — pool global com filtro por contrato.
// Plano de manutenção combina KM e meses (alerta o que vencer primeiro).
// Distância até obras via Haversine (linha reta) com opção de OSRM (rota real).
window.Frota = {
  busca: '',
  filtroStatus: '',
  filtroContrato: '',
  // Paginação (UIKit.paginate) — ver test/paginacao.test.js.
  _page: 1,
  _pageSize: 25,

  TIPOS: ['carro', 'caminhao', 'van', 'moto', 'equipamento', 'outro'],

  // ── Placa: padrão antigo (ABC-1234) e Mercosul (ABC1D23) ──
  // Normaliza removendo tudo que não é alfanumérico e botando maiúsculo.
  _normalizarPlaca(s) {
    return (s || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 7);
  },
  // Aplica máscara conforme detecta o padrão (após 4 dígitos = antigo; com letra na 5ª = Mercosul).
  _formatPlaca(s) {
    const limpa = this._normalizarPlaca(s);
    if (limpa.length <= 3) return limpa;
    // Posição 4: dígito = padrão antigo (ABC-1234) | letra = inválido transitório
    const c4 = limpa[3];
    if (/[0-9]/.test(c4)) {
      // Padrão antigo: insere hífen entre letras e números
      return limpa.slice(0, 3) + '-' + limpa.slice(3);
    }
    // Mercosul: ABC1D23 → não usa hífen
    return limpa;
  },
  _placaValida(s) {
    const limpa = this._normalizarPlaca(s);
    if (limpa.length !== 7) return false;
    // Antigo: 3 letras + 4 dígitos
    if (/^[A-Z]{3}[0-9]{4}$/.test(limpa)) return true;
    // Mercosul: 3 letras + 1 dígito + 1 letra + 2 dígitos
    if (/^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(limpa)) return true;
    return false;
  },

  // Calcula a manutenção mais próxima do vencimento.
  // Retorna { plano, status, kmRestante, diasRestante, label } ou null se não há plano ativo.
  _proximaManut(v) {
    const planos = (v.planos || []).filter((p) => p.ativo !== false);
    if (!planos.length) return null;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const km = parseInt(v.kmAtual) || 0;

    let melhor = null;
    for (const p of planos) {
      let kmRest = null,
        diasRest = null;
      if (p.intervaloKm && p.ultimoKm != null)
        kmRest = parseInt(p.ultimoKm) + parseInt(p.intervaloKm) - km;
      else if (p.intervaloKm && p.ultimoKm == null) kmRest = parseInt(p.intervaloKm); // ainda não fez nenhuma vez
      if (p.intervaloMeses && p.ultimaData) {
        const ult = new Date(p.ultimaData + 'T12:00:00');
        const venc = new Date(ult);
        venc.setMonth(venc.getMonth() + parseInt(p.intervaloMeses));
        diasRest = Math.ceil((venc - hoje) / 86400000);
      } else if (p.intervaloMeses && !p.ultimaData) {
        diasRest = parseInt(p.intervaloMeses) * 30;
      }
      // Score: o "mais urgente" = menor entre os critérios disponíveis (negativo = vencido)
      const candidatos = [];
      if (kmRest !== null) candidatos.push({ tipo: 'km', valor: kmRest, urgencia: kmRest });
      if (diasRest !== null) candidatos.push({ tipo: 'data', valor: diasRest, urgencia: diasRest });
      if (!candidatos.length) continue;
      const mais = candidatos.reduce((a, b) => (a.urgencia <= b.urgencia ? a : b));
      const score = mais.urgencia;
      if (!melhor || score < melhor.score) melhor = { plano: p, kmRest, diasRest, score };
    }
    if (!melhor) return null;
    let status = 'vigente';
    const venc =
      (melhor.kmRest !== null && melhor.kmRest <= 0) ||
      (melhor.diasRest !== null && melhor.diasRest <= 0);
    const proximo =
      (melhor.kmRest !== null && melhor.kmRest <= 500) ||
      (melhor.diasRest !== null && melhor.diasRest <= 30);
    if (venc) status = 'vencido';
    else if (proximo) status = 'proximo';
    let label = melhor.plano.descricao;
    if (melhor.kmRest !== null)
      label += ` · ${melhor.kmRest >= 0 ? 'em' : 'venceu há'} ${Math.abs(melhor.kmRest)} km`;
    if (melhor.diasRest !== null)
      label += ` · ${melhor.diasRest >= 0 ? 'em' : 'venceu há'} ${Math.abs(melhor.diasRest)} dias`;
    return { ...melhor, status, label };
  },

  _badgeManut(prox) {
    if (!prox)
      return `<span class="badge" style="background:#F3F4F6;color:#6B7280;font-size:12px;padding:2px 8px;border-radius:10px;">sem plano</span>`;
    const cfg = {
      vigente: { bg: '#D1FAE5', color: '#065F46', label: '✓ vigente' },
      proximo: { bg: '#FEF3C7', color: '#92400E', label: '⚠ próximo' },
      vencido: { bg: '#FEE2E2', color: '#991B1B', label: '✗ vencido' },
    }[prox.status];
    return `<span class="badge" title="${escapeHtml(prox.label)}" style="background:${cfg.bg};color:${cfg.color};font-size:12px;padding:2px 8px;border-radius:10px;font-weight:700;">${cfg.label}</span>`;
  },

  async render() {
    const app = document.getElementById('app');
    if (!this._loaded) {
      app.innerHTML = '<div class="loading-spinner">Carregando frota...</div>';
      try {
        await Store.loadAll();
        this._loaded = true;
      } catch (e) {
        app.innerHTML = `<div class="card"><p class="text-danger">Erro ao carregar: ${escapeHtml(e.message)}</p></div>`;
        return;
      }
    }
    this._draw();
  },

  _draw() {
    const app = document.getElementById('app');
    const todos = Store.state.veiculos || [];
    const contratos = Store.state.contracts || [];

    const termo = (this.busca || '').toLowerCase();
    let lista = todos;
    if (termo)
      lista = lista.filter(
        (v) =>
          (v.placa || '').toLowerCase().includes(termo) ||
          (v.modelo || '').toLowerCase().includes(termo) ||
          (v.marca || '').toLowerCase().includes(termo)
      );
    if (this.filtroStatus) lista = lista.filter((v) => v.status === this.filtroStatus);
    if (this.filtroContrato) lista = lista.filter((v) => v.contractId === this.filtroContrato);

    // Paginação (UIKit.paginate) — antes a tabela recebia a frota filtrada inteira.
    const pagina = window.UIKit.paginate(lista, this._page, this._pageSize);
    this._page = pagina.page; // clamp: o filtro pode ter encolhido a lista

    const proxs = todos.map((v) => this._proximaManut(v));
    const kpiVencidos = proxs.filter((p) => p?.status === 'vencido').length;
    const kpiProximos = proxs.filter((p) => p?.status === 'proximo').length;
    const kpiManut = todos.filter((v) => v.status === 'manutencao').length;

    const filtroAtivo = !!(termo || this.filtroStatus || this.filtroContrato);
    const kpiAtivos = todos.filter((v) => v.status === 'ativo').length;

    const headerHtml = window.UIKit?.pageHeader
      ? window.UIKit.pageHeader({
          title: 'Frota',
          subtitle: filtroAtivo
            ? `${lista.length} de ${todos.length} veículo${todos.length !== 1 ? 's' : ''}`
            : `${todos.length} veículo${todos.length !== 1 ? 's' : ''}`,
          actions:
            '<button class="btn btn-primary btn-lg" id="btnNovoVeic">+ Novo Veículo</button>',
        })
      : `<div class="page-header"><div><h1 class="page-title">Frota</h1></div><button class="btn btn-primary btn-lg" id="btnNovoVeic">+ Novo Veículo</button></div>`;

    const kpisHtml = window.UIKit?.kpiGrid
      ? window.UIKit.kpiGrid([
          { label: 'Total', value: todos.length, color: 'var(--color-primary)' },
          { label: 'Ativos', value: kpiAtivos, color: 'var(--color-success)' },
          { label: 'Em manutenção', value: kpiManut, color: 'var(--color-warning)' },
          {
            label: 'Manut. vencidas',
            value: kpiVencidos,
            color: 'var(--color-danger)',
            hint: kpiProximos ? `+${kpiProximos} próximas` : 'tudo em dia',
          },
        ])
      : '';

    const toolbarHtml = window.UIKit?.toolbar
      ? window.UIKit.toolbar({
          search: {
            id: 'inpBusca',
            value: this.busca,
            label: 'Buscar',
            placeholder: 'Placa, modelo ou marca...',
          },
          selects: [
            {
              id: 'filtroStatus',
              label: 'Status',
              options: [
                { value: '', label: 'Todos status', selected: !this.filtroStatus },
                { value: 'ativo', label: 'Ativos', selected: this.filtroStatus === 'ativo' },
                {
                  value: 'manutencao',
                  label: 'Em manutenção',
                  selected: this.filtroStatus === 'manutencao',
                },
                { value: 'inativo', label: 'Inativos', selected: this.filtroStatus === 'inativo' },
              ],
            },
            {
              id: 'filtroContrato',
              label: 'Contrato',
              options: [
                { value: '', label: `Todos (${contratos.length})`, selected: !this.filtroContrato },
                ...contratos.map((c) => ({
                  value: c.id,
                  label: c.name,
                  selected: this.filtroContrato === c.id,
                })),
              ],
            },
          ],
          showClear: filtroAtivo,
          clearId: 'btnLimparFrota',
        })
      : '';

    // Chips por status
    const chipsHtml = window.UIKit?.chips
      ? window.UIKit.chips(
          [
            { value: '', label: 'Todos', count: todos.length, active: !this.filtroStatus },
            {
              value: 'ativo',
              label: 'Ativos',
              count: kpiAtivos,
              active: this.filtroStatus === 'ativo',
            },
            {
              value: 'manutencao',
              label: 'Em manutenção',
              count: kpiManut,
              active: this.filtroStatus === 'manutencao',
            },
            {
              value: 'inativo',
              label: 'Inativos',
              count: todos.filter((v) => v.status === 'inativo').length,
              active: this.filtroStatus === 'inativo',
            },
          ],
          { name: 'frota-status', inCard: true }
        )
      : '';

    const html = `
      ${headerHtml}
      ${kpisHtml}
      ${toolbarHtml}

      <div class="card">
        ${chipsHtml}
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Placa</th>
                <th scope="col">Veículo</th>
                <th scope="col">Contrato</th>
                <th scope="col">Próx. manutenção</th>
                <th scope="col">Localização</th>
                <th scope="col">Status</th>
                <th scope="col">Ações</th>
              </tr>
            </thead>
            <tbody>
              ${
                lista.length === 0
                  ? `
                <tr><td colspan="7" style="padding:0;">${
                  window.UIKit?.empty
                    ? window.UIKit.empty({
                        icon: window.rhIcon('truck', 40),
                        title: 'Nenhum veículo cadastrado',
                        desc: 'Comece registrando os veículos da frota — carros, caminhões, máquinas. Você poderá acompanhar abastecimentos, manutenções e custos por veículo.',
                        cta: '<button class="btn btn-primary" onclick="document.getElementById(\'btnNovoVeic\')?.click()">+ Cadastrar primeiro veículo</button>',
                      })
                    : '<div class="text-center text-muted" style="padding:var(--sp-xl);">Nenhum veículo cadastrado</div>'
                }</td></tr>
              `
                  : pagina.slice
                      .map((v) => {
                        const c = contratos.find((x) => x.id === v.contractId);
                        const prox = this._proximaManut(v);
                        const cidade = (v.endereco || '').split(',').slice(0, 2).join(', ').trim();
                        return `
                <tr data-id="${v.id}">
                  <td><strong>${escapeHtml(v.placa || '—')}</strong></td>
                  <td>${escapeHtml((v.marca || '') + ' ' + (v.modelo || '')).trim() || '—'}<div style="font-size:12px;color:var(--color-text-muted);">${escapeHtml(v.tipo || '')}${v.ano ? ' · ' + v.ano : ''}</div></td>
                  <td>${c ? escapeHtml(c.name) : '<span class="text-muted">—</span>'}</td>
                  <td>${this._badgeManut(prox)}<div style="font-size:11px;color:var(--color-text-muted);">${prox ? escapeHtml(prox.plano.descricao) : ''}</div></td>
                  <td style="font-size:13px;">${cidade ? escapeHtml(cidade) : '<span class="text-muted">—</span>'}</td>
                  <td>${
                    window.UIKit?.statusPill
                      ? v.status === 'manutencao'
                        ? window.UIKit.statusPill('pausado', '🔧 Manutenção')
                        : v.status === 'inativo'
                          ? window.UIKit.statusPill('cancelado', '⏸ Inativo')
                          : window.UIKit.statusPill('ativo')
                      : v.status === 'manutencao'
                        ? '🔧 Manut.'
                        : v.status === 'inativo'
                          ? '⏸ Inativo'
                          : '✓ Ativo'
                  }</td>
                  <td>
                    <div class="actions-cell" style="display:flex;gap:6px;flex-wrap:wrap;">
                      <button type="button" class="action-link btn-plano" data-id="${v.id}">Plano</button>
                      <button type="button" class="action-link btn-historico" data-id="${v.id}">Manutenção</button>
                      <button type="button" class="action-link btn-abastec" data-id="${v.id}">Abastecimento</button>
                      <button type="button" class="action-link btn-editar" data-id="${v.id}">Editar</button>
                      <button type="button" class="action-link btn-distancia" data-id="${v.id}">Distâncias</button>
                      <button type="button" class="action-link danger btn-excluir" data-id="${v.id}">Excluir</button>
                    </div>
                  </td>
                </tr>`;
                      })
                      .join('')
              }
            </tbody>
          </table>
        </div>
        ${window.UIKit.pagination(pagina, { label: 'veículos' })}
      </div>
    `;

    app.innerHTML = html;

    window.UIKit.wirePagination(app, pagina, ({ page, pageSize }) => {
      this._page = page;
      this._pageSize = pageSize;
      this._draw();
    });

    document.getElementById('btnNovoVeic').addEventListener('click', () => this.showModal());
    // Toda mudança de filtro/busca volta para a página 1: senão o usuário filtra
    // estando na página 5 e cai numa tela vazia.
    document.getElementById('inpBusca').addEventListener('input', (e) => {
      this.busca = e.target.value;
      this._page = 1;
      clearTimeout(this._tBusca);
      this._tBusca = setTimeout(() => this._draw(), 200);
    });
    document.getElementById('filtroStatus').addEventListener('change', (e) => {
      this.filtroStatus = e.target.value;
      this._page = 1;
      this._draw();
    });
    document.getElementById('filtroContrato').addEventListener('change', (e) => {
      this.filtroContrato = e.target.value;
      this._page = 1;
      this._draw();
    });
    document.getElementById('btnLimparFrota')?.addEventListener('click', () => {
      this.busca = '';
      this.filtroStatus = '';
      this.filtroContrato = '';
      this._page = 1;
      this._draw();
    });
    document.querySelectorAll('[data-chips="frota-status"] .rh-chip').forEach((b) => {
      b.addEventListener('click', () => {
        this.filtroStatus = b.dataset.value || '';
        this._page = 1;
        this._draw();
      });
    });

    document
      .querySelectorAll('.btn-plano')
      .forEach((b) =>
        b.addEventListener('click', (e) => this.showDetalhe(e.target.dataset.id, 'plano'))
      );
    document
      .querySelectorAll('.btn-historico')
      .forEach((b) =>
        b.addEventListener('click', (e) => this.showDetalhe(e.target.dataset.id, 'historico'))
      );
    document
      .querySelectorAll('.btn-abastec')
      .forEach((b) =>
        b.addEventListener('click', (e) => this.showDetalhe(e.target.dataset.id, 'abastecimentos'))
      );
    document
      .querySelectorAll('.btn-editar')
      .forEach((b) => b.addEventListener('click', (e) => this.showModal(e.target.dataset.id)));
    document
      .querySelectorAll('.btn-distancia')
      .forEach((b) => b.addEventListener('click', (e) => this.showDistancias(e.target.dataset.id)));
    document
      .querySelectorAll('.btn-excluir')
      .forEach((b) => b.addEventListener('click', (e) => this.excluir(e.target.dataset.id)));
  },

  showModal(id) {
    const v = id ? (Store.state.veiculos || []).find((x) => x.id === id) : null;
    const contratos = Store.state.contracts || [];

    const html = `
      <div class="modal-overlay" id="modalVeic">
        <div class="modal" style="width:680px;max-width:95vw;">
          <div class="modal-header">
            <h2 class="modal-title">${v ? 'Editar Veículo' : 'Novo Veículo'}</h2>
            <button class="modal-close">✕</button>
          </div>
          <form id="formVeic" class="modal-content">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Placa *</label>
                <input class="form-control" name="placa" id="inpPlaca" required maxlength="8"
                  value="${escapeHtml(v?.placa || '')}" placeholder="ABC-1234 ou ABC1D23"
                  style="text-transform:uppercase;font-family:monospace;letter-spacing:1px;">
                <span style="font-size:12px;color:var(--color-text-muted);">Aceita padrão antigo (ABC-1234) e Mercosul (ABC1D23).</span>
              </div>
              <div class="form-group">
                <label class="form-label">Tipo</label>
                <select class="form-control" name="tipo">
                  ${this.TIPOS.map((t) => `<option value="${t}" ${v?.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Marca</label>
                <input class="form-control" name="marca" value="${escapeHtml(v?.marca || '')}">
              </div>
              <div class="form-group">
                <label class="form-label">Modelo</label>
                <input class="form-control" name="modelo" value="${escapeHtml(v?.modelo || '')}">
              </div>
              <div class="form-group">
                <label class="form-label">Ano</label>
                <input class="form-control" name="ano" type="number" value="${v?.ano || ''}">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">KM atual</label>
                <input class="form-control" name="kmAtual" type="number" min="0" value="${v?.kmAtual || 0}">
              </div>
              <div class="form-group">
                <label class="form-label">Status</label>
                <select class="form-control" name="status">
                  <option value="ativo"      ${v?.status === 'ativo' ? 'selected' : ''}>Ativo</option>
                  <option value="manutencao" ${v?.status === 'manutencao' ? 'selected' : ''}>Em manutenção</option>
                  <option value="inativo"    ${v?.status === 'inativo' ? 'selected' : ''}>Inativo</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Alocado em</label>
                <select class="form-control" name="contractId">
                  <option value="">— Pool (sem alocação) —</option>
                  ${contratos.map((c) => `<option value="${c.id}" ${v?.contractId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Localização atual (endereço)</label>
              <div style="position:relative;" id="enderecoWrap">
                <input class="form-control" id="enderecoInput" name="endereco" autocomplete="off"
                  value="${escapeHtml(v?.endereco || '')}" placeholder="Buscar endereço..." style="padding-right:36px;">
                <span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:16px;pointer-events:none;">📍</span>
                <div id="nominatimDropdown" class="nominatim-dropdown" style="display:none;top:calc(100% + 4px);left:0;"></div>
              </div>
              <input type="hidden" name="lat" id="latInp" value="${v?.lat || ''}">
              <input type="hidden" name="lng" id="lngInp" value="${v?.lng || ''}">
            </div>
            <div class="form-group">
              <label class="form-label">Observações</label>
              <textarea class="form-control" name="observacoes" rows="2">${escapeHtml(v?.observacoes || '')}</textarea>
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCanc">Cancelar</button>
            <button class="btn btn-primary" id="btnSalv">${v ? 'Salvar' : 'Criar'}</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalVeic');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnCanc').addEventListener('click', close);
    this._initEnderecoSearch();

    // Máscara de placa em tempo real (aceita padrão antigo e Mercosul)
    const inpPlaca = document.getElementById('inpPlaca');
    if (inpPlaca) {
      inpPlaca.addEventListener('input', (e) => {
        const formatted = this._formatPlaca(e.target.value);
        if (formatted !== e.target.value) e.target.value = formatted;
      });
    }

    document.getElementById('btnSalv').addEventListener('click', async () => {
      const fd = new FormData(document.getElementById('formVeic'));
      const data = Object.fromEntries(fd);
      data.placa = this._normalizarPlaca(data.placa || '');
      if (!data.placa) {
        window.showToast('Placa obrigatória', 'error');
        return;
      }
      if (!this._placaValida(data.placa)) {
        window.showToast('Placa inválida — use ABC-1234 (antigo) ou ABC1D23 (Mercosul)', 'error');
        return;
      }
      try {
        const url = v ? `/api/veiculos/${v.id}` : '/api/veiculos';
        const method = v ? 'PUT' : 'POST';
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          const _b = await res.text();
          throw new Error(_b && _b.length < 120 ? _b : 'Erro no servidor. Tente novamente.');
        }
        window.showToast(v ? 'Veículo atualizado' : 'Veículo criado', 'success');
        close();
        Store.invalidate();
        this._loaded = false;
        this.render();
      } catch (e) {
        window.showToast(e.message, 'error');
      }
    });
  },

  _initEnderecoSearch() {
    const input = document.getElementById('enderecoInput');
    const drop = document.getElementById('nominatimDropdown');
    const latInp = document.getElementById('latInp');
    const lngInp = document.getElementById('lngInp');
    if (!input) return;
    let tBusca;
    input.addEventListener('input', (e) => {
      const q = e.target.value.trim();
      clearTimeout(tBusca);
      if (q.length < 4) {
        drop.style.display = 'none';
        return;
      }
      tBusca = setTimeout(async () => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&accept-language=pt-BR`
          );
          const arr = await res.json();
          if (!arr.length) {
            drop.style.display = 'none';
            return;
          }
          // FIX P0-2: escapa data-* do Nominatim (já escapava no texto via escapeHtml).
          drop.innerHTML = arr
            .map(
              (r) =>
                `<div class="nominatim-item" data-lat="${window.escapeHtml(r.lat)}" data-lng="${window.escapeHtml(r.lon)}" data-name="${window.escapeHtml(r.display_name)}">${escapeHtml(r.display_name)}</div>`
            )
            .join('');
          drop.style.display = 'block';
          drop.querySelectorAll('.nominatim-item').forEach((el) =>
            el.addEventListener('click', () => {
              input.value = el.dataset.name;
              latInp.value = el.dataset.lat;
              lngInp.value = el.dataset.lng;
              drop.style.display = 'none';
            })
          );
        } catch {}
      }, 350);
    });
    document.addEventListener('click', (e) => {
      if (!document.getElementById('enderecoWrap')?.contains(e.target)) drop.style.display = 'none';
    });
  },

  showDetalhe(id, abaInicial) {
    const v = (Store.state.veiculos || []).find((x) => x.id === id);
    if (!v) return;
    let abaAtual = abaInicial || 'plano';

    const draw = () => {
      const planos = v.planos || [];
      const manuts = v.manutencoes || [];
      const planosHtml =
        planos.length === 0
          ? `<p class="text-muted" style="text-align:center;padding:var(--sp-lg);">Nenhum plano cadastrado</p>`
          : planos
              .map(
                (p) => `
          <tr>
            <td><strong>${escapeHtml(p.descricao)}</strong></td>
            <td>${p.intervaloKm ? p.intervaloKm.toLocaleString('pt-BR') + ' km' : '—'}</td>
            <td>${p.intervaloMeses ? p.intervaloMeses + ' meses' : '—'}</td>
            <td>${p.ultimoKm ? p.ultimoKm.toLocaleString('pt-BR') + ' km' : '—'}</td>
            <td>${p.ultimaData ? new Date(p.ultimaData + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td>
            <td><button type="button" class="action-link btn-edit-plano" data-id="${p.id}">Editar</button> · <button type="button" class="action-link danger btn-del-plano" data-id="${p.id}">×</button></td>
          </tr>
        `
              )
              .join('');

      const manutsHtml =
        manuts.length === 0
          ? `<p class="text-muted" style="text-align:center;padding:var(--sp-lg);">Nenhuma manutenção registrada</p>`
          : manuts
              .map((m) => {
                const plano = planos.find((p) => p.id === m.planoId);
                return `
          <tr>
            <td>${m.data ? new Date(m.data + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td>
            <td>${escapeHtml(m.tipo || '—')}</td>
            <td>${escapeHtml(m.descricao || (plano ? plano.descricao : ''))}</td>
            <td>${m.km ? m.km.toLocaleString('pt-BR') + ' km' : '—'}</td>
            <td>${m.custo ? Store.formatBRL(m.custo) : '—'}</td>
            <td><button type="button" class="action-link danger btn-del-manut" data-id="${m.id}">×</button></td>
          </tr>
        `;
              })
              .join('');

      const abastecs = v.abastecimentos || [];
      const totalAbastecGasto = abastecs.reduce((s, a) => s + (parseFloat(a.valorTotal) || 0), 0);
      const totalAbastecLitros = abastecs.reduce((s, a) => s + (parseFloat(a.litros) || 0), 0);
      // km rodado: diferença entre maior e menor km registrado nos abastecimentos
      const kmsAbastec = abastecs
        .map((a) => parseInt(a.km))
        .filter((k) => k > 0)
        .sort((a, b) => a - b);
      const kmRodado =
        kmsAbastec.length >= 2 ? kmsAbastec[kmsAbastec.length - 1] - kmsAbastec[0] : 0;
      const mediaConsumo =
        kmRodado > 0 && totalAbastecLitros > 0 ? (kmRodado / totalAbastecLitros).toFixed(2) : null;
      const contratos = Store.state.contracts || [];

      const abastecHtml =
        abastecs.length === 0
          ? `<p class="text-muted" style="text-align:center;padding:var(--sp-lg);">Nenhum abastecimento registrado</p>`
          : abastecs
              .map((a) => {
                const vlLitro =
                  a.valorTotal && a.litros
                    ? (parseFloat(a.valorTotal) / parseFloat(a.litros)).toFixed(3)
                    : '—';
                const ct = contratos.find((c) => c.id === a.contractId);
                return `<tr>
            <td>${a.data ? new Date(a.data + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td>
            <td>${a.km ? a.km.toLocaleString('pt-BR') + ' km' : '—'}</td>
            <td>${parseFloat(a.litros).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L</td>
            <td>R$ ${vlLitro}</td>
            <td>${a.valorTotal ? Store.formatBRL(a.valorTotal) : '—'}</td>
            <td>${escapeHtml(a.tipoCombustivel || '—')}</td>
            <td style="font-size:12px;">${ct ? escapeHtml(ct.name) : '<span class="text-muted">—</span>'}</td>
            <td><button type="button" class="action-link danger btn-del-abastec" data-id="${a.id}">×</button></td>
          </tr>`;
              })
              .join('');

      const tabBtn = (k, l) =>
        `<button class="ctd-tab ${abaAtual === k ? 'active' : ''}" data-tab="${k}">${l}</button>`;

      const conteudo =
        abaAtual === 'plano'
          ? `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--sp-sm);">
          <h3 style="margin:0;font-size:15px;">Plano de Manutenção</h3>
          <button class="btn btn-sm btn-primary" id="btnAddPlano">+ Adicionar plano</button>
        </div>
        <table style="width:100%;font-size:13px;">
          <thead><tr style="background:var(--color-surface-2);"><th scope="col" style="padding:8px;text-align:left;">Item</th><th scope="col" style="padding:8px;">Intervalo KM</th><th scope="col" style="padding:8px;">Intervalo</th><th scope="col" style="padding:8px;">Último KM</th><th scope="col" style="padding:8px;">Última data</th><th scope="col" style="padding:8px;width:90px;"></th></tr></thead>
          <tbody>${planosHtml}</tbody>
        </table>
      `
          : abaAtual === 'historico'
            ? `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--sp-sm);">
          <h3 style="margin:0;font-size:15px;">Histórico de Manutenções</h3>
          <button class="btn btn-sm btn-primary" id="btnAddManut">+ Registrar manutenção</button>
        </div>
        <table style="width:100%;font-size:13px;">
          <thead><tr style="background:var(--color-surface-2);"><th scope="col" style="padding:8px;">Data</th><th scope="col" style="padding:8px;">Tipo</th><th scope="col" style="padding:8px;text-align:left;">Descrição</th><th scope="col" style="padding:8px;">KM</th><th scope="col" style="padding:8px;">Custo</th><th scope="col" style="padding:8px;width:30px;"></th></tr></thead>
          <tbody>${manutsHtml}</tbody>
        </table>
      `
            : abaAtual === 'abastecimentos'
              ? `
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:var(--sp-sm);margin-bottom:var(--sp-md);">
          <div style="background:var(--color-surface-2);border-radius:8px;padding:var(--sp-sm) var(--sp-md);">
            <div style="font-size:11px;color:var(--color-text-muted);text-transform:uppercase;font-weight:700;">Total gasto</div>
            <div style="font-size:20px;font-weight:800;">${Store.formatBRL(totalAbastecGasto)}</div>
          </div>
          <div style="background:var(--color-surface-2);border-radius:8px;padding:var(--sp-sm) var(--sp-md);">
            <div style="font-size:11px;color:var(--color-text-muted);text-transform:uppercase;font-weight:700;">KM rodado (registros)</div>
            <div style="font-size:20px;font-weight:800;">${kmRodado > 0 ? kmRodado.toLocaleString('pt-BR') + ' km' : '—'}</div>
          </div>
          <div style="background:var(--color-surface-2);border-radius:8px;padding:var(--sp-sm) var(--sp-md);">
            <div style="font-size:11px;color:var(--color-text-muted);text-transform:uppercase;font-weight:700;">Média consumo</div>
            <div style="font-size:20px;font-weight:800;">${mediaConsumo ? mediaConsumo + ' km/L' : '—'}</div>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--sp-sm);">
          <h3 style="margin:0;font-size:15px;">Histórico de Abastecimentos</h3>
          <button class="btn btn-sm btn-primary" id="btnAddAbastec">+ Registrar abastecimento</button>
        </div>
        <div class="table-wrap">
          <table style="width:100%;font-size:13px;">
            <thead><tr style="background:var(--color-surface-2);">
              <th scope="col" style="padding:8px;">Data</th>
              <th scope="col" style="padding:8px;">KM</th>
              <th scope="col" style="padding:8px;">Litros</th>
              <th scope="col" style="padding:8px;">R$/L</th>
              <th scope="col" style="padding:8px;">Total</th>
              <th scope="col" style="padding:8px;">Combustível</th>
              <th scope="col" style="padding:8px;text-align:left;">Contrato</th>
              <th scope="col" style="padding:8px;width:30px;"></th>
            </tr></thead>
            <tbody>${abastecHtml}</tbody>
          </table>
        </div>
      `
              : '';

      return `
        <div class="modal-overlay" id="modalDetVeic">
          <div class="modal" style="width:780px;max-width:95vw;max-height:90vh;overflow-y:auto;">
            <div class="modal-header">
              <div>
                <h2 class="modal-title">${escapeHtml(v.placa)} · ${escapeHtml((v.marca || '') + ' ' + (v.modelo || ''))}</h2>
                <div style="font-size:13px;color:var(--color-text-muted);">${(v.kmAtual || 0).toLocaleString('pt-BR')} km · ${escapeHtml(v.status)}</div>
              </div>
              <button class="modal-close">✕</button>
            </div>
            <div class="modal-content">
              <div class="ctd-tabs" style="margin-bottom:var(--sp-md);">
                ${tabBtn('plano', 'Plano de Manutenção')}
                ${tabBtn('historico', 'Histórico')}
                ${tabBtn('abastecimentos', 'Abastecimentos')}
              </div>
              ${conteudo}
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" id="btnFecharDet">Fechar</button>
            </div>
          </div>
        </div>
      `;
    };

    const renderModal = () => {
      const old = document.getElementById('modalDetVeic');
      if (old) old.remove();
      document.body.insertAdjacentHTML('beforeend', draw());

      const overlay = document.getElementById('modalDetVeic');
      const close = () => overlay.remove();
      overlay.querySelector('.modal-close').addEventListener('click', close);
      document.getElementById('btnFecharDet').addEventListener('click', close);
      overlay.querySelectorAll('.ctd-tab').forEach((t) =>
        t.addEventListener('click', () => {
          abaAtual = t.dataset.tab;
          renderModal();
        })
      );

      const btnAddPlano = document.getElementById('btnAddPlano');
      if (btnAddPlano)
        btnAddPlano.addEventListener('click', () =>
          this.showModalPlano(v.id, null, () => {
            this._reloadAndKeepDetalhe(v.id, abaAtual);
          })
        );
      overlay
        .querySelectorAll('.btn-edit-plano')
        .forEach((b) =>
          b.addEventListener('click', (e) =>
            this.showModalPlano(v.id, e.target.dataset.id, () =>
              this._reloadAndKeepDetalhe(v.id, abaAtual)
            )
          )
        );
      overlay
        .querySelectorAll('.btn-del-plano')
        .forEach((b) =>
          b.addEventListener('click', (e) =>
            this.deletePlano(v.id, e.target.dataset.id, () =>
              this._reloadAndKeepDetalhe(v.id, abaAtual)
            )
          )
        );

      const btnAddManut = document.getElementById('btnAddManut');
      if (btnAddManut)
        btnAddManut.addEventListener('click', () =>
          this.showModalManut(v.id, () => this._reloadAndKeepDetalhe(v.id, abaAtual))
        );
      overlay
        .querySelectorAll('.btn-del-manut')
        .forEach((b) =>
          b.addEventListener('click', (e) =>
            this.deleteManut(v.id, e.target.dataset.id, () =>
              this._reloadAndKeepDetalhe(v.id, abaAtual)
            )
          )
        );

      const btnAddAbastec = document.getElementById('btnAddAbastec');
      if (btnAddAbastec)
        btnAddAbastec.addEventListener('click', () =>
          this.showModalAbastecimento(v.id, () => this._reloadAndKeepDetalhe(v.id, abaAtual))
        );
      overlay
        .querySelectorAll('.btn-del-abastec')
        .forEach((b) =>
          b.addEventListener('click', (e) =>
            this.deleteAbastecimento(v.id, e.target.dataset.id, () =>
              this._reloadAndKeepDetalhe(v.id, abaAtual)
            )
          )
        );
    };

    renderModal();
  },

  async _reloadAndKeepDetalhe(veiculoId, aba) {
    Store.invalidate();
    await Store.loadAll();
    const old = document.getElementById('modalDetVeic');
    if (old) old.remove();
    this._draw();
    this.showDetalhe(veiculoId);
  },

  showModalPlano(veiculoId, planoId, onDone) {
    const v = (Store.state.veiculos || []).find((x) => x.id === veiculoId);
    const p = planoId ? (v?.planos || []).find((x) => x.id === planoId) : null;
    const html = `
      <div class="modal-overlay" id="modalPlano" style="z-index:10000;">
        <div class="modal" style="width:520px;">
          <div class="modal-header"><h2 class="modal-title">${p ? 'Editar plano' : 'Novo plano'}</h2><button class="modal-close">✕</button></div>
          <form id="formPlano" class="modal-content">
            <div class="form-group">
              <label class="form-label">Descrição *</label>
              <input class="form-control" name="descricao" required value="${escapeHtml(p?.descricao || '')}" placeholder="Ex: Troca de óleo">
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Intervalo KM</label>
                <input class="form-control" name="intervaloKm" type="number" value="${p?.intervaloKm || ''}" placeholder="Ex: 10000">
              </div>
              <div class="form-group">
                <label class="form-label">Intervalo (meses)</label>
                <input class="form-control" name="intervaloMeses" type="number" value="${p?.intervaloMeses || ''}" placeholder="Ex: 6">
              </div>
            </div>
            <p style="font-size:12px;color:var(--color-text-muted);">Informe pelo menos um dos dois — sistema alerta o que vencer primeiro.</p>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Último KM (última execução)</label>
                <input class="form-control" name="ultimoKm" type="number" value="${p?.ultimoKm || ''}">
              </div>
              <div class="form-group">
                <label class="form-label">Última data</label>
                <input class="form-control" name="ultimaData" type="date" value="${p?.ultimaData || ''}">
              </div>
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancPlano">Cancelar</button>
            <button class="btn btn-primary" id="btnSalvPlano">${p ? 'Salvar' : 'Criar'}</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalPlano');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnCancPlano').addEventListener('click', close);

    document.getElementById('btnSalvPlano').addEventListener('click', async () => {
      const fd = new FormData(document.getElementById('formPlano'));
      const data = Object.fromEntries(fd);
      if (!data.descricao) {
        window.showToast('Descrição obrigatória', 'error');
        return;
      }
      if (!data.intervaloKm && !data.intervaloMeses) {
        window.showToast('Informe pelo menos KM ou meses', 'error');
        return;
      }
      try {
        const url = p
          ? `/api/veiculos/${veiculoId}/planos/${p.id}`
          : `/api/veiculos/${veiculoId}/planos`;
        const method = p ? 'PUT' : 'POST';
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          const _b = await res.text();
          throw new Error(_b && _b.length < 120 ? _b : 'Erro no servidor. Tente novamente.');
        }
        close();
        if (onDone) onDone();
      } catch (e) {
        window.showToast(e.message, 'error');
      }
    });
  },

  async deletePlano(veiculoId, planoId, onDone) {
    if (!confirm('Excluir este plano?')) return;
    try {
      const res = await fetch(`/api/veiculos/${veiculoId}/planos/${planoId}`, { method: 'DELETE' });
      if (!res.ok) {
        const _b = await res.text();
        throw new Error(_b && _b.length < 120 ? _b : 'Erro no servidor. Tente novamente.');
      }
      if (onDone) onDone();
    } catch (e) {
      window.showToast(e.message, 'error');
    }
  },

  showModalManut(veiculoId, onDone) {
    const v = (Store.state.veiculos || []).find((x) => x.id === veiculoId);
    const planos = v?.planos || [];
    const fornecedores = Store.state.fornecedores || [];
    const hoje = new Date().toISOString().split('T')[0];
    const html = `
      <div class="modal-overlay" id="modalManut" style="z-index:10000;">
        <div class="modal" style="width:560px;">
          <div class="modal-header"><h2 class="modal-title">Registrar manutenção</h2><button class="modal-close">✕</button></div>
          <form id="formManut" class="modal-content">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Data *</label>
                <input class="form-control" name="data" type="date" required value="${hoje}">
              </div>
              <div class="form-group">
                <label class="form-label">Tipo</label>
                <select class="form-control" name="tipo">
                  <option value="preventiva">Preventiva</option>
                  <option value="corretiva">Corretiva</option>
                  <option value="revisao">Revisão</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Plano vinculado</label>
              <select class="form-control" name="planoId">
                <option value="">— Manutenção avulsa —</option>
                ${planos.map((p) => `<option value="${p.id}">${escapeHtml(p.descricao)}</option>`).join('')}
              </select>
              <span style="font-size:12px;color:var(--color-text-muted);">Vincular ao plano atualiza "Último KM/data" automaticamente.</span>
            </div>
            <div class="form-group">
              <label class="form-label">Serviços executados / O que foi feito *</label>
              <textarea class="form-control" name="descricao" rows="5" required
                placeholder="Liste o que foi realizado. Exemplos:&#10;- Troca de óleo do motor (5L) e filtro&#10;- Troca de filtro de ar e cabine&#10;- Alinhamento e balanceamento&#10;- Substituição das pastilhas de freio dianteiras&#10;- Verificação geral / cortesia"></textarea>
              <span style="font-size:12px;color:var(--color-text-muted);">Quanto mais detalhado, melhor para o histórico.</span>
            </div>
            <div class="form-group">
              <label class="form-label">Observações adicionais</label>
              <textarea class="form-control" name="observacoes" rows="2" placeholder="Notas, garantia, próximos pontos de atenção..."></textarea>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">KM no momento</label>
                <input class="form-control" name="km" type="number" value="${v?.kmAtual || ''}">
              </div>
              <div class="form-group">
                <label class="form-label">Custo</label>
                <input class="form-control" name="custo" type="number" step="0.01" value="0">
              </div>
              <div class="form-group">
                <label class="form-label">Fornecedor</label>
                <select class="form-control" name="fornecedorId">
                  <option value="">—</option>
                  ${fornecedores.map((f) => `<option value="${f.id}">${escapeHtml(f.nome || f.razaoSocial)}</option>`).join('')}
                </select>
              </div>
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancM">Cancelar</button>
            <button class="btn btn-primary" id="btnSalvM">Registrar</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalManut');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnCancM').addEventListener('click', close);

    document.getElementById('btnSalvM').addEventListener('click', async () => {
      const fd = new FormData(document.getElementById('formManut'));
      const data = Object.fromEntries(fd);
      try {
        const res = await fetch(`/api/veiculos/${veiculoId}/manutencoes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          const _b = await res.text();
          throw new Error(_b && _b.length < 120 ? _b : 'Erro no servidor. Tente novamente.');
        }
        close();
        if (onDone) onDone();
      } catch (e) {
        window.showToast(e.message, 'error');
      }
    });
  },

  async deleteManut(veiculoId, manId, onDone) {
    if (!confirm('Excluir esta manutenção?')) return;
    try {
      const res = await fetch(`/api/veiculos/${veiculoId}/manutencoes/${manId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const _b = await res.text();
        throw new Error(_b && _b.length < 120 ? _b : 'Erro no servidor. Tente novamente.');
      }
      if (onDone) onDone();
    } catch (e) {
      window.showToast(e.message, 'error');
    }
  },

  showModalAbastecimento(veiculoId, onDone) {
    const v = (Store.state.veiculos || []).find((x) => x.id === veiculoId);
    const fornecedores = Store.state.fornecedores || [];
    const contratos = Store.state.contracts || [];
    const hoje = new Date().toISOString().split('T')[0];
    const html = `
      <div class="modal-overlay" id="modalAbastec" style="z-index:10000;">
        <div class="modal" style="width:560px;">
          <div class="modal-header">
            <h2 class="modal-title">Registrar abastecimento</h2>
            <button class="modal-close">✕</button>
          </div>
          <form id="formAbastec" class="modal-content">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Data *</label>
                <input class="form-control" name="data" type="date" required value="${hoje}">
              </div>
              <div class="form-group">
                <label class="form-label">KM (hodômetro)</label>
                <input class="form-control" name="km" type="number" min="0" value="${v?.kmAtual || ''}">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Litros *</label>
                <input class="form-control" id="inpLitros" name="litros" type="number" step="0.01" min="0.01" required value="">
              </div>
              <div class="form-group">
                <label class="form-label">Valor total (R$)</label>
                <input class="form-control" id="inpValorTotal" name="valorTotal" type="number" step="0.01" min="0" value="">
              </div>
              <div class="form-group">
                <label class="form-label">R$/Litro</label>
                <input class="form-control" id="inpVlLitro" type="number" step="0.001" min="0" placeholder="calculado" readonly style="background:var(--color-surface-2);">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Combustível</label>
                <select class="form-control" name="tipoCombustivel">
                  <option value="">—</option>
                  <option value="gasolina">Gasolina</option>
                  <option value="diesel">Diesel</option>
                  <option value="etanol">Etanol</option>
                  <option value="gnv">GNV</option>
                  <option value="arla">Arla 32</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Fornecedor (posto)</label>
                <select class="form-control" name="fornecedorId">
                  <option value="">—</option>
                  ${fornecedores.map((f) => `<option value="${f.id}">${escapeHtml(f.nome || f.razaoSocial)}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Lançar custo em contrato</label>
              <select class="form-control" name="contractId">
                <option value="">— Não lançar —</option>
                ${contratos.map((c) => `<option value="${c.id}" ${v?.contractId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
              </select>
              <span style="font-size:12px;color:var(--color-text-muted);">Se selecionado, o valor total será lançado no caixa do contrato.</span>
            </div>
            <div class="form-group">
              <label class="form-label">Observações</label>
              <textarea class="form-control" name="observacoes" rows="2" placeholder="Nota fiscal, motorista, posto..."></textarea>
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancAbastec">Cancelar</button>
            <button class="btn btn-primary" id="btnSalvAbastec">Registrar</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalAbastec');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnCancAbastec').addEventListener('click', close);

    // Cálculo automático R$/litro
    const calcVlLitro = () => {
      const l = parseFloat(document.getElementById('inpLitros').value) || 0;
      const t = parseFloat(document.getElementById('inpValorTotal').value) || 0;
      document.getElementById('inpVlLitro').value = l > 0 && t > 0 ? (t / l).toFixed(3) : '';
    };
    document.getElementById('inpLitros').addEventListener('input', calcVlLitro);
    document.getElementById('inpValorTotal').addEventListener('input', calcVlLitro);

    document.getElementById('btnSalvAbastec').addEventListener('click', async () => {
      const fd = new FormData(document.getElementById('formAbastec'));
      const data = Object.fromEntries(fd);
      if (!data.litros || parseFloat(data.litros) <= 0) {
        window.showToast('Informe a quantidade de litros', 'error');
        return;
      }
      try {
        const res = await fetch(`/api/veiculos/${veiculoId}/abastecimentos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          const _b = await res.text();
          throw new Error(_b && _b.length < 120 ? _b : 'Erro no servidor. Tente novamente.');
        }
        window.showToast('Abastecimento registrado', 'success');
        close();
        if (onDone) onDone();
      } catch (e) {
        window.showToast(e.message, 'error');
      }
    });
  },

  async deleteAbastecimento(veiculoId, abastecId, onDone) {
    if (!confirm('Excluir este abastecimento?')) return;
    try {
      const res = await fetch(`/api/veiculos/${veiculoId}/abastecimentos/${abastecId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const _b = await res.text();
        throw new Error(_b && _b.length < 120 ? _b : 'Erro no servidor. Tente novamente.');
      }
      if (onDone) onDone();
    } catch (e) {
      window.showToast(e.message, 'error');
    }
  },

  async showDistancias(veiculoId) {
    // Carrega geo.js sob demanda.
    if (typeof window.GeoUtils === 'undefined' && window.RhinoLazy) {
      await window.RhinoLazy.ensure('geo');
    }
    const v = (Store.state.veiculos || []).find((x) => x.id === veiculoId);
    if (!v) return;
    if (!v.lat || !v.lng) {
      window.showToast('Veículo sem localização cadastrada', 'error');
      return;
    }

    const obras = (Store.state.contracts || []).filter((c) => c.lat && c.lng);
    const lat1 = parseFloat(v.lat),
      lng1 = parseFloat(v.lng);

    const dists = obras
      .map((o) => ({
        obra: o,
        kmReta: window.GeoUtils.haversine(lat1, lng1, parseFloat(o.lat), parseFloat(o.lng)),
      }))
      .sort((a, b) => a.kmReta - b.kmReta);

    const html = `
      <div class="modal-overlay" id="modalDist">
        <div class="modal" style="width:680px;max-width:95vw;max-height:90vh;overflow-y:auto;">
          <div class="modal-header">
            <div>
              <h2 class="modal-title">Distâncias de ${escapeHtml(v.placa)} até as obras</h2>
              <div style="font-size:13px;color:var(--color-text-muted);">A partir de: ${escapeHtml(v.endereco || '—')}</div>
            </div>
            <button class="modal-close">✕</button>
          </div>
          <div class="modal-content">
            ${
              obras.length === 0
                ? '<p class="text-muted">Nenhuma obra com coordenadas cadastradas.</p>'
                : `
              <div style="margin-bottom:var(--sp-sm);">
                <button class="btn btn-sm btn-secondary" id="btnRotaReal">Calcular rotas reais (OSRM)</button>
              </div>
              <table style="width:100%;font-size:14px;">
                <thead><tr style="background:var(--color-surface-2);"><th scope="col" style="padding:8px;text-align:left;">Obra</th><th scope="col" style="padding:8px;text-align:right;">Linha reta</th><th scope="col" style="padding:8px;text-align:right;" class="col-rota">Rota real</th><th scope="col" style="padding:8px;text-align:right;" class="col-tempo">Tempo</th></tr></thead>
                <tbody>
                  ${dists
                    .map(
                      (d) => `
                    <tr data-id="${d.obra.id}">
                      <td style="padding:8px;"><strong>${escapeHtml(d.obra.name)}</strong><div style="font-size:12px;color:var(--color-text-muted);">${escapeHtml((d.obra.endereco || '').split(',').slice(0, 2).join(', '))}</div></td>
                      <td style="padding:8px;text-align:right;">${d.kmReta.toFixed(1)} km</td>
                      <td style="padding:8px;text-align:right;" class="cell-rota">—</td>
                      <td style="padding:8px;text-align:right;" class="cell-tempo">—</td>
                    </tr>`
                    )
                    .join('')}
                </tbody>
              </table>
            `
            }
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnFecharDist">Fechar</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalDist');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnFecharDist').addEventListener('click', close);

    const btn = document.getElementById('btnRotaReal');
    if (btn)
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Calculando...';
        for (const d of dists) {
          let rota = null;
          try {
            rota = await window.GeoUtils.fetchRotaOSRM(
              lat1,
              lng1,
              parseFloat(d.obra.lat),
              parseFloat(d.obra.lng)
            );
          } catch (_err) {
            // rota permanece null; célula mostrará "Rota indisponível"
          }
          const row = overlay.querySelector(`tr[data-id="${d.obra.id}"]`);
          if (row) {
            row.querySelector('.cell-rota').textContent = rota
              ? rota.km.toFixed(1) + ' km'
              : 'Rota indisponível';
            row.querySelector('.cell-tempo').textContent = rota
              ? window.GeoUtils.fmtMin(rota.min)
              : '—';
          }
        }
        btn.textContent = '✓ rotas calculadas';
      });
  },

  async excluir(id) {
    if (!confirm('Excluir este veículo? Histórico de manutenções e plano serão apagados.')) return;
    try {
      const res = await fetch(`/api/veiculos/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const _b = await res.text();
        throw new Error(_b && _b.length < 120 ? _b : 'Erro no servidor. Tente novamente.');
      }
      window.showToast('Veículo excluído', 'success');
      Store.invalidate();
      this._loaded = false;
      this.render();
    } catch (e) {
      window.showToast(e.message, 'error');
    }
  },
};
