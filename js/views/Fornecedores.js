window.Fornecedores = {
  busca: '',
  filtroMaterial: '',

  // Sugestões pré-cadastradas para autocompletar materiais
  SUGESTOES_MATERIAIS: [
    'Elétrica', 'Estrutura Metálica', 'Andaime', 'Solda', 'Pintura',
    'Hidráulica', 'Alvenaria', 'Ferragens', 'Cimento', 'Madeira',
    'EPI', 'Ferramentas', 'Transporte', 'Hospedagem', 'Combustível'
  ],

  async render() {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading-spinner">Carregando...</div>';

    try {
      await Store.loadFor(['fornecedores']);

      // Coleta todos os materiais únicos já cadastrados
      const todosMateriais = [...new Set(
        Store.state.fornecedores.flatMap(f => f.materiais || [])
      )].sort();

      const termo = (this.busca || '').toLowerCase().trim();
      let filtrados = Store.state.fornecedores;
      if (termo) {
        filtrados = filtrados.filter(f =>
          (f.nome || '').toLowerCase().includes(termo) ||
          (f.cnpj || '').includes(termo) ||
          (f.pessoaContato || '').toLowerCase().includes(termo) ||
          (f.telefone || '').includes(termo));
      }
      if (this.filtroMaterial) {
        filtrados = filtrados.filter(f => (f.materiais || []).includes(this.filtroMaterial));
      }

      const html = `
        <div class="page-header">
          <div>
            <h1 class="page-title">Fornecedores</h1>
            <p class="page-subtitle">${Store.state.fornecedores.length} fornecedor${Store.state.fornecedores.length !== 1 ? 'es' : ''} cadastrado${Store.state.fornecedores.length !== 1 ? 's' : ''}</p>
          </div>
          <button class="btn btn-primary btn-lg" id="btnNovoFornecedor">+ Novo Fornecedor</button>
        </div>

        <div class="card" style="padding:var(--sp-md);margin-bottom:var(--sp-lg);">
          <div style="display:grid;grid-template-columns:1fr auto;gap:var(--sp-md);">
            <input class="form-control" id="inputBusca" placeholder="🔍 Buscar por nome, CNPJ, contato ou telefone..." value="${this.busca}">
            <select class="form-control" id="filtroMaterial" style="min-width:200px;">
              <option value="">Todos os materiais</option>
              ${todosMateriais.map(m => `<option value="${m}" ${this.filtroMaterial === m ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="card">
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>CNPJ</th>
                  <th>Contato</th>
                  <th>Materiais</th>
                  <th>Dados Bancários</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                ${filtrados.length === 0 ? `
                  <tr><td colspan="6" class="text-center text-muted" style="padding:var(--sp-xl);">
                    ${termo || this.filtroMaterial ? 'Nenhum fornecedor encontrado para os filtros' : 'Nenhum fornecedor cadastrado'}
                  </td></tr>
                ` : filtrados.map(f => `
                  <tr>
                    <td>
                      <strong>${escapeHtml(f.nome) || '—'}</strong>
                      ${f.telefone ? `<div style="font-size:15px;color:var(--color-text-muted);">📞 ${escapeHtml(f.telefone)}</div>` : ''}
                      ${f.endereco ? `<div style="font-size:15px;color:var(--color-text-muted);">📍 ${escapeHtml(f.endereco.slice(0, 50))}${f.endereco.length > 50 ? '...' : ''}</div>` : ''}
                    </td>
                    <td><code style="font-size:15px;">${escapeHtml(f.cnpj) || '—'}</code></td>
                    <td>
                      ${f.pessoaContato ? `<strong style="font-size:15px;">${escapeHtml(f.pessoaContato)}</strong>` : '—'}
                    </td>
                    <td style="max-width:200px;">
                      ${(f.materiais && f.materiais.length > 0)
                        ? `<div style="display:flex;flex-wrap:wrap;gap:4px;">
                            ${f.materiais.map(m => `<span class="badge" style="background:rgba(46,125,82,.12);color:#2E7D52;font-size:15px;">${escapeHtml(m)}</span>`).join('')}
                           </div>`
                        : '<span style="color:var(--color-text-muted);">—</span>'}
                    </td>
                    <td style="font-size:15px;">
                      ${f.banco || f.conta ? `<div>🏦 ${escapeHtml(f.banco) || ''} ${f.agencia ? `Ag. ${escapeHtml(f.agencia)}` : ''} ${f.conta ? `C. ${escapeHtml(f.conta)}` : ''}</div>` : ''}
                      ${f.chavePix ? `<div style="color:var(--color-info);font-family:monospace;">📱 PIX: ${escapeHtml(f.chavePix)}</div>` : ''}
                      ${!f.banco && !f.conta && !f.chavePix ? '<span style="color:var(--color-text-muted);">—</span>' : ''}
                    </td>
                    <td>
                      <div class="actions-cell">
                        <a class="action-link btn-editar" data-id="${f.id}">Editar</a>
                        <a class="action-link danger btn-excluir" data-id="${f.id}">Excluir</a>
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

      document.getElementById('btnNovoFornecedor').addEventListener('click', () => this.showModal());
      document.getElementById('inputBusca').addEventListener('input', e => {
        this.busca = e.target.value;
        clearTimeout(this._tBusca);
        this._tBusca = setTimeout(() => this.render(), 250);
      });
      document.getElementById('filtroMaterial').addEventListener('change', e => {
        this.filtroMaterial = e.target.value;
        this.render();
      });

      document.querySelectorAll('.btn-editar').forEach(b => b.addEventListener('click', e => this.showModal(e.target.dataset.id)));
      document.querySelectorAll('.btn-excluir').forEach(b => b.addEventListener('click', e => this.deleteFornecedor(e.target.dataset.id)));
    } catch (e) {
      console.error(e);
      app.innerHTML = '<div class="card"><p class="text-danger">Erro ao carregar fornecedores. Tente novamente.</p></div>';
    }
  },

  showModal(fornecedorId) {
    const fornecedor = fornecedorId ? Store.state.fornecedores.find(f => f.id === fornecedorId) : null;
    const title = fornecedor ? 'Editar Fornecedor' : 'Novo Fornecedor';

    // Todos os materiais já cadastrados no sistema + sugestões
    const materiaisSistema = [...new Set(
      Store.state.fornecedores.flatMap(f => f.materiais || [])
    )];
    const sugestoes = [...new Set([...this.SUGESTOES_MATERIAIS, ...materiaisSistema])].sort();

    const html = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal" style="width:720px;max-height:90vh;overflow-y:auto;">
          <div class="modal-header">
            <h2 class="modal-title">${title}</h2>
            <button class="modal-close">✕</button>
          </div>
          <form id="formFornecedor" class="modal-content">

            <!-- Dados da empresa -->
            <div style="font-size:15px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;margin-bottom:var(--sp-sm);letter-spacing:.04em;">Dados da Empresa</div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Nome / Razão Social *</label>
                <input class="form-control" name="nome" value="${fornecedor?.nome || ''}" required>
              </div>
              <div class="form-group">
                <label class="form-label">CNPJ</label>
                <input class="form-control" name="cnpj" value="${fornecedor?.cnpj || ''}" placeholder="00.000.000/0000-00">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Endereço</label>
              <textarea class="form-control" name="endereco" style="min-height:60px;" placeholder="Rua, número, bairro, cidade — UF, CEP">${fornecedor?.endereco || ''}</textarea>
            </div>

            <!-- Contato -->
            <div style="font-size:15px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;margin-top:var(--sp-lg);margin-bottom:var(--sp-sm);letter-spacing:.04em;padding-top:var(--sp-lg);border-top:1px solid var(--color-border);">Contato</div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Telefone</label>
                <input class="form-control" name="telefone" data-phone inputmode="numeric" maxlength="16" value="${fornecedor?.telefone ? window.formatPhoneBR(fornecedor.telefone) : ''}" placeholder="(00) 00000-0000">
              </div>
              <div class="form-group">
                <label class="form-label">Pessoa de Contato</label>
                <input class="form-control" name="pessoaContato" value="${fornecedor?.pessoaContato || ''}" placeholder="Nome do vendedor/atendente">
              </div>
            </div>

            <!-- Materiais -->
            <div style="font-size:15px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;margin-top:var(--sp-lg);margin-bottom:var(--sp-sm);letter-spacing:.04em;padding-top:var(--sp-lg);border-top:1px solid var(--color-border);">Materiais que Fornece</div>
            <div class="form-group">
              <label class="form-label">Tipos de Material / Serviço</label>
              <input class="form-control" name="materiais" list="sugestoesMateriais"
                     value="${(fornecedor?.materiais || []).join(', ')}"
                     placeholder="Ex: Elétrica, Estrutura Metálica, Andaime">
              <datalist id="sugestoesMateriais">
                ${sugestoes.map(s => `<option value="${s}">`).join('')}
              </datalist>
              <div class="form-helper">Separe múltiplos materiais por vírgula. Sugestões aparecem ao digitar.</div>
            </div>

            <!-- Dados bancários -->
            <div style="font-size:15px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;margin-top:var(--sp-lg);margin-bottom:var(--sp-sm);letter-spacing:.04em;padding-top:var(--sp-lg);border-top:1px solid var(--color-border);">Dados para Pagamento</div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Banco</label>
                <input class="form-control" name="banco" value="${fornecedor?.banco || ''}" placeholder="Ex: Itaú, Bradesco, Nubank">
              </div>
              <div class="form-group">
                <label class="form-label">Agência</label>
                <input class="form-control" name="agencia" value="${fornecedor?.agencia || ''}" placeholder="0000">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Conta</label>
                <input class="form-control" name="conta" value="${fornecedor?.conta || ''}" placeholder="00000-0">
              </div>
              <div class="form-group">
                <label class="form-label">Chave PIX</label>
                <input class="form-control" name="chavePix" value="${fornecedor?.chavePix || ''}" placeholder="CPF, e-mail, telefone ou aleatória">
              </div>
            </div>

            <!-- Notas -->
            <div class="form-group" style="margin-top:var(--sp-lg);padding-top:var(--sp-lg);border-top:1px solid var(--color-border);">
              <label class="form-label">Observações</label>
              <textarea class="form-control" name="notas" style="min-height:60px;" placeholder="Condições comerciais, prazo de entrega, etc.">${fornecedor?.notas || ''}</textarea>
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelar">Cancelar</button>
            <button class="btn btn-primary" id="btnSalvar">${fornecedor ? 'Atualizar' : 'Criar'}</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalOverlay');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnCancelar').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    document.getElementById('btnSalvar').addEventListener('click', async () => {
      const fd = new FormData(document.getElementById('formFornecedor'));
      const data = Object.fromEntries(fd);
      if (!data.nome || !data.nome.trim()) { window.showToast('Nome é obrigatório', 'error'); return; }
      // materiais: string → array
      data.materiais = (data.materiais || '').split(',').map(s => s.trim()).filter(Boolean);

      try {
        if (fornecedor) await Store.updateFornecedor(fornecedorId, data);
        else await Store.createFornecedor(data);
        window.showToast(fornecedor ? 'Fornecedor atualizado' : 'Fornecedor criado', 'success');
        close();
        this.render();
      } catch (e) { window.showToast(e.message, 'error'); }
    });
  },

  async deleteFornecedor(id) {
    if (!confirm('Excluir este fornecedor?')) return;
    try {
      await Store.deleteFornecedor(id);
      window.showToast('Fornecedor removido', 'success');
      this.render();
    } catch (e) { window.showToast(e.message, 'error'); }
  }
};
