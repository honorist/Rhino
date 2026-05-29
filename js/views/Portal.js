/* Rhino · Portal do Cliente
   Tela pública acessada pelo cliente após login no portal.
   Sem sidebar, sem shell — layout próprio simples.
*/
window.Portal = {
  _cliente: null,
  _data: null,

  async init() {
    const saved = sessionStorage.getItem('rhino-portal-cliente');
    if (saved) {
      try { this._cliente = JSON.parse(saved); } catch {}
    }
    await this.render();
  },

  async render() {
    document.getElementById('shell').style.display = 'none';
    document.body.classList.add('portal-mode');

    const wrap = document.getElementById('portal-root') || (() => {
      const d = document.createElement('div');
      d.id = 'portal-root';
      document.body.appendChild(d);
      return d;
    })();

    if (!this._cliente) {
      this._renderLogin(wrap);
      return;
    }

    wrap.innerHTML = '<div style="text-align:center;padding:60px;color:var(--color-text-muted);">Carregando…</div>';
    try {
      const [resDash, resPropostas] = await Promise.all([
        fetch('/api/portal/dashboard'),
        fetch('/api/portal/propostas').catch(e => {
          console.warn('[Portal] /api/portal/propostas falhou:', e?.message || e);
          return { ok: false, _failed: true };
        }),
      ]);
      if (resDash.status === 401) { this._logout(wrap); return; }
      this._data = await resDash.json();
      if (resPropostas && resPropostas.ok) {
        try { this._data.propostas = (await resPropostas.json()).propostas || []; }
        catch (e) {
          console.warn('[Portal] parse de propostas falhou:', e?.message || e);
          this._data.propostas = [];
          this._data._propostasErro = true;
        }
      } else {
        this._data.propostas = [];
        if (resPropostas?._failed) this._data._propostasErro = true;
      }
      this._renderDashboard(wrap);
    } catch {
      wrap.innerHTML = '<div style="text-align:center;padding:60px;color:#c33;">Erro ao carregar dados. Recarregue a página.</div>';
    }
  },

  _renderLogin(wrap) {
    wrap.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--color-bg);padding:var(--sp-lg);">
        <div style="width:100%;max-width:380px;">
          <div style="text-align:center;margin-bottom:var(--sp-xl);">
            <img src="assets/logo.png" alt="Rhino" style="height:52px;margin-bottom:var(--sp-lg);opacity:.9;">
            <h1 style="font-size:22px;font-weight:700;margin:0 0 6px;">Área do Cliente</h1>
            <p style="margin:0;color:var(--color-text-muted);font-size:14px;">Acompanhe seus contratos e obras</p>
          </div>
          <form id="portalLoginForm" class="card" style="padding:var(--sp-xl);display:flex;flex-direction:column;gap:var(--sp-md);">
            <div class="form-group">
              <label class="form-label">Email</label>
              <input class="form-control" name="email" type="email" autocomplete="username" required placeholder="seu@email.com">
            </div>
            <div class="form-group">
              <label class="form-label">Senha</label>
              <input class="form-control" name="senha" type="password" autocomplete="current-password" required>
            </div>
            <div id="portalLoginErr" style="display:none;color:#c33;font-size:13px;padding:8px 12px;background:rgba(220,38,38,.08);border-radius:6px;"></div>
            <button class="btn btn-primary" type="submit" style="width:100%;margin-top:4px;">Entrar</button>
            <div style="text-align:center;margin-top:var(--sp-sm);">
              <a href="#" id="portalBtnInterno" style="font-size:13px;color:var(--color-text-muted);">← Acesso interno</a>
            </div>
          </form>
        </div>
      </div>
    `;
    const form = document.getElementById('portalLoginForm');
    const err = document.getElementById('portalLoginErr');
    document.getElementById('portalBtnInterno').addEventListener('click', (e) => {
      e.preventDefault();
      window.location.reload();
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.style.display = 'none';
      const fd = new FormData(form);
      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true; btn.textContent = 'Entrando…';
      try {
        const res = await fetch('/api/portal/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: fd.get('email'), senha: fd.get('senha') }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || 'Erro ao entrar');
        this._cliente = j.cliente;
        sessionStorage.setItem('rhino-portal-cliente', JSON.stringify(j.cliente));
        await this.render();
      } catch (ex) {
        err.textContent = ex.message;
        err.style.display = 'block';
        btn.disabled = false; btn.textContent = 'Entrar';
      }
    });
  },

  _renderDashboard(wrap) {
    const d = this._data;
    const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 });
    const fmtDate = (s) => s ? new Date(s + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
    const statusLabel = { ativo: 'Em andamento', concluido: 'Concluído', pausado: 'Pausado', cancelado: 'Cancelado' };
    const statusColor = { ativo: '#38A169', concluido: '#3182CE', pausado: '#D69E2E', cancelado: '#E53E3E' };

    wrap.innerHTML = `
      <div style="min-height:100vh;background:var(--color-bg);">
        <!-- Header -->
        <header style="background:var(--sidebar-bg);border-bottom:1px solid var(--color-border);padding:var(--sp-md) var(--sp-xl);display:flex;align-items:center;justify-content:space-between;gap:var(--sp-md);">
          <div style="display:flex;align-items:center;gap:var(--sp-md);">
            <img src="assets/logo.png" alt="Rhino" style="height:36px;opacity:.9;">
            <div>
              <div style="font-weight:700;font-size:15px;">Área do Cliente</div>
              <div style="font-size:13px;color:var(--color-text-muted);">${escapeHtml(d.cliente.nome)}${d.cliente.empresa ? ' · ' + escapeHtml(d.cliente.empresa) : ''}</div>
            </div>
          </div>
          <button id="btnPortalLogout" class="btn btn-secondary" style="font-size:13px;">Sair</button>
        </header>

        <!-- Content -->
        <main style="max-width:960px;margin:0 auto;padding:var(--sp-xl);">

          <!-- KPIs -->
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:var(--sp-md);margin-bottom:var(--sp-xl);">
            ${[
              { label: 'Contratos ativos', value: d.contratos.filter(c => c.status === 'ativo').length },
              { label: 'Valor total', value: fmt(d.contratos.reduce((s, c) => s + (parseFloat(c.value) || 0), 0)) },
              { label: 'NFs emitidas', value: d.nfs.filter(n => n.status === 'emitida').length },
              { label: 'Diários de obra', value: (d.rdos || []).length },
            ].map(k => `
              <div class="card" style="padding:var(--sp-lg);text-align:center;">
                <div style="font-size:22px;font-weight:700;color:var(--color-primary);">${k.value}</div>
                <div style="font-size:13px;color:var(--color-text-muted);margin-top:4px;">${k.label}</div>
              </div>
            `).join('')}
          </div>

          <!-- Contratos -->
          <div class="card" style="margin-bottom:var(--sp-xl);">
            <div style="padding:var(--sp-lg);border-bottom:1px solid var(--color-border);">
              <h2 style="margin:0;font-size:16px;font-weight:700;">Meus Contratos</h2>
            </div>
            ${d.contratos.length === 0 ? `
              <div style="padding:var(--sp-xl);text-align:center;color:var(--color-text-muted);">Nenhum contrato vinculado</div>
            ` : d.contratos.map(c => `
              <div style="padding:var(--sp-lg);border-bottom:1px solid var(--color-border);">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:var(--sp-md);flex-wrap:wrap;">
                  <div>
                    <div style="font-weight:600;font-size:15px;">${escapeHtml(c.name)}</div>
                    ${c.contractNumber ? `<div style="font-size:13px;color:var(--color-text-muted);margin-top:2px;">${escapeHtml(c.contractNumber)}</div>` : ''}
                    <div style="margin-top:6px;font-size:13px;color:var(--color-text-muted);">
                      ${fmtDate(c.startDate)} → ${fmtDate(c.endDate)}
                      ${c.totalRdos > 0 ? ` · ${c.totalRdos} RDO${c.totalRdos !== 1 ? 's' : ''}` : ''}
                    </div>
                  </div>
                  <div style="text-align:right;flex-shrink:0;">
                    <span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;background:${statusColor[c.status] || '#718096'}22;color:${statusColor[c.status] || '#718096'};">
                      ${statusLabel[c.status] || c.status}
                    </span>
                    <div style="margin-top:6px;font-weight:700;font-size:15px;">${fmt(c.value)}</div>
                  </div>
                </div>
                <!-- Barra de progresso -->
                <div style="margin-top:var(--sp-md);">
                  <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--color-text-muted);margin-bottom:4px;">
                    <span>Execução financeira</span><span>${c.progresso}%</span>
                  </div>
                  <div style="height:6px;background:var(--color-surface-2);border-radius:3px;overflow:hidden;">
                    <div style="height:100%;width:${c.progresso}%;background:${c.progresso >= 90 ? '#E53E3E' : c.progresso >= 70 ? '#D69E2E' : '#38A169'};border-radius:3px;transition:width .4s;"></div>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>

          <!-- Propostas Comerciais -->
          ${(d.propostas && d.propostas.length > 0) ? `
            <div class="card" style="margin-bottom:var(--sp-xl);">
              <div style="padding:var(--sp-lg);border-bottom:1px solid var(--color-border);">
                <h2 style="margin:0;font-size:16px;font-weight:700;">Minhas Propostas</h2>
                <p style="margin:4px 0 0;font-size:13px;color:var(--color-text-muted);">${d.propostas.length} proposta(s) — clique para baixar</p>
              </div>
              <div class="table-wrap">
                <table>
                  <thead><tr><th scope="col">Número</th><th scope="col">Título</th><th scope="col">Valor</th><th scope="col">Emissão</th><th scope="col">Status</th><th scope="col">Baixar</th></tr></thead>
                  <tbody>
                    ${d.propostas.map(p => `
                      <tr>
                        <td><strong>PC_${escapeHtml(p.numero)}-${String(p.ano).padStart(2,'0')}${p.revisao > 0 ? ' Rev.' + String(p.revisao).padStart(2,'0') : ''}</strong></td>
                        <td>${escapeHtml(p.titulo)}</td>
                        <td>${fmt(p.valorTotal || p.valor_total)}</td>
                        <td>${fmtDate(p.dataEmissao || p.data_emissao)}</td>
                        <td><span style="font-weight:600;color:${p.status === 'aceita' ? '#10b981' : p.status === 'rejeitada' ? '#dc2626' : p.status === 'expirada' ? '#f59e0b' : '#3b82f6'};">${p.status}</span></td>
                        <td>
                          <button type="button" href="/api/portal/propostas/${p.id}/pdf" target="_blank" class="action-link" style="margin-right:8px;">PDF</button>
                          <button type="button" href="/api/portal/propostas/${p.id}/docx" target="_blank" class="action-link">DOCX</button>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          ` : ''}

          <!-- Notas Fiscais -->
          ${d.nfs.length > 0 ? `
            <div class="card">
              <div style="padding:var(--sp-lg);border-bottom:1px solid var(--color-border);">
                <h2 style="margin:0;font-size:16px;font-weight:700;">Notas Fiscais</h2>
              </div>
              <div class="table-wrap">
                <table>
                  <thead><tr><th scope="col">Número</th><th scope="col">Data</th><th scope="col">Valor</th><th scope="col">Status</th></tr></thead>
                  <tbody>
                    ${d.nfs.map(n => `
                      <tr>
                        <td><strong>${escapeHtml(n.numero || '—')}</strong></td>
                        <td>${fmtDate(n.dataEmissao)}</td>
                        <td>${fmt(n.valor)}</td>
                        <td><span style="color:${n.status === 'emitida' ? '#38A169' : '#D69E2E'};font-weight:600;">${n.status === 'emitida' ? 'Emitida' : 'Pendente'}</span></td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          ` : ''}

          <!-- RDOs recentes -->
          ${d.rdos && d.rdos.length > 0 ? `
            <div class="card" style="margin-top:var(--sp-xl);">
              <div style="padding:var(--sp-lg);border-bottom:1px solid var(--color-border);">
                <h2 style="margin:0;font-size:16px;font-weight:700;">Diários de Obra (RDOs)</h2>
                <p style="margin:4px 0 0;font-size:13px;color:var(--color-text-muted);">Últimas ${d.rdos.length} entradas</p>
              </div>
              ${d.rdos.map(r => `
                <div style="padding:var(--sp-lg);border-bottom:1px solid var(--color-border);">
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:var(--sp-md);flex-wrap:wrap;margin-bottom:8px;">
                    <div>
                      <strong style="font-size:14px;">${escapeHtml(r.contractName)}</strong>
                      <span style="margin-left:8px;font-size:13px;color:var(--color-text-muted);">${r.data ? new Date(r.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday:'short', day:'2-digit', month:'short' }) : '—'}</span>
                      ${r.clima ? `<span style="margin-left:8px;font-size:13px;">🌤 ${escapeHtml(r.clima)}</span>` : ''}
                    </div>
                  </div>
                  ${r.atividades ? `<p style="margin:0 0 8px;font-size:14px;color:var(--color-text-muted);">${escapeHtml(r.atividades)}${r.atividades.length >= 200 ? '…' : ''}</p>` : ''}
                  ${r.fotos && r.fotos.length > 0 ? `
                    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
                      ${r.fotos.map(f => `
                        <a href="${escapeHtml(f.url || '')}" target="_blank" rel="noopener" style="display:block;width:80px;height:60px;border-radius:6px;overflow:hidden;flex-shrink:0;background:var(--color-surface-2);">
                          <img src="${escapeHtml(f.url || '')}" alt="${escapeHtml(f.legenda || 'Foto')}" class="js-hide-on-error" style="width:100%;height:100%;object-fit:cover;" loading="lazy">
                        </a>
                      `).join('')}
                    </div>
                  ` : ''}
                </div>
              `).join('')}
            </div>
          ` : ''}
        </main>
      </div>
    `;

    document.getElementById('btnPortalLogout').addEventListener('click', async () => {
      // Loga falha mas continua o logout client-side (segurança: melhor remover
      // estado local mesmo que o server não confirme, pra não deixar usuário
      // "preso" se houver problema de rede). Sessão no PG é purgada por
      // expiração eventualmente.
      await fetch('/api/portal/logout', { method: 'POST' })
        .catch(e => console.warn('[Portal] logout server-side falhou — sessão local removida mesmo assim:', e?.message || e));
      sessionStorage.removeItem('rhino-portal-cliente');
      this._cliente = null;
      this._data = null;
      this._renderLogin(wrap);
    });
  },

  _logout(wrap) {
    sessionStorage.removeItem('rhino-portal-cliente');
    this._cliente = null;
    this._data = null;
    this._renderLogin(wrap);
  },

  exit() {
    const root = document.getElementById('portal-root');
    if (root) root.remove();
    document.getElementById('shell').style.display = '';
    document.body.classList.remove('portal-mode');
  },
};
