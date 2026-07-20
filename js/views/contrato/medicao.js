/* Rhino · ContratoDetail · medicao (BM estruturado)
   Aba "Medição": planilha de serviços do contrato + medições (BMs).
   Este módulo cobre a SEÇÃO A (planilha) e o carregamento dos dados;
   a seção B (BMs) fica em medicao-bms.js.

   REGRA: nenhuma regra de negócio aqui. O servidor devolve qtdMedida,
   saldoQtd, valorContratado, valorMedido, saldoValor e avancoPct prontos —
   a view apenas formata e exibe. Erros 400 trazem mensagem em pt-BR pronta
   para o usuário final e são exibidos como recebidos.

   Estende o objeto window.ContratoDetail já definido. */
(function () {
  if (!window.ContratoDetail) {
    console.error('[contrato/medicao] requires ContratoDetail core');
    return;
  }

  const esc = (v) => window.escapeHtml(v);
  const icon = (name, size) => (window.rhIcon ? window.rhIcon(name, size || 15) : '');

  /** Quantidade em pt-BR (até 3 casas, sem zeros à toa). */
  function fmtQtd(v) {
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
  }

  function fmtPct(v) {
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return '0,0%';
    return `${n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  }

  /** Barra de avanço simples — cor por faixa, usando tokens do tema. */
  function barraAvanco(pct) {
    const p = Math.max(0, Math.min(100, parseFloat(pct) || 0));
    const cor = p >= 100 ? 'var(--color-success)' : p > 0 ? 'var(--color-primary)' : 'var(--color-border)';
    return `
      <div style="display:flex;align-items:center;gap:6px;">
        <div style="flex:1;min-width:48px;height:6px;background:var(--color-surface-2);border-radius:99px;overflow:hidden;">
          <div style="height:100%;width:${p}%;background:${cor};border-radius:99px;transition:width .3s;"></div>
        </div>
        <span style="font-size:12px;color:var(--color-text-muted);min-width:46px;text-align:right;">${fmtPct(pct)}</span>
      </div>`;
  }

  function cardVazio(titulo, desc) {
    return `
      <div style="padding:var(--sp-xl);text-align:center;color:var(--color-text-muted);">
        <div style="display:flex;justify-content:center;margin-bottom:var(--sp-sm);opacity:.6;">${icon('list', 28)}</div>
        <div style="font-weight:600;color:var(--color-text);margin-bottom:4px;">${esc(titulo)}</div>
        <div style="font-size:13px;">${esc(desc)}</div>
      </div>`;
  }

  Object.assign(window.ContratoDetail, {
    // Cache da última resposta de GET /api/contracts/:id/medicoes
    _medicao: null,

    // Helpers compartilhados com medicao-bms.js
    _medFmtQtd: fmtQtd,
    _medFmtPct: fmtPct,
    _medBarraAvanco: barraAvanco,
    _medCardVazio: cardVazio,
    _medIcon: icon,

    // ═══════════ SHELL DA ABA ═══════════
    // Render síncrono: devolve os contêineres; os dados chegam em _loadMedicao.
    renderMedicaoSection(contract) {
      return `
        <div id="medicaoRoot" data-contract-id="${esc(contract.id)}">
          <div class="card mb-2xl" id="medicaoPlanilhaCard">
            <div class="card-header"><h3 class="card-title">Planilha de Serviços</h3></div>
            <div style="padding:var(--sp-lg);">
              <div class="skeleton" style="width:70%;margin-bottom:10px;"></div>
              <div class="skeleton" style="width:90%;margin-bottom:10px;"></div>
              <div class="skeleton" style="width:60%;"></div>
            </div>
          </div>
          <div class="card mb-2xl" id="medicaoBmsCard">
            <div class="card-header"><h3 class="card-title">Boletins de Medição</h3></div>
            <div style="padding:var(--sp-lg);">
              <div class="skeleton" style="width:80%;margin-bottom:10px;"></div>
              <div class="skeleton" style="width:55%;"></div>
            </div>
          </div>
        </div>`;
    },

    _medicaoErro(cardId, titulo, msg) {
      const card = document.getElementById(cardId);
      if (!card) return;
      card.innerHTML = `
        <div class="card-header"><h3 class="card-title">${esc(titulo)}</h3></div>
        <div style="padding:var(--sp-lg);">
          <p class="text-danger" style="margin:0;">${esc(msg)}</p>
        </div>`;
    },

    /** Carrega planilha + BMs numa única chamada e repinta as duas seções. */
    async _loadMedicao(contractId) {
      try {
        const data = await Store.getContractMedicoes(contractId);
        this._medicao = { servicos: data.servicos || [], bms: data.bms || [] };
        this._renderMedicaoPlanilha(contractId);
        this._renderMedicaoBms(contractId);
      } catch (e) {
        this._medicao = null;
        const msg = (e && e.message) || 'Erro ao carregar a medição.';
        this._medicaoErro('medicaoPlanilhaCard', 'Planilha de Serviços', msg);
        this._medicaoErro('medicaoBmsCard', 'Boletins de Medição', msg);
      }
    },

    _attachMedicaoListeners(contractId) {
      this._loadMedicao(contractId);
    },

    // ═══════════ (A) PLANILHA DE SERVIÇOS ═══════════
    _renderMedicaoPlanilha(contractId) {
      const card = document.getElementById('medicaoPlanilhaCard');
      if (!card) return;
      const servicos = (this._medicao && this._medicao.servicos) || [];
      const podeEditar = this._podeEditar();

      // Somatórios de valores JÁ CALCULADOS pelo servidor (nenhuma regra aqui).
      const tot = servicos.reduce((acc, s) => ({
        contratado: acc.contratado + (parseFloat(s.valorContratado) || 0),
        medido: acc.medido + (parseFloat(s.valorMedido) || 0),
        saldo: acc.saldo + (parseFloat(s.saldoValor) || 0),
      }), { contratado: 0, medido: 0, saldo: 0 });

      const linhas = servicos.map((s) => {
        const inativo = s.ativo === false;
        return `
          <tr${inativo ? ' style="opacity:.55;"' : ''}>
            <td style="white-space:nowrap;font-family:'Nunito',sans-serif;">${esc(s.codigo || '—')}</td>
            <td>
              <strong>${esc(s.descricao)}</strong>
              ${inativo ? '<span class="badge" style="margin-left:6px;background:var(--color-surface-2);color:var(--color-text-muted);">Inativo</span>' : ''}
            </td>
            <td style="text-align:center;">${esc(s.unidade || 'un')}</td>
            <td style="text-align:right;">${fmtQtd(s.qtdContratada)}</td>
            <td style="text-align:right;">${Store.formatBRL(s.precoUnit)}</td>
            <td style="text-align:right;font-weight:600;">${Store.formatBRL(s.valorContratado)}</td>
            <td style="text-align:right;">${fmtQtd(s.qtdMedida)}</td>
            <td style="text-align:right;color:${(parseFloat(s.saldoQtd) || 0) <= 0 ? 'var(--color-text-muted)' : 'var(--color-text)'};">
              ${fmtQtd(s.saldoQtd)}
              <div style="font-size:11px;color:var(--color-text-muted);">${Store.formatBRL(s.saldoValor)}</div>
            </td>
            <td style="min-width:120px;">${barraAvanco(s.avancoPct)}</td>
            ${podeEditar ? `
            <td style="text-align:center;white-space:nowrap;">
              <button class="btn btn-sm btn-secondary btn-med-editar-servico" data-id="${esc(s.id)}" title="Editar serviço" aria-label="Editar serviço">${icon('edit', 15)}</button>
              <button class="btn btn-sm btn-danger btn-med-excluir-servico" data-id="${esc(s.id)}" title="Excluir serviço" aria-label="Excluir serviço" style="margin-left:4px;">${icon('trash-2', 15)}</button>
            </td>` : ''}
          </tr>`;
      }).join('');

      const colspanTotais = 5;
      card.innerHTML = `
        <div class="card-header">
          <div>
            <h3 class="card-title">Planilha de Serviços</h3>
            <div class="rh-meta-xs">${servicos.length} serviço${servicos.length === 1 ? '' : 's'} · base de cálculo das medições</div>
          </div>
          ${podeEditar ? `<button class="btn btn-primary btn-sm" id="btnMedNovoServico"><span style="display:inline-flex;align-items:center;gap:8px;">${icon('plus', 15)}Adicionar Serviço</span></button>` : ''}
        </div>
        ${servicos.length === 0 ? cardVazio('Nenhum serviço cadastrado', 'Cadastre os serviços do contrato para medir por itens (qtd × preço unitário).') : `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Código</th>
                <th scope="col">Descrição</th>
                <th scope="col" style="text-align:center;">Un.</th>
                <th scope="col" style="text-align:right;">Qtd Contratada</th>
                <th scope="col" style="text-align:right;">Preço Unit.</th>
                <th scope="col" style="text-align:right;">Valor Contratado</th>
                <th scope="col" style="text-align:right;">Qtd Medida</th>
                <th scope="col" style="text-align:right;">Saldo</th>
                <th scope="col">Avanço</th>
                ${podeEditar ? '<th scope="col" style="text-align:center;">Ações</th>' : ''}
              </tr>
            </thead>
            <tbody>${linhas}</tbody>
            <tfoot>
              <tr style="background:var(--color-bg);font-weight:700;">
                <td colspan="${colspanTotais}" style="padding:var(--sp-md);">Totais</td>
                <td style="text-align:right;padding:var(--sp-md);">${Store.formatBRL(tot.contratado)}</td>
                <td style="text-align:right;padding:var(--sp-md);" colspan="2">
                  <span class="rh-meta">Medido</span> ${Store.formatBRL(tot.medido)}
                  <div style="font-weight:600;color:var(--color-text-muted);"><span class="rh-meta">Saldo</span> ${Store.formatBRL(tot.saldo)}</div>
                </td>
                <td${podeEditar ? ' colspan="2"' : ''}></td>
              </tr>
            </tfoot>
          </table>
        </div>`}`;

      document.getElementById('btnMedNovoServico')?.addEventListener('click', () => this._showModalServico(contractId, null));
      card.querySelectorAll('.btn-med-editar-servico').forEach((b) => {
        b.addEventListener('click', () => {
          const item = servicos.find((s) => s.id === b.dataset.id);
          if (item) this._showModalServico(contractId, item);
        });
      });
      card.querySelectorAll('.btn-med-excluir-servico').forEach((b) => {
        b.addEventListener('click', () => this._excluirServico(contractId, b.dataset.id));
      });
    },

    async _excluirServico(contractId, servicoId) {
      const servicos = (this._medicao && this._medicao.servicos) || [];
      const item = servicos.find((s) => s.id === servicoId);
      if (!confirm(`Excluir o serviço "${(item && item.descricao) || servicoId}" da planilha?`)) return;
      try {
        await Store.deleteContractServico(contractId, servicoId);
        window.showToast('Serviço excluído', 'success');
        await this._loadMedicao(contractId);
      } catch (e) {
        // Mensagem do servidor já vem pronta para o usuário (ex.: serviço com medição acumulada).
        window.showToast((e && e.message) || 'Não foi possível excluir o serviço', 'error');
      }
    },

    // ═══════════ MODAL: novo / editar serviço ═══════════
    _showModalServico(contractId, item) {
      const editando = !!item;
      const html = `
        <div class="modal-overlay" id="modalServicoOverlay">
          <div class="modal" style="width:560px;">
            <div class="modal-header">
              <h2 class="modal-title">${editando ? 'Editar Serviço' : 'Novo Serviço'}</h2>
              <button class="modal-close" id="btnFecharModalServico" aria-label="Fechar">✕</button>
            </div>
            <form id="formServico" class="modal-content">
              <div class="form-row" style="display:grid;grid-template-columns:1fr 2fr;gap:var(--sp-md);">
                <div class="form-group">
                  <label class="form-label" for="srvCodigo">Código</label>
                  <input class="form-control" id="srvCodigo" name="codigo" value="${esc(item?.codigo || '')}" placeholder="1.01">
                </div>
                <div class="form-group">
                  <label class="form-label" for="srvUnidade">Unidade *</label>
                  <input class="form-control" id="srvUnidade" name="unidade" value="${esc(item?.unidade || 'un')}" placeholder="un, m, m², kg, h">
                </div>
              </div>
              <div class="form-group">
                <label class="form-label" for="srvDescricao">Descrição *</label>
                <input class="form-control" id="srvDescricao" name="descricao" value="${esc(item?.descricao || '')}" required>
              </div>
              <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-md);">
                <div class="form-group">
                  <label class="form-label" for="srvQtd">Qtd Contratada *</label>
                  <input class="form-control" id="srvQtd" name="qtdContratada" type="number" step="0.001" min="0" value="${esc(item?.qtdContratada ?? '')}" required>
                  ${editando ? `<div class="rh-meta-xs" style="margin-top:4px;">Já medido: ${fmtQtd(item.qtdMedida)} ${esc(item.unidade || 'un')}</div>` : ''}
                </div>
                <div class="form-group">
                  <label class="form-label" for="srvPreco">Preço Unitário (R$) *</label>
                  <input class="form-control" id="srvPreco" name="precoUnit" type="number" step="0.01" min="0" value="${esc(item?.precoUnit ?? '')}" required>
                </div>
              </div>
              ${editando ? `
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px;">
                <input type="checkbox" id="srvAtivo" name="ativo" ${item.ativo === false ? '' : 'checked'}>
                Serviço ativo (disponível para novas medições)
              </label>` : ''}
              <div id="srvErro" class="text-danger" style="display:none;margin-top:var(--sp-md);font-size:13px;"></div>
            </form>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" id="btnCancelarServico">Cancelar</button>
              <button type="button" class="btn btn-primary" id="btnSalvarServico">${editando ? 'Salvar' : 'Adicionar'}</button>
            </div>
          </div>
        </div>`;
      document.body.insertAdjacentHTML('beforeend', html);

      const overlay = document.getElementById('modalServicoOverlay');
      const fechar = () => overlay.remove();
      const erroBox = overlay.querySelector('#srvErro');
      const mostrarErro = (msg) => {
        erroBox.textContent = msg;
        erroBox.style.display = 'block';
      };

      overlay.querySelector('#btnFecharModalServico').addEventListener('click', fechar);
      overlay.querySelector('#btnCancelarServico').addEventListener('click', fechar);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) fechar(); });
      setTimeout(() => overlay.querySelector('#srvCodigo')?.focus(), 50);

      const salvar = async () => {
        const form = overlay.querySelector('#formServico');
        const data = {
          codigo: form.codigo.value.trim(),
          descricao: form.descricao.value.trim(),
          unidade: form.unidade.value.trim() || 'un',
          qtdContratada: parseFloat(form.qtdContratada.value),
          precoUnit: parseFloat(form.precoUnit.value),
        };
        if (editando) data.ativo = overlay.querySelector('#srvAtivo').checked;
        const btn = overlay.querySelector('#btnSalvarServico');
        btn.disabled = true;
        try {
          if (editando) {
            await Store.updateContractServico(contractId, item.id, data);
          } else {
            await Store.createContractServico(contractId, data);
          }
          window.showToast(editando ? 'Serviço atualizado' : 'Serviço adicionado', 'success');
          fechar();
          await this._loadMedicao(contractId);
        } catch (e) {
          btn.disabled = false;
          // 400 do servidor: mensagem em pt-BR pronta (ex.: BR-MED-005).
          mostrarErro((e && e.message) || 'Não foi possível salvar o serviço.');
        }
      };

      overlay.querySelector('#btnSalvarServico').addEventListener('click', salvar);
      overlay.querySelector('#formServico').addEventListener('submit', (e) => { e.preventDefault(); salvar(); });
    },
  });
})();
