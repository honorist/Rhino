/* Rhino · ContratoDetail · modais-extra
   Extraído de js/views/ContratoDetail.js (linhas 5487-5914)
   Estende o objeto window.ContratoDetail já definido. */
(function () {
  if (!window.ContratoDetail) {
    console.error('[contrato/modais-extra] requires ContratoDetail core');
    return;
  }
  Object.assign(window.ContratoDetail, {
    showModalExcluirContrato(contract) {
      const html = `
      <div class="modal-overlay" id="modalOverlayExcluir">
        <div class="modal" style="width: 480px;">
          <div class="modal-header">
            <h2 class="modal-title" style="color: var(--color-danger);">⚠️ Excluir Contrato</h2>
            <button class="modal-close">✕</button>
          </div>
          <div class="modal-content" style="padding: var(--sp-lg);">
            <p style="margin: 0 0 var(--sp-md) 0;">
              Você está prestes a <strong>excluir permanentemente</strong> o contrato:
            </p>
            <div style="padding: var(--sp-md); background: var(--color-surface-2); border-radius: 6px; margin-bottom: var(--sp-lg); border-left: 3px solid var(--color-danger);">
              <div style="font-weight: 700; font-size: 15px;">${escapeHtml(contract.name)}</div>
              <div class="text-muted font-sm">${escapeHtml(contract.client || '')}</div>
            </div>
            <div style="padding: var(--sp-md); background: rgba(220, 38, 38, 0.08); border-radius: 6px; margin-bottom: var(--sp-lg); border: 1px solid rgba(220, 38, 38, 0.3);">
              <p style="margin: 0; font-size: 13px; color: var(--color-danger); font-weight: 600;">
                Esta ação é IRREVERSÍVEL. TODOS os dados abaixo serão apagados:
              </p>
              <ul style="margin: 8px 0 0 20px; font-size: 13px; color: var(--color-text-muted);">
                <li>Saídas e medições</li>
                <li>Organograma e equipe alocada</li>
                <li>RDOs e fotos vinculadas</li>
                <li>Itens de orçamento</li>
                <li><strong>Notas fiscais / Contas a Receber</strong> deste contrato</li>
                <li><strong>Contas a Pagar</strong> vinculadas</li>
                <li><strong>Lançamentos de Caixa</strong> deste contrato (saldo do caixa será recalculado)</li>
                <li>Aportes/Investimentos vinculados</li>
              </ul>
            </div>
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label" style="font-weight: 600;">
                Para confirmar, digite <strong style="color: var(--color-danger); font-family: monospace;">DELETAR</strong> abaixo:
              </label>
              <input
                type="text"
                class="form-control"
                id="inputConfirmacaoDeletar"
                placeholder="DELETAR"
                autocomplete="off"
                spellcheck="false"
                style="font-family: monospace; letter-spacing: 1px; font-size: 15px;">
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelarExcluir">Cancelar</button>
            <button class="btn btn-danger" id="btnConfirmarExcluir" disabled><span style="display:inline-flex;align-items:center;gap:8px;">${window.rhIcon('trash-2', 15)}Excluir Contrato</span></button>
          </div>
        </div>
      </div>
    `;

      document.body.insertAdjacentHTML('beforeend', html);

      const overlay = document.getElementById('modalOverlayExcluir');
      const closeModal = () => overlay.remove();

      overlay.querySelector('.modal-close').addEventListener('click', closeModal);
      document.getElementById('btnCancelarExcluir').addEventListener('click', closeModal);

      const input = document.getElementById('inputConfirmacaoDeletar');
      const btnConfirmar = document.getElementById('btnConfirmarExcluir');

      input.addEventListener('input', () => {
        btnConfirmar.disabled = input.value.trim() !== 'DELETAR';
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !btnConfirmar.disabled) {
          e.preventDefault();
          btnConfirmar.click();
        }
      });

      setTimeout(() => input.focus(), 50);

      btnConfirmar.addEventListener('click', async () => {
        if (input.value.trim() !== 'DELETAR') return;
        btnConfirmar.disabled = true;
        btnConfirmar.textContent = 'Excluindo...';
        try {
          await Store.deleteContract(contract.id);
          // Recarrega tudo: o cascade apaga caixa/contas_pagar/notas_fiscais/investimentos
          // que o endpoint não devolve no envelope — sem reload o Store fica com dados zumbis.
          await Store.loadAll();
          window.showToast('Contrato excluído com sucesso', 'success');
          closeModal();
          location.hash = '#/contratos';
        } catch (e) {
          window.showToast(e.message || 'Erro ao excluir contrato', 'error');
          btnConfirmar.disabled = false;
          btnConfirmar.innerHTML = '🗑️ Excluir Contrato';
        }
      });
    },

    showModalSaida(contractId, saidaId) {
      const saida = saidaId ? Store.state.saidas.find((s) => s.id === saidaId) : null;
      const title = saida ? 'Editar Saída' : 'Nova Saída';

      const html = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal">
          <div class="modal-header">
            <h2 class="modal-title">${title}</h2>
            <button class="modal-close">✕</button>
          </div>
          <form id="formSaida" class="modal-content">
            <div class="form-group">
              <label class="form-label" for="saiDescricao">Descrição *</label>
              <input class="form-control" id="saiDescricao" name="description" value="${escapeHtml(saida?.description || '')}" required>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label" for="saiTipo">Tipo *</label>
                <select class="form-control" id="saiTipo" name="type" required>
                  <option value="mao_de_obra" ${saida?.type === 'mao_de_obra' ? 'selected' : ''}>Mão de Obra</option>
                  <option value="material" ${saida?.type === 'material' ? 'selected' : ''}>Material</option>
                  <option value="hospedagem" ${saida?.type === 'hospedagem' ? 'selected' : ''}>Hospedagem</option>
                  <option value="transporte" ${saida?.type === 'transporte' ? 'selected' : ''}>Transporte</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label" for="saiValor">Valor (BRL) *</label>
                <input class="form-control" id="saiValor" name="value" type="text" data-currency inputmode="numeric" value="${saida?.value ? window.BRLInput.toDisplay(saida.value) : ''}" placeholder="0,00" required>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label" for="saiData">Data</label>
                <input class="form-control" id="saiData" name="date" type="date" value="${escapeHtml(saida?.date || new Date().toISOString().split('T')[0])}">
              </div>
              <div class="form-group">
                <label class="form-label">Prazo recebimento (dias)</label>
                <input class="form-control" name="prazoRecebimento" type="number" min="0" max="365"
                  value="${(() => {
                    const nfRef = saida?.nfId
                      ? (Store.state.notas_fiscais || []).find((n) => n.id === saida.nfId)
                      : null;
                    return nfRef?.prazoRecebimento ?? 30;
                  })()}">
              </div>
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelar">Cancelar</button>
            <button class="btn btn-primary" id="btnSalvar">${saida ? 'Atualizar' : 'Criar'}</button>
          </div>
        </div>
      </div>
    `;

      document.body.insertAdjacentHTML('beforeend', html);

      const overlay = document.getElementById('modalOverlay');
      setTimeout(() => {
        const firstInput = overlay?.querySelector(
          'input:not([type="hidden"]):not([readonly]), select, textarea'
        );
        firstInput?.focus();
      }, 50);
      const closeModal = () => overlay.remove();

      overlay.querySelector('.modal-close').addEventListener('click', closeModal);
      document.getElementById('btnCancelar').addEventListener('click', closeModal);

      document.getElementById('btnSalvar').addEventListener('click', async () => {
        const formData = new FormData(document.getElementById('formSaida'));
        const data = Object.fromEntries(formData);
        data.value = window.BRLInput.parse(data.value);
        if (data.prazoRecebimento !== undefined && data.prazoRecebimento !== '') {
          data.prazoRecebimento = Number.isFinite(parseInt(data.prazoRecebimento))
            ? parseInt(data.prazoRecebimento)
            : 30;
        }

        try {
          if (saida) {
            await Store.updateSaida(saidaId, data);
            window.showToast('Saída atualizada', 'success');
          } else {
            await Store.createSaida(contractId, data);
            window.showToast('Saída adicionada', 'success');
          }
          closeModal();
          this.render({ id: contractId });
        } catch (e) {
          window.showToast(e.message, 'error');
        }
      });
    },

    showModalOrcamento(contractId, item) {
      const TIPOS = [
        { key: 'mao_de_obra', label: 'Mão de Obra' },
        { key: 'material', label: 'Material' },
        { key: 'hospedagem', label: 'Hospedagem' },
        { key: 'transporte', label: 'Transporte' },
        { key: 'base', label: 'Custo BASE' },
        { key: 'outros', label: 'Outros' },
      ];
      const title = item ? 'Editar Item do Orçamento' : 'Novo Item do Orçamento';

      const html = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal">
          <div class="modal-header">
            <h2 class="modal-title">${title}</h2>
            <button class="modal-close">✕</button>
          </div>
          <form id="formOrcamento" class="modal-content">
            <div class="form-group">
              <label class="form-label" for="orcDescricao">Descrição *</label>
              <input class="form-control" id="orcDescricao" name="description" value="${escapeHtml(item?.description || '')}" placeholder="Ex: Equipe de campo, aço, diárias..." required>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label" for="orcCategoria">Categoria *</label>
                <select class="form-control" id="orcCategoria" name="type" required>
                  ${TIPOS.map((t) => `<option value="${t.key}" ${item?.type === t.key ? 'selected' : ''}>${t.label}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label" for="orcValor">Valor Orçado (BRL) *</label>
                <input class="form-control" id="orcValor" name="value" type="text" data-currency inputmode="numeric" value="${item?.value ? window.BRLInput.toDisplay(item.value) : ''}" placeholder="0,00" required>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label" for="orcNotes">Observações</label>
              <textarea class="form-control" id="orcNotes" name="notes" style="min-height:60px;" placeholder="Detalhes adicionais...">${window.escapeHtml(item?.notes || '')}</textarea>
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelar">Cancelar</button>
            <button class="btn btn-primary" id="btnSalvar">${item ? 'Atualizar' : 'Adicionar'}</button>
          </div>
        </div>
      </div>
    `;

      document.body.insertAdjacentHTML('beforeend', html);
      const overlay = document.getElementById('modalOverlay');
      setTimeout(() => {
        const firstInput = overlay?.querySelector(
          'input:not([type="hidden"]):not([readonly]), select, textarea'
        );
        firstInput?.focus();
      }, 50);
      const close = () => overlay.remove();
      overlay.querySelector('.modal-close').addEventListener('click', close);
      document.getElementById('btnCancelar').addEventListener('click', close);
      document.getElementById('btnSalvar').addEventListener('click', async () => {
        const fd = new FormData(document.getElementById('formOrcamento'));
        const data = Object.fromEntries(fd);
        data.value = window.BRLInput.parse(data.value);
        if (!data.description.trim()) {
          window.showToast('Descrição obrigatória', 'error');
          return;
        }
        if (!data.value || data.value <= 0) {
          window.showToast('Informe um valor válido', 'error');
          return;
        }

        try {
          if (item) {
            await Store.updateBudgetItem(contractId, item.id, data);
            window.showToast('Item atualizado', 'success');
          } else {
            await Store.createBudgetItem(contractId, data);
            window.showToast('Item adicionado ao orçamento', 'success');
          }
          close();
          this.render({ id: contractId });
        } catch (e) {
          window.showToast(e.message, 'error');
        }
      });
    },

    async deleteBudgetItem(contractId, itemId) {
      if (!confirm('Excluir este item do orçamento?')) return;
      try {
        await Store.deleteBudgetItem(contractId, itemId);
        window.showToast('Item removido', 'success');
        this.render({ id: contractId });
      } catch (e) {
        window.showToast(e.message, 'error');
      }
    },

    async deleteSaida(id) {
      if (!confirm('Excluir esta saída?')) return;
      try {
        const saida = Store.state.saidas.find((s) => s.id === id);
        const contractId = saida?.contractId;
        await Store.deleteSaida(id);
        window.showToast('Saída excluída', 'success');
        if (contractId) this.render({ id: contractId });
      } catch (e) {
        window.showToast(e.message, 'error');
      }
    },

    showDetalheComposicao(
      tipo,
      saidas,
      saidasByType,
      passagensRealizadas,
      passagensPendentes,
      baseAllocations
    ) {
      const TIPO_MAP = {
        'Mão de Obra': 'mao_de_obra',
        Material: 'material',
        Hospedagem: 'hospedagem',
        Transporte: 'transporte',
      };
      const CORES = {
        'Mão de Obra': '#7C3AED',
        Material: '#D97706',
        Hospedagem: '#0891B2',
        Transporte: '#059669',
        '✈ Passagens': '#A855F7',
        'BASE Alocada': '#3182CE',
      };
      const cor = CORES[tipo] || '#6B7280';

      let linhas = [];

      if (tipo === '✈ Passagens') {
        linhas = [
          ...passagensRealizadas.map((e) => ({
            data: e.date,
            descricao: e.description,
            valor: parseFloat(e.value) || 0,
            status: 'realizado',
            badge: `<span class="badge" style="background:#D1FAE5;color:#065F46;">✔ Pago</span>`,
          })),
          ...passagensPendentes.map((c) => ({
            data: c.dataVencimento || '',
            descricao: c.descricao,
            valor: parseFloat(c.valor) || 0,
            status: 'pendente',
            badge: `<span class="badge" style="background:#EDE9FE;color:#5B21B6;">⏳ Pendente</span>`,
          })),
        ];
      } else if (tipo === 'BASE Alocada') {
        linhas = baseAllocations.map((a) => ({
          data: a.date,
          descricao: a.baseDescription,
          valor: parseFloat(a.value) || 0,
          status: 'realizado',
          badge: `<span class="badge" style="background:rgba(49,130,206,.15);color:#3182CE;">⚙️ BASE</span>`,
        }));
      } else if (tipo === 'Transporte') {
        const diretas = saidas.filter((s) => s.type === 'transporte');
        linhas = [
          ...diretas.map((s) => ({
            data: s.date,
            descricao: s.description,
            valor: parseFloat(s.value) || 0,
            status: 'realizado',
            badge: `<span class="badge" style="background:#D1FAE5;color:#065F46;">✔ Saída</span>`,
          })),
          ...passagensRealizadas.map((e) => ({
            data: e.date,
            descricao: e.description,
            valor: parseFloat(e.value) || 0,
            status: 'realizado',
            badge: `<span class="badge" style="background:#EDE9FE;color:#5B21B6;">✈ Passagem</span>`,
          })),
        ];
      } else {
        const key = TIPO_MAP[tipo];
        if (key) {
          linhas = saidas
            .filter((s) => s.type === key)
            .map((s) => ({
              data: s.date,
              descricao: s.description,
              valor: parseFloat(s.value) || 0,
              status: 'realizado',
              badge: `<span class="badge" style="background:${cor}18;color:${cor};">✔ Saída</span>`,
            }));
        }
      }

      linhas.sort((a, b) => (b.data || '').localeCompare(a.data || ''));
      const total = linhas.filter((l) => l.status === 'realizado').reduce((s, l) => s + l.valor, 0);
      const totalPrev = linhas
        .filter((l) => l.status === 'pendente')
        .reduce((s, l) => s + l.valor, 0);

      const html = `
      <div class="modal-overlay" id="modalDetalheComp">
        <div class="modal" style="width:700px;max-width:95vw;">
          <div class="modal-header" style="border-left:4px solid ${cor};">
            <h2 class="modal-title">${tipo} — Detalhamento</h2>
            <button class="modal-close">✕</button>
          </div>
          <div class="modal-content" style="padding:0;">
            ${
              linhas.length === 0
                ? `
              <div style="padding:var(--sp-xl);text-align:center;color:var(--color-text-muted);">
                <div style="font-size:28px;margin-bottom:var(--sp-sm);">📭</div>
                <div>Nenhum lançamento encontrado para esta categoria</div>
              </div>
            `
                : `
              <div class="table-wrap" style="margin:0;">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Data</th>
                      <th scope="col">Descrição</th>
                      <th scope="col">Status</th>
                      <th scope="col" class="rh-text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${linhas
                      .map(
                        (l) => `
                      <tr style="${l.status === 'pendente' ? 'opacity:.7;background:rgba(124,58,237,.04);' : ''}">
                        <td style="font-size:15px;white-space:nowrap;">${l.data ? new Date(l.data + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                        <td><strong style="font-size:15px;">${escapeHtml(l.descricao || '')}</strong></td>
                        <td>${l.badge}</td>
                        <td style="text-align:right;font-weight:700;font-family:'Nunito',sans-serif;${l.status === 'pendente' ? 'color:#7C3AED;' : ''}">${Store.formatBRL(l.valor)}</td>
                      </tr>
                    `
                      )
                      .join('')}
                  </tbody>
                  <tfoot>
                    <tr style="background:var(--color-bg);font-weight:700;">
                      <td colspan="3" style="padding:var(--sp-md);">Total realizado</td>
                      <td style="text-align:right;padding:var(--sp-md);color:${cor};">${Store.formatBRL(total)}</td>
                    </tr>
                    ${
                      totalPrev > 0
                        ? `
                    <tr style="background:rgba(124,58,237,.06);font-weight:700;">
                      <td colspan="3" style="padding:var(--sp-md);color:#7C3AED;">⏳ Previsto (pendente)</td>
                      <td style="text-align:right;padding:var(--sp-md);color:#7C3AED;">${Store.formatBRL(totalPrev)}</td>
                    </tr>`
                        : ''
                    }
                  </tfoot>
                </table>
              </div>
            `
            }
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnFecharDetalhe">Fechar</button>
          </div>
        </div>
      </div>
    `;

      document.body.insertAdjacentHTML('beforeend', html);
      const overlay = document.getElementById('modalDetalheComp');
      const close = () => overlay.remove();
      overlay.querySelector('.modal-close').addEventListener('click', close);
      document.getElementById('btnFecharDetalhe').addEventListener('click', close);
    },

    // ── F3: Contract Templates → PDF ──
    async showModalGerarDocumento(contract) {
      const templates = (Store.state.docTemplates || Store.state.doc_templates || []).filter(
        (t) => t.body
      );
      if (templates.length === 0) {
        window.showToast(
          'Nenhum template com corpo de texto. Crie um em Configurações → Templates.',
          'warn'
        );
        return;
      }

      const html = `
      <div class="modal-overlay" id="modalGerarDoc">
        <div class="modal" style="width:640px;">
          <div class="modal-header">
            <h2 class="modal-title"><span style="display:inline-flex;align-items:center;gap:8px;">${window.rhIcon('file-text', 18)}Gerar Documento do Contrato</span></h2>
            <button class="modal-close">✕</button>
          </div>
          <div class="modal-content">
            <div class="form-group">
              <label class="form-label">Template</label>
              <select class="form-control" id="selTemplate">
                ${templates.map((t) => `<option value="${escapeHtml(String(t.id))}">${escapeHtml(t.nome)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Pré-visualização (variáveis serão substituídas)</label>
              <textarea id="docPreview" class="form-control" rows="14" style="font-family:monospace;font-size:13px;"></textarea>
            </div>
            <p style="font-size:13px;color:var(--color-text-muted);">
              Variáveis disponíveis: <code>{{cliente}}</code>, <code>{{contrato}}</code>, <code>{{valor}}</code>, <code>{{inicio}}</code>, <code>{{fim}}</code>, <code>{{data}}</code>
            </p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelarDoc">Cancelar</button>
            <button class="btn btn-primary" id="btnGerarPdf"><span style="display:inline-flex;align-items:center;gap:8px;">${window.rhIcon('file-text', 15)}Gerar PDF</span></button>
          </div>
        </div>
      </div>`;

      document.body.insertAdjacentHTML('beforeend', html);
      const overlay = document.getElementById('modalGerarDoc');
      setTimeout(() => {
        const firstInput = overlay?.querySelector(
          'input:not([type="hidden"]):not([readonly]), select, textarea'
        );
        firstInput?.focus();
      }, 50);
      const close = () => overlay.remove();
      overlay.querySelector('.modal-close').addEventListener('click', close);
      document.getElementById('btnCancelarDoc').addEventListener('click', close);
      const fmt = (v) => (v ? new Date(v + 'T12:00:00').toLocaleDateString('pt-BR') : '');
      const fmtBRL = (v) =>
        'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

      const fillVars = (body) =>
        body
          .replace(/\{\{cliente\}\}/gi, contract.client || '')
          .replace(/\{\{contrato\}\}/gi, contract.name || '')
          .replace(/\{\{numero\}\}/gi, contract.contractNumber || '')
          .replace(/\{\{valor\}\}/gi, fmtBRL(contract.value))
          .replace(/\{\{inicio\}\}/gi, fmt(contract.startDate))
          .replace(/\{\{fim\}\}/gi, fmt(contract.endDate))
          .replace(/\{\{data\}\}/gi, new Date().toLocaleDateString('pt-BR'))
          .replace(/\{\{endereco\}\}/gi, contract.endereco || '');

      const sel = document.getElementById('selTemplate');
      const preview = document.getElementById('docPreview');
      const updatePreview = () => {
        const tpl = templates.find((t) => t.id === sel.value);
        if (tpl) preview.value = fillVars(tpl.body || '');
      };
      sel.addEventListener('change', updatePreview);
      updatePreview();

      document.getElementById('btnGerarPdf').addEventListener('click', async () => {
        const conteudo = preview.value;
        const tpl = templates.find((t) => t.id === sel.value);
        try {
          await window.RhinoLazy.ensure(['jspdf']);
          const { jsPDF } = window.jspdf;
          const doc = new jsPDF({ unit: 'mm', format: 'a4' });
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(11);
          const lines = doc.splitTextToSize(conteudo, 170);
          let y = 25;
          for (const line of lines) {
            if (y > 270) {
              doc.addPage();
              y = 25;
            }
            doc.text(line, 20, y);
            y += 6;
          }
          const fname = `${(tpl?.nome || 'documento').replace(/[^a-zA-Z0-9]/g, '_')}_${contract.id}.pdf`;
          doc.save(fname);
          close();
          window.showToast('PDF gerado!', 'success');
        } catch (e) {
          window.showToast('Erro ao gerar PDF: ' + e.message, 'error');
        }
      });
    },
  });
})();
