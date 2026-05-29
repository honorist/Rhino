// Tela de Usuários — gerencia logins e perfis de acesso
const Usuarios = {
  async render() {
    const root = document.getElementById('app');
    await Store.loadUsers().catch((e) => {
      console.warn('[Usuarios] falha ao carregar usuários:', e?.message || e);
      if (window.toast) window.toast('Falha ao carregar usuários — recarregue a página', 'error');
    });
    // Garante níveis carregados via Store (consistente com o resto da app)
    if (!Store.state.niveis_acesso || Store.state.niveis_acesso.length === 0) {
      await Store.loadNiveisAcesso().catch((e) => {
        console.warn('[Usuarios] falha ao carregar níveis de acesso:', e?.message || e);
        if (window.toast) window.toast('Falha ao carregar perfis de acesso', 'error');
      });
    }

    const users = Store.state.users || [];
    const niveis = Store.state.niveis_acesso || [];
    const niveisById = Object.fromEntries(niveis.map(n => [n.id, n]));
    const meEmail = (window.auth && window.auth.user && window.auth.user()) ? window.auth.user().email : '';

    root.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Usuários e Acessos</h1>
        <button class="btn btn-primary" id="btnNovoUser">+ Novo Usuário</button>
      </div>

      <p style="color:var(--color-text-muted);margin-bottom:var(--sp-md);font-size:14px;">
        Cada usuário precisa de email + senha para entrar e tem um <strong>nível de acesso</strong> (perfil),
        que define quais abas ele vê.
      </p>

      <table class="data-table">
        <thead>
          <tr>
            <th scope="col">Email</th>
            <th scope="col">Nome</th>
            <th scope="col">Nível de acesso</th>
            <th scope="col">Status</th>
            <th scope="col">Último login</th>
            <th scope="col" style="width:120px;">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${users.length === 0 ? `<tr><td colspan="6" style="text-align:center;color:var(--color-text-muted);padding:var(--sp-xl);">Nenhum usuário ainda</td></tr>` : ''}
          ${users.map(u => {
            const nivel = niveisById[u.nivelAcessoId];
            const ehVoce = u.email === meEmail;
            return `
              <tr>
                <td>
                  ${escapeHtml(u.email)}
                  ${ehVoce ? '<span style="color:var(--color-text-muted);font-size:12px;margin-left:6px;">(você)</span>' : ''}
                </td>
                <td>${escapeHtml(u.name || '—')}</td>
                <td>
                  ${nivel ? `<span style="color:${nivel.cor};font-weight:600;">${nivel.icon} ${nivel.label}</span>` : '<span style="color:var(--color-text-muted);">sem nível</span>'}
                </td>
                <td>${u.isActive ? '<span style="color:#10b981;">Ativo</span>' : '<span style="color:#aaa;">Desativado</span>'}</td>
                <td>${u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('pt-BR') : '—'}</td>
                <td>
                  <button class="btn btn-sm btn-secondary btn-edit-user" data-id="${u.id}" title="Editar">✏️</button>
                  ${ehVoce ? '' : `<button class="btn btn-sm btn-secondary btn-del-user" data-id="${u.id}" data-email="${escapeHtml(u.email)}" title="Excluir">🗑</button>`}
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;

    document.getElementById('btnNovoUser').addEventListener('click', () => this.showModal(null));
    document.querySelectorAll('.btn-edit-user').forEach(b => b.addEventListener('click', e => this.showModal(e.currentTarget.dataset.id)));
    document.querySelectorAll('.btn-del-user').forEach(b => b.addEventListener('click', async e => {
      const id = e.currentTarget.dataset.id;
      const email = e.currentTarget.dataset.email;
      if (!confirm(`Excluir o usuário ${email}?`)) return;
      try {
        await Store.deleteUser(id);
        window.showToast('Usuário excluído', 'success');
        this.render();
      } catch (ex) {
        window.showToast(ex.message, 'error');
      }
    }));
  },

  showModal(id) {
    const user = id ? (Store.state.users || []).find(u => u.id === id) : null;
    const niveis = Store.state.niveis_acesso || [];
    const title = user ? 'Editar Usuário' : 'Novo Usuário';

    const html = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal">
          <div class="modal-header">
            <h2 class="modal-title">${title}</h2>
            <button class="modal-close">✕</button>
          </div>
          <form id="formUser" class="modal-content">
            <div class="form-group">
              <label class="form-label">Email *</label>
              <input class="form-control" name="email" type="email" value="${escapeHtml(user?.email || '')}" required>
            </div>
            <div class="form-group">
              <label class="form-label">Nome</label>
              <input class="form-control" name="name" value="${escapeHtml(user?.name || '')}">
            </div>
            <div class="form-group">
              <label class="form-label">${user ? 'Nova senha (deixe vazio para não alterar)' : 'Senha *'}</label>
              <div style="position:relative;">
                <input class="form-control" name="password" id="inputPassword" type="password" autocomplete="new-password" minlength="8" ${user ? '' : 'required'} style="padding-right:40px;">
                <button type="button" id="btnToggleSenha" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;padding:0;color:var(--color-text-muted);" aria-label="Mostrar/ocultar senha">
                  <svg id="iconOlhoAberto" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  <svg id="iconOlhoFechado" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none;"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                </button>
              </div>
              <small style="color:var(--color-text-muted);">Mínimo 8 caracteres.</small>
            </div>
            <div class="form-group">
              <label class="form-label">Nível de acesso</label>
              <select class="form-control" name="nivelAcessoId">
                <option value="">— sem nível (sem restrição) —</option>
                ${niveis.map(n => `<option value="${n.id}" ${user?.nivelAcessoId === n.id ? 'selected' : ''}>${n.icon} ${n.label}</option>`).join('')}
              </select>
            </div>
            ${user ? `
              <div class="form-group">
                <label style="display:flex;align-items:center;gap:8px;">
                  <input type="checkbox" name="isActive" ${user.isActive ? 'checked' : ''}>
                  <span>Usuário ativo (pode fazer login)</span>
                </label>
              </div>
            ` : ''}
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelar">Cancelar</button>
            <button class="btn btn-primary" id="btnSalvar">${user ? 'Atualizar' : 'Criar'}</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalOverlay');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnCancelar').addEventListener('click', close);

    const btnToggle = document.getElementById('btnToggleSenha');
    if (btnToggle) {
      btnToggle.addEventListener('click', () => {
        const input = document.getElementById('inputPassword');
        const aberto = document.getElementById('iconOlhoAberto');
        const fechado = document.getElementById('iconOlhoFechado');
        if (input.type === 'password') {
          input.type = 'text';
          aberto.style.display = 'none';
          fechado.style.display = '';
        } else {
          input.type = 'password';
          aberto.style.display = '';
          fechado.style.display = 'none';
        }
      });
    }

    document.getElementById('btnSalvar').addEventListener('click', async () => {
      const fd = new FormData(document.getElementById('formUser'));
      const data = {
        email: fd.get('email'),
        name: fd.get('name') || null,
        nivelAcessoId: fd.get('nivelAcessoId') || null,
      };
      const pwd = fd.get('password');
      if (pwd) data.password = pwd;
      if (user) data.isActive = !!fd.get('isActive');

      try {
        if (user) {
          await Store.updateUser(user.id, data);
          window.showToast('Usuário atualizado', 'success');
        } else {
          await Store.createUser(data);
          window.showToast('Usuário criado', 'success');
        }
        close();
        this.render();
      } catch (e) {
        window.showToast(e.message, 'error');
      }
    });
  },
};

window.Usuarios = Usuarios;
