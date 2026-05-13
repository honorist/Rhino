/**
 * Aba: Dados Gerais — cliente, referência, título, tipo, signatário, datas
 */
(function() {
  function render(container, p, onChange) {
    const clientes = (window.Store?.state?.clientes) || [];
    container.innerHTML = `
      <div class="card" style="padding:24px;">
        <h3 style="margin-top:0;color:#1F497D;border-bottom:2px solid #1F497D;padding-bottom:8px;">Identificação do Cliente</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
          <div class="form-group" style="grid-column:1/-1;">
            <label class="form-label">Cliente cadastrado (puxa dados automaticamente)</label>
            <select class="form-control" id="pSelectCliente">
              <option value="">— Sem cliente vinculado (preenchimento manual) —</option>
              ${clientes.map(c => `
                <option value="${c.id}" ${p.clienteId === c.id ? 'selected' : ''}>
                  ${escapeHtml(c.empresa || c.nome)}${c.nome && c.empresa && c.nome !== c.empresa ? ' (' + escapeHtml(c.nome) + ')' : ''}
                </option>
              `).join('')}
            </select>
            <small class="form-hint">Mudar o cliente substitui empresa/contato/email/telefone. Snapshots ficam guardados na proposta mesmo se o cliente for apagado depois.</small>
          </div>
          <div class="form-group">
            <label class="form-label">Empresa (Razão social)</label>
            <input type="text" class="form-control" id="pClienteEmpresa" value="${escapeHtml(p.clienteEmpresa || '')}">
          </div>
          <div class="form-group">
            <label class="form-label">CNPJ</label>
            <input type="text" class="form-control" id="pClienteDocumento" value="${escapeHtml(p.clienteDocumento || '')}">
          </div>
          <div class="form-group">
            <label class="form-label">Att.: (Contato)</label>
            <input type="text" class="form-control" id="pClienteContato" value="${escapeHtml(p.clienteContato || '')}" placeholder="Ex: Engº João da Silva">
          </div>
          <div class="form-group">
            <label class="form-label">Cargo</label>
            <input type="text" class="form-control" id="pClienteCargo" value="${escapeHtml(p.clienteCargo || '')}" placeholder="Ex: Coordenador de Manutenção">
          </div>
          <div class="form-group">
            <label class="form-label">Email</label>
            <input type="email" class="form-control" id="pClienteEmail" value="${escapeHtml(p.clienteEmail || '')}">
          </div>
          <div class="form-group">
            <label class="form-label">Telefone</label>
            <input type="text" class="form-control" id="pClienteTelefone" value="${escapeHtml(p.clienteTelefone || '')}">
          </div>
          <div class="form-group" style="grid-column:1/-1;">
            <label class="form-label">Endereço da obra</label>
            <input type="text" class="form-control" id="pClienteEndereco" value="${escapeHtml(p.clienteEndereco || '')}">
          </div>
        </div>

        <h3 style="color:#1F497D;border-bottom:2px solid #1F497D;padding-bottom:8px;">Identificação da Proposta</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
          <div class="form-group" style="grid-column:1/-1;">
            <label class="form-label">Título do serviço *</label>
            <input type="text" class="form-control" id="pTitulo" value="${escapeHtml(p.titulo || '')}" required>
          </div>
          <div class="form-group" style="grid-column:1/-1;">
            <label class="form-label">Ref.: (Identificação da obra)</label>
            <input type="text" class="form-control" id="pReferencia" value="${escapeHtml(p.referencia || '')}" placeholder="Ex: Tanque T-401 — Linha L-202">
          </div>
          <div class="form-group">
            <label class="form-label">Tipo</label>
            <select class="form-control" id="pTipo">
              <option value="hh"       ${p.tipo === 'hh' ? 'selected' : ''}>Mão de Obra (HH)</option>
              <option value="material" ${p.tipo === 'material' ? 'selected' : ''}>Material</option>
              <option value="ambos"    ${p.tipo === 'ambos' ? 'selected' : ''}>HH + Material</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Data de emissão</label>
            <input type="date" class="form-control" id="pDataEmissao" value="${p.dataEmissao || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Validade (dias)</label>
            <input type="number" class="form-control" id="pValidadeDias" min="1" max="365" value="${p.validadeDias || 15}">
          </div>
          <div class="form-group">
            <label class="form-label">Garantia (meses) — opcional</label>
            <input type="number" class="form-control" id="pGarantiaMeses" min="0" max="60" value="${p.garantiaMeses ?? ''}" placeholder="Deixe vazio para sem garantia">
            <small class="form-hint">18 = padrão para fabricação; 12 = padrão para serviço; vazio = sem garantia.</small>
          </div>
        </div>

        <h3 style="color:#1F497D;border-bottom:2px solid #1F497D;padding-bottom:8px;">Texto de Abertura</h3>
        <div class="form-group" style="margin-bottom:16px;">
          <label class="form-label">Objetivo</label>
          <textarea class="form-control" id="pObjetivo" rows="4" placeholder="Descrição do que a proposta visa atender...">${escapeHtml(p.objetivo || '')}</textarea>
        </div>
        <div class="form-group" style="margin-bottom:16px;">
          <label class="form-label">Saudação (parágrafo de abertura)</label>
          <textarea class="form-control" id="pSaudacao" rows="3" placeholder="Em atendimento à solicitação de fornecimento...">${escapeHtml(p.saudacao || 'Em atendimento à solicitação de fornecimento, a Rhino Manutenções apresenta a seguinte proposta comercial para sua apreciação.')}</textarea>
        </div>

        <h3 style="color:#1F497D;border-bottom:2px solid #1F497D;padding-bottom:8px;">Encerramento</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
          <div class="form-group">
            <label class="form-label">Signatário</label>
            <input type="text" class="form-control" id="pSignatario" value="${escapeHtml(p.signatario || 'Deyvison Veloso')}">
          </div>
          <div class="form-group">
            <label class="form-label">Cargo</label>
            <input type="text" class="form-control" id="pSignatarioCargo" value="${escapeHtml(p.signatarioCargo || 'Diretor')}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Observações finais (opcional)</label>
          <textarea class="form-control" id="pObservacoes" rows="3">${escapeHtml(p.observacoes || '')}</textarea>
        </div>
      </div>
    `;

    // Binds — campos simples disparam onChange direto
    const bindText = (id, key) => {
      const el = container.querySelector('#' + id);
      if (!el) return;
      el.addEventListener('input', () => onChange({ [key]: el.value }));
    };
    bindText('pClienteEmpresa',  'clienteEmpresa');
    bindText('pClienteDocumento','clienteDocumento');
    bindText('pClienteContato',  'clienteContato');
    bindText('pClienteCargo',    'clienteCargo');
    bindText('pClienteEmail',    'clienteEmail');
    bindText('pClienteTelefone', 'clienteTelefone');
    bindText('pClienteEndereco', 'clienteEndereco');
    bindText('pTitulo',          'titulo');
    bindText('pReferencia',      'referencia');
    bindText('pTipo',            'tipo');
    bindText('pDataEmissao',     'dataEmissao');
    bindText('pObjetivo',        'objetivo');
    bindText('pSaudacao',        'saudacao');
    bindText('pSignatario',      'signatario');
    bindText('pSignatarioCargo', 'signatarioCargo');
    bindText('pObservacoes',     'observacoes');

    const validadeEl = container.querySelector('#pValidadeDias');
    if (validadeEl) validadeEl.addEventListener('input', () => onChange({ validadeDias: parseInt(validadeEl.value, 10) || 15 }));

    const garantiaEl = container.querySelector('#pGarantiaMeses');
    if (garantiaEl) garantiaEl.addEventListener('input', () => {
      const v = garantiaEl.value;
      onChange({ garantiaMeses: v === '' ? null : parseInt(v, 10) });
    });

    // Mudança de cliente: auto-preenche campos
    const selectCli = container.querySelector('#pSelectCliente');
    if (selectCli) {
      selectCli.addEventListener('change', () => {
        const id = selectCli.value;
        if (!id) {
          onChange({ clienteId: null });
          return;
        }
        const c = clientes.find(x => x.id === id);
        if (!c) return;
        const patch = {
          clienteId: id,
          clienteNome:      c.nome || null,
          clienteEmpresa:   c.empresa || c.nome || null,
          clienteContato:   c.nome || null,
          clienteCargo:     c.cargo || null,
          clienteEmail:     c.email || null,
          clienteTelefone:  c.telefone || null,
          clienteEndereco:  c.endereco || null,
        };
        onChange(patch);
        // Atualiza inputs visuais
        container.querySelector('#pClienteEmpresa').value  = patch.clienteEmpresa || '';
        container.querySelector('#pClienteContato').value  = patch.clienteContato || '';
        container.querySelector('#pClienteCargo').value    = patch.clienteCargo || '';
        container.querySelector('#pClienteEmail').value    = patch.clienteEmail || '';
        container.querySelector('#pClienteTelefone').value = patch.clienteTelefone || '';
        container.querySelector('#pClienteEndereco').value = patch.clienteEndereco || '';
      });
    }
  }

  if (window.PropostaDetail) {
    window.PropostaDetail.registerTab({
      id: 'dados',
      label: 'Dados Gerais',
      icon: '📋',
      render,
    });
  }
})();
