window.Socios = {
  async render() {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading-spinner">Carregando...</div>';

    try {
      await Store.loadFor(['socios','investimentos']);

      const totalParticipacao = Store.state.socios.reduce((sum, s) => sum + s.participacao, 0);

      const html = `
        <div class="page-header">
          <div>
            <h1 class="page-title">Sócios</h1>
            <p class="page-subtitle">Gerenciar sócios e participações</p>
          </div>
          <button class="btn btn-primary btn-lg" id="btnNovoSocio">+ Novo Sócio</button>
        </div>

        <div class="card mb-2xl">
          <div class="card-header">
            <h3 class="card-title">Participação Total</h3>
          </div>
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--sp-lg);">
            <div>
              <div class="text-muted font-sm mb-sm">Total Sócios</div>
              <div class="font-xl font-bold">${Store.state.socios.length}</div>
            </div>
            <div>
              <div class="text-muted font-sm mb-sm">Participação Registrada</div>
              <div class="font-xl font-bold" style="color: ${totalParticipacao === 100 ? 'var(--color-success)' : 'var(--color-warning)'};">${totalParticipacao.toFixed(2)}%</div>
            </div>
            <div>
              <div class="text-muted font-sm mb-sm">Participação Faltante</div>
              <div class="font-xl font-bold" style="color: var(--color-info);">${(100 - totalParticipacao).toFixed(2)}%</div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Sócios</h3>
          </div>
          ${Store.state.socios.length === 0 ? `
            <p class="text-muted" style="padding: var(--sp-lg);">Nenhum sócio registrado</p>
          ` : `
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>CPF/CNPJ</th>
                    <th>Email</th>
                    <th>Telefone</th>
                    <th style="text-align: right;">Participação</th>
                    <th style="text-align: right;">Total Investido</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  ${Store.state.socios.map(s => {
                    const investimentos = Store.getInvestimentosBySocio(s.id);
                    const totalInvestido = Store.getTotalInvestimentoBySocio(s.id);
                    return `
                      <tr>
                        <td>${escapeHtml(s.name)}</td>
                        <td>${escapeHtml(s.document) || '-'}</td>
                        <td>${escapeHtml(s.email) || '-'}</td>
                        <td>${escapeHtml(s.phone) || '-'}</td>
                        <td style="text-align: right; font-weight: 600;">${s.participacao.toFixed(2)}%</td>
                        <td style="text-align: right; font-weight: 600;">${Store.formatBRL(totalInvestido)}</td>
                        <td>
                          <div class="actions-cell">
                            <a class="action-link btn-investimentos" data-id="${s.id}">Investimentos</a>
                            <a class="action-link btn-editar" data-id="${s.id}">Editar</a>
                            <a class="action-link danger btn-excluir" data-id="${s.id}">Excluir</a>
                          </div>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
      `;

      app.innerHTML = html;

      document.getElementById('btnNovoSocio').addEventListener('click', () => this.showModal());
      document.querySelectorAll('.btn-investimentos').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const socio = Store.getSocioById(e.target.dataset.id);
          if (socio) window.Investimentos.showModalInvestimentos(socio);
        });
      });
      document.querySelectorAll('.btn-editar').forEach(btn => {
        btn.addEventListener('click', (e) => this.showModal(e.target.dataset.id));
      });
      document.querySelectorAll('.btn-excluir').forEach(btn => {
        btn.addEventListener('click', (e) => this.deleteSocio(e.target.dataset.id));
      });
    } catch (e) {
      console.error(e);
      app.innerHTML = '<div class="card"><p class="text-danger">Erro ao carregar sócios. Tente novamente.</p></div>';
    }
  },

  showModal(socioId) {
    const socio = socioId ? Store.getSocioById(socioId) : null;
    const title = socio ? 'Editar Sócio' : 'Novo Sócio';

    const html = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal" style="width: 600px;">
          <div class="modal-header">
            <h2 class="modal-title">${title}</h2>
            <button class="modal-close">✕</button>
          </div>
          <form id="formSocio" class="modal-content">
            <div class="form-group">
              <label class="form-label">Nome/Razão Social *</label>
              <input class="form-control" name="name" value="${socio?.name || ''}" required>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">CPF/CNPJ</label>
                <input class="form-control" name="document" value="${socio?.document || ''}">
              </div>
              <div class="form-group">
                <label class="form-label">Participação % *</label>
                <input class="form-control" name="participacao" type="number" step="0.01" min="0" max="100" value="${socio?.participacao || ''}" required>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Email</label>
                <input class="form-control" name="email" type="email" value="${socio?.email || ''}">
              </div>
              <div class="form-group">
                <label class="form-label">Telefone</label>
                <input class="form-control" name="phone" data-phone inputmode="numeric" maxlength="16" value="${socio?.phone ? window.formatPhoneBR(socio.phone) : ''}" placeholder="(00) 00000-0000">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Notas</label>
              <textarea class="form-control" name="notes">${socio?.notes || ''}</textarea>
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelar">Cancelar</button>
            <button class="btn btn-primary" id="btnSalvar">${socio ? 'Atualizar' : 'Criar'}</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

    const overlay = document.getElementById('modalOverlay');
    const closeModal = () => overlay.remove();

    overlay.querySelector('.modal-close').addEventListener('click', closeModal);
    document.getElementById('btnCancelar').addEventListener('click', closeModal);

    document.getElementById('btnSalvar').addEventListener('click', async () => {
      const formData = new FormData(document.getElementById('formSocio'));
      const data = Object.fromEntries(formData);
      data.participacao = parseFloat(data.participacao);

      try {
        if (socio) {
          await Store.updateSocio(socioId, data);
          window.showToast('Sócio atualizado', 'success');
        } else {
          await Store.createSocio(data);
          window.showToast('Sócio criado', 'success');
        }
        closeModal();
        this.render();
      } catch (e) {
        window.showToast(e.message, 'error');
      }
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
  },

  async deleteSocio(id) {
    if (!confirm('Tem certeza? Todos os investimentos deste sócio serão removidos.')) return;
    try {
      await Store.deleteSocio(id);
      window.showToast('Sócio removido', 'success');
      this.render();
    } catch (e) {
      window.showToast(e.message, 'error');
    }
  }
};
