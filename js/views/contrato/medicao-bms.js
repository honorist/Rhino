/* Rhino · ContratoDetail · medicao-bms (BM estruturado — seção B)
   Lista de Boletins de Medição, modal de nova medição por itens e
   ações de aprovação/rejeição.

   REGRA: nenhuma regra de negócio aqui. retencaoValor e valorLiquido vêm
   calculados do servidor; o total ao vivo do modal é só feedback visual.
   O bloqueio por saldo (BR-MED-001) é do servidor — a mensagem de erro 400
   é exibida ao usuário como recebida.

   Estende o objeto window.ContratoDetail já definido. */
(function () {
  if (!window.ContratoDetail) {
    console.error('[contrato/medicao-bms] requires ContratoDetail core');
    return;
  }

  const esc = (v) => window.escapeHtml(v);
  const icon = (name, size) => (window.rhIcon ? window.rhIcon(name, size || 15) : '');

  function fmtData(s) {
    if (!s) return '—';
    const d = new Date(String(s).slice(0, 10) + 'T12:00:00');
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
  }

  const STATUS_APROVACAO = {
    aprovada:  { label: 'Aprovado',  tone: 'pos' },
    rejeitada: { label: 'Rejeitado', tone: 'neg' },
  };

  function pillAprovacao(status) {
    const cfg = STATUS_APROVACAO[status] || { label: 'Pendente', tone: 'neutral' };
    return window.rhStatusPill
      ? window.rhStatusPill(cfg.tone, cfg.label)
      : `<span class="badge">${esc(cfg.label)}</span>`;
  }

  Object.assign(window.ContratoDetail, {
    // ═══════════ (B) BOLETINS DE MEDIÇÃO ═══════════
    _renderMedicaoBms(contractId) {
      const card = document.getElementById('medicaoBmsCard');
      if (!card) return;
      const bms = (this._medicao && this._medicao.bms) || [];
      const servicos = (this._medicao && this._medicao.servicos) || [];
      const podeEditar = this._podeEditar();
      const fmtQtd = this._medFmtQtd;
      const temServicoAtivo = servicos.some((s) => s.ativo !== false);

      const linhas = bms.map((bm) => {
        const itens = (bm.saidas || []).reduce((acc, s) => acc.concat(s.itens || []), []);
        const pct = parseFloat(bm.retencaoPct) || 0;
        const rowId = `bmItens_${bm.id}`;
        return `
          <tr>
            <td>
              <button class="btn btn-sm btn-secondary btn-med-toggle-bm" data-target="${esc(rowId)}"
                      aria-expanded="false" aria-controls="${esc(rowId)}"
                      title="Ver itens medidos" ${itens.length === 0 ? 'disabled' : ''}>${icon('list', 14)}</button>
            </td>
            <td><strong>${esc(bm.numero || '—')}</strong>
              <div class="rh-meta-xs">${itens.length} item${itens.length === 1 ? '' : 's'}${bm.emitida ? ' · NF emitida' : ''}</div>
            </td>
            <td>${fmtData(bm.dataLimite)}</td>
            <td style="text-align:right;font-weight:600;">${Store.formatBRL(bm.valor)}</td>
            <td style="text-align:right;">
              ${Store.formatBRL(bm.retencaoValor)}
              <div class="rh-meta-xs">${pct.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%</div>
            </td>
            <td style="text-align:right;font-weight:700;color:var(--color-success);">${Store.formatBRL(bm.valorLiquido)}</td>
            <td>
              ${pillAprovacao(bm.aprovacaoStatus)}
              ${bm.aprovacaoPor ? `<div class="rh-meta-xs">${esc(bm.aprovacaoPor)}${bm.aprovacaoEm ? ' · ' + fmtData(bm.aprovacaoEm) : ''}</div>` : ''}
              ${bm.aprovacaoObs ? `<div class="rh-meta-xs" style="color:var(--color-text-muted);">${esc(bm.aprovacaoObs)}</div>` : ''}
            </td>
            ${podeEditar ? `
            <td style="text-align:center;white-space:nowrap;">
              <button class="btn btn-sm btn-secondary btn-med-aprovar" data-id="${esc(bm.id)}" data-status="aprovada">Aprovar</button>
              <button class="btn btn-sm btn-danger btn-med-aprovar" data-id="${esc(bm.id)}" data-status="rejeitada" style="margin-left:4px;">Rejeitar</button>
            </td>` : ''}
          </tr>
          <tr id="${esc(rowId)}" hidden style="display:none;">
            <td colspan="${podeEditar ? 8 : 7}" style="background:var(--color-surface-2);padding:var(--sp-md);">
              ${itens.length === 0 ? '<span class="rh-meta">Este BM não tem itens de medição estruturada.</span>' : `
              <table style="width:100%;font-size:13px;">
                <thead>
                  <tr>
                    <th scope="col">Código</th>
                    <th scope="col">Serviço</th>
                    <th scope="col" style="text-align:center;">Un.</th>
                    <th scope="col" style="text-align:right;">Qtd</th>
                    <th scope="col" style="text-align:right;">Preço Unit.</th>
                    <th scope="col" style="text-align:right;">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  ${itens.map((it) => `
                    <tr>
                      <td>${esc(it.codigo || '—')}</td>
                      <td>${esc(it.descricao || '—')}</td>
                      <td style="text-align:center;">${esc(it.unidade || 'un')}</td>
                      <td style="text-align:right;">${fmtQtd(it.qtd)}</td>
                      <td style="text-align:right;">${Store.formatBRL(it.precoUnit)}</td>
                      <td style="text-align:right;font-weight:600;">${Store.formatBRL(it.valor)}</td>
                    </tr>`).join('')}
                </tbody>
              </table>`}
            </td>
          </tr>`;
      }).join('');

      card.innerHTML = `
        <div class="card-header">
          <div>
            <h3 class="card-title">Boletins de Medição</h3>
            <div class="rh-meta-xs">${bms.length} BM${bms.length === 1 ? '' : 's'} · retenção e líquido calculados pelo contrato</div>
          </div>
          ${podeEditar ? `<button class="btn btn-primary btn-sm" id="btnMedNovaMedicao" ${temServicoAtivo ? '' : 'disabled title="Cadastre serviços ativos na planilha antes de medir"'}>
            <span style="display:inline-flex;align-items:center;gap:8px;">${icon('plus', 15)}Nova Medição</span></button>` : ''}
        </div>
        ${bms.length === 0 ? this._medCardVazio('Nenhum boletim de medição', 'Registre uma medição por itens para gerar o primeiro BM.') : `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col" style="width:44px;"><span class="sr-only">Itens</span></th>
                <th scope="col">BM</th>
                <th scope="col">Data</th>
                <th scope="col" style="text-align:right;">Valor</th>
                <th scope="col" style="text-align:right;">Retenção</th>
                <th scope="col" style="text-align:right;">Valor Líquido</th>
                <th scope="col">Aprovação</th>
                ${podeEditar ? '<th scope="col" style="text-align:center;">Ações</th>' : ''}
              </tr>
            </thead>
            <tbody>${linhas}</tbody>
          </table>
        </div>`}`;

      document.getElementById('btnMedNovaMedicao')?.addEventListener('click', () => this._showModalMedicao(contractId));
      card.querySelectorAll('.btn-med-toggle-bm').forEach((b) => {
        b.addEventListener('click', () => {
          const row = document.getElementById(b.dataset.target);
          if (!row) return;
          const aberto = !row.hidden;
          row.hidden = aberto;
          row.style.display = aberto ? 'none' : '';
          b.setAttribute('aria-expanded', String(!aberto));
        });
      });
      card.querySelectorAll('.btn-med-aprovar').forEach((b) => {
        b.addEventListener('click', () => this._showModalAprovacaoBm(contractId, b.dataset.id, b.dataset.status));
      });
    },

    // ═══════════ MODAL: nova medição por itens ═══════════
    _showModalMedicao(contractId) {
      const fmtQtd = this._medFmtQtd;
      const servicos = ((this._medicao && this._medicao.servicos) || []).filter((s) => s.ativo !== false);
      const inativos = ((this._medicao && this._medicao.servicos) || []).length - servicos.length;
      const hoje = new Date().toISOString().split('T')[0];

      const html = `
        <div class="modal-overlay" id="modalMedicaoOverlay">
          <div class="modal" style="width:820px;max-height:90vh;display:flex;flex-direction:column;">
            <div class="modal-header" style="flex-shrink:0;">
              <h2 class="modal-title">Nova Medição</h2>
              <button class="modal-close" id="btnFecharModalMedicao" aria-label="Fechar">✕</button>
            </div>
            <form id="formMedicao" class="modal-content" style="flex:1;overflow-y:auto;padding-right:4px;">
              <div class="form-row" style="display:grid;grid-template-columns:180px 1fr;gap:var(--sp-md);">
                <div class="form-group">
                  <label class="form-label" for="medData">Data da medição *</label>
                  <input class="form-control" id="medData" name="date" type="date" value="${esc(hoje)}" required>
                </div>
                <div class="form-group">
                  <label class="form-label" for="medDescricao">Descrição</label>
                  <input class="form-control" id="medDescricao" name="description" placeholder="Opcional — ex.: Medição referente à 1ª quinzena">
                </div>
              </div>
              <div class="rh-meta-xs" style="margin-bottom:var(--sp-sm);">
                Informe a quantidade medida de cada serviço. Serviços com qtd zerada não entram no BM.
                ${inativos > 0 ? `<br>${inativos} serviço(s) inativo(s) não aparecem aqui.` : ''}
              </div>
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Serviço</th>
                      <th scope="col" style="text-align:center;">Un.</th>
                      <th scope="col" style="text-align:right;">Saldo disponível</th>
                      <th scope="col" style="text-align:right;">Preço Unit.</th>
                      <th scope="col" style="text-align:right;width:130px;">Qtd a medir</th>
                      <th scope="col" style="text-align:right;">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${servicos.map((s) => `
                      <tr>
                        <td>
                          <strong>${esc(s.descricao)}</strong>
                          ${s.codigo ? `<div class="rh-meta-xs">${esc(s.codigo)}</div>` : ''}
                        </td>
                        <td style="text-align:center;">${esc(s.unidade || 'un')}</td>
                        <td style="text-align:right;">${fmtQtd(s.saldoQtd)}
                          <div class="rh-meta-xs">${Store.formatBRL(s.saldoValor)}</div>
                        </td>
                        <td style="text-align:right;">${Store.formatBRL(s.precoUnit)}</td>
                        <td style="text-align:right;">
                          <input class="form-control med-qtd-input" type="number" step="0.001" min="0"
                                 style="text-align:right;"
                                 data-servico-id="${esc(s.id)}"
                                 data-preco="${esc(parseFloat(s.precoUnit) || 0)}"
                                 aria-label="Quantidade a medir de ${esc(s.descricao)}">
                        </td>
                        <td style="text-align:right;font-weight:600;" data-subtotal-for="${esc(s.id)}">${Store.formatBRL(0)}</td>
                      </tr>`).join('')}
                  </tbody>
                </table>
              </div>
              <div id="medErro" class="text-danger" style="display:none;margin-top:var(--sp-md);font-size:13px;"></div>
            </form>
            <div class="modal-footer" style="flex-shrink:0;justify-content:space-between;">
              <div style="font-size:15px;">
                <span class="rh-meta">Total da medição</span>
                <strong id="medTotal" style="margin-left:8px;font-size:17px;">${Store.formatBRL(0)}</strong>
                <span class="rh-meta-xs" style="margin-left:8px;">prévia — o valor final é calculado pelo servidor</span>
              </div>
              <div style="display:flex;gap:var(--sp-md);">
                <button type="button" class="btn btn-secondary" id="btnCancelarMedicao">Cancelar</button>
                <button type="button" class="btn btn-primary" id="btnSalvarMedicao">Registrar Medição</button>
              </div>
            </div>
          </div>
        </div>`;
      document.body.insertAdjacentHTML('beforeend', html);

      const overlay = document.getElementById('modalMedicaoOverlay');
      const fechar = () => overlay.remove();
      const erroBox = overlay.querySelector('#medErro');
      const mostrarErro = (msg) => { erroBox.textContent = msg; erroBox.style.display = 'block'; };

      overlay.querySelector('#btnFecharModalMedicao').addEventListener('click', fechar);
      overlay.querySelector('#btnCancelarMedicao').addEventListener('click', fechar);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) fechar(); });
      setTimeout(() => overlay.querySelector('#medData')?.focus(), 50);

      // Total ao vivo — apenas feedback visual (o valor oficial vem do servidor).
      const inputs = [...overlay.querySelectorAll('.med-qtd-input')];
      const recalcular = () => {
        let total = 0;
        inputs.forEach((inp) => {
          const qtd = parseFloat(inp.value);
          const preco = parseFloat(inp.dataset.preco) || 0;
          const sub = Number.isFinite(qtd) && qtd > 0 ? qtd * preco : 0;
          total += sub;
          const cell = overlay.querySelector(`[data-subtotal-for="${CSS.escape(inp.dataset.servicoId)}"]`);
          if (cell) cell.textContent = Store.formatBRL(sub);
        });
        overlay.querySelector('#medTotal').textContent = Store.formatBRL(total);
      };
      inputs.forEach((inp) => inp.addEventListener('input', recalcular));

      overlay.querySelector('#btnSalvarMedicao').addEventListener('click', async () => {
        const itens = inputs
          .map((inp) => ({ servicoId: inp.dataset.servicoId, qtd: parseFloat(inp.value) }))
          .filter((i) => Number.isFinite(i.qtd) && i.qtd > 0);
        if (itens.length === 0) {
          mostrarErro('Informe a quantidade medida de ao menos um serviço.');
          return;
        }
        const form = overlay.querySelector('#formMedicao');
        const body = { date: form.date.value, itens };
        const descricao = form.description.value.trim();
        if (descricao) body.description = descricao;

        const btn = overlay.querySelector('#btnSalvarMedicao');
        btn.disabled = true;
        try {
          await Store.createContractMedicao(contractId, body);
          window.showToast('Medição registrada', 'success');
          fechar();
          await this._loadMedicao(contractId);
        } catch (e) {
          btn.disabled = false;
          // BR-MED-001 e demais regras: mensagem em pt-BR pronta para o usuário.
          mostrarErro((e && e.message) || 'Não foi possível registrar a medição.');
        }
      });
    },

    // ═══════════ MODAL: aprovar / rejeitar BM ═══════════
    _showModalAprovacaoBm(contractId, nfId, status) {
      const rejeitando = status === 'rejeitada';
      const bm = ((this._medicao && this._medicao.bms) || []).find((b) => b.id === nfId);
      const html = `
        <div class="modal-overlay" id="modalAprovacaoOverlay">
          <div class="modal" style="width:480px;">
            <div class="modal-header">
              <h2 class="modal-title">${rejeitando ? 'Rejeitar BM' : 'Aprovar BM'}</h2>
              <button class="modal-close" id="btnFecharAprovacao" aria-label="Fechar">✕</button>
            </div>
            <div class="modal-content">
              <p style="margin-top:0;font-size:14px;">
                BM <strong>${esc((bm && bm.numero) || nfId)}</strong>
                ${bm ? ` · ${Store.formatBRL(bm.valor)} · líquido ${Store.formatBRL(bm.valorLiquido)}` : ''}
              </p>
              <div class="form-group">
                <label class="form-label" for="aprovObs">${rejeitando ? 'Motivo da rejeição *' : 'Observação'}</label>
                <textarea class="form-control" id="aprovObs" style="min-height:80px;" ${rejeitando ? 'required' : ''}></textarea>
              </div>
              <div id="aprovErro" class="text-danger" style="display:none;font-size:13px;"></div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" id="btnCancelarAprovacao">Cancelar</button>
              <button type="button" class="btn ${rejeitando ? 'btn-danger' : 'btn-primary'}" id="btnConfirmarAprovacao">${rejeitando ? 'Rejeitar' : 'Aprovar'}</button>
            </div>
          </div>
        </div>`;
      document.body.insertAdjacentHTML('beforeend', html);

      const overlay = document.getElementById('modalAprovacaoOverlay');
      const fechar = () => overlay.remove();
      const erroBox = overlay.querySelector('#aprovErro');
      const mostrarErro = (msg) => { erroBox.textContent = msg; erroBox.style.display = 'block'; };

      overlay.querySelector('#btnFecharAprovacao').addEventListener('click', fechar);
      overlay.querySelector('#btnCancelarAprovacao').addEventListener('click', fechar);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) fechar(); });
      setTimeout(() => overlay.querySelector('#aprovObs')?.focus(), 50);

      overlay.querySelector('#btnConfirmarAprovacao').addEventListener('click', async () => {
        const obs = overlay.querySelector('#aprovObs').value.trim();
        const btn = overlay.querySelector('#btnConfirmarAprovacao');
        btn.disabled = true;
        try {
          await Store.aprovarBm(contractId, nfId, { status, obs });
          window.showToast(rejeitando ? 'BM rejeitado' : 'BM aprovado', 'success');
          fechar();
          await this._loadMedicao(contractId);
        } catch (e) {
          btn.disabled = false;
          // Rejeição sem motivo cai aqui com a mensagem do servidor.
          mostrarErro((e && e.message) || 'Não foi possível registrar a aprovação.');
        }
      });
    },
  });
})();
