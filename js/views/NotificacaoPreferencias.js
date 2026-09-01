// Rhino · Preferências de notificação (F19) — tela pessoal, universal (não
// depende das `abas` do nível de acesso). Cada colaborador escolhe quais
// tipos de notificação do sino quer receber. Sem itens = recebe tudo
// (default opt-out; ver lib/notificacoes.js BR-NOTIF-002).
window.NotificacaoPreferencias = {
  _catalogo: [],
  _desativados: new Set(),

  async render() {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading-spinner">Carregando...</div>';
    try {
      const r = await fetch('/api/notificacoes/preferencias', { credentials: 'same-origin' });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      this._catalogo = data.catalogo || [];
      this._desativados = new Set(data.tiposDesativados || []);
      this._draw();
    } catch (e) {
      app.innerHTML = `<div class="card"><p class="text-danger">Erro ao carregar preferências: ${escapeHtml(e.message)}</p></div>`;
    }
  },

  _draw() {
    const app = document.getElementById('app');
    const porCategoria = {};
    this._catalogo.forEach((t) => {
      (porCategoria[t.categoria] = porCategoria[t.categoria] || []).push(t);
    });

    const headerHtml = window.UIKit?.pageHeader
      ? window.UIKit.pageHeader({
          title: 'Preferências de notificação',
          icon: window.rhIcon ? window.rhIcon('bell', 22) : '',
          subtitle: 'Escolha o que você quer ver no sino de notificações',
        })
      : '<div class="page-header"><div><h1 class="page-title">Preferências de notificação</h1></div></div>';

    const gruposHtml = Object.entries(porCategoria)
      .map(
        ([categoria, itens]) => `
        <div class="card mb-2xl" style="padding:var(--sp-lg);">
          <h3 style="font-size:15px;font-weight:700;margin-bottom:var(--sp-md);">${escapeHtml(categoria)}</h3>
          ${itens
            .map(
              (t) => `
            <label style="display:flex;align-items:center;gap:10px;padding:8px 0;cursor:pointer;">
              <input type="checkbox" data-tipo="${escapeHtml(t.tipo)}" ${this._desativados.has(t.tipo) ? '' : 'checked'} style="width:auto;">
              <span>${escapeHtml(t.label)}</span>
            </label>
          `
            )
            .join('')}
        </div>
      `
      )
      .join('');

    app.innerHTML = `
      ${headerHtml}
      ${
        this._catalogo.length === 0
          ? `<div class="card"><p class="text-muted" style="padding:var(--sp-lg);">Nenhum tipo de notificação configurável no momento.</p></div>`
          : gruposHtml
      }
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:var(--sp-md);">
        <button class="btn btn-primary" id="btnSalvarPrefs">Salvar</button>
      </div>
    `;

    document.getElementById('btnSalvarPrefs')?.addEventListener('click', () => this._salvar());
    app.querySelectorAll('input[data-tipo]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const tipo = cb.dataset.tipo;
        if (cb.checked) this._desativados.delete(tipo);
        else this._desativados.add(tipo);
      });
    });
  },

  async _salvar() {
    const btn = document.getElementById('btnSalvarPrefs');
    const txtOrig = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Salvando…';
    try {
      const r = await fetch('/api/notificacoes/preferencias', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tiposDesativados: [...this._desativados] }),
      });
      if (!r.ok) throw new Error(await r.text());
      window.showToast('Preferências salvas', 'success');
    } catch (e) {
      window.showToast(e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = txtOrig;
    }
  },
};
