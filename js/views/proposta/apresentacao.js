/**
 * Aba: Apresentação — campos OPCIONAIS de apresentação da empresa.
 *
 * 3 seções textuais que vão pro DOCX quando preenchidas (vazio = oculto):
 *   - APRESENTAÇÃO          (sobre a empresa, fundação, expertise)
 *   - CASES DE SUCESSO RECENTES   (lista de projetos relevantes)
 *   - SEGURANÇA E SAÚDE     (políticas e certificações)
 *
 * Persistidas em `proposta.metadata` (JSONB existente, sem migration).
 */
(function() {
  function render(container, p, onChange) {
    const md = (p.metadata && typeof p.metadata === 'object') ? p.metadata : {};

    container.innerHTML = `
      <div class="card prop-dados-card">
        <h3 class="prop-section-title">Seções de Apresentação (opcionais)</h3>
        <p class="text-muted" style="font-size:12px;margin:0 0 14px;">
          Estes campos aparecem no DOCX e no Preview no início da proposta, entre Saudação e Objetivo. <strong>Deixe em branco para não exibir.</strong> Use para grandes projetos ou clientes novos onde apresentar a empresa faz sentido.
        </p>

        <div class="form-group prop-fg" style="margin-bottom:14px;">
          <label class="form-label">APRESENTAÇÃO — sobre a Rhino</label>
          <textarea class="form-control" id="pApresentacao" rows="6"
                    placeholder="Ex: Fundada em 2015, a Rhino Manutenções atua em manutenção industrial, montagem de equipamentos, caldeiraria e tubulação para grandes plantas...">${escapeHtml(md.apresentacao || '')}</textarea>
        </div>

        <div class="form-group prop-fg" style="margin-bottom:14px;">
          <label class="form-label">CASES DE SUCESSO RECENTES</label>
          <textarea class="form-control" id="pCasesSucesso" rows="6"
                    placeholder="Ex:&#10;• Suzano — Fabricação de tanque T-401 (2025)&#10;• Arauco — Montagem de tubulação L-202 (2024)&#10;• ...">${escapeHtml(md.casesSucesso || '')}</textarea>
          <small class="form-hint">Use bullets (•) ou hifens (-) no início de cada linha — serão renderizados como lista.</small>
        </div>

        <div class="form-group prop-fg">
          <label class="form-label">SEGURANÇA E SAÚDE</label>
          <textarea class="form-control" id="pSegurancaSaude" rows="6"
                    placeholder="Ex: A Rhino mantém política de segurança alinhada às NRs 10, 33, 34 e 35. Todos os profissionais recebem treinamento prévio e dispomos de SESMT próprio, com técnico de segurança em campo nas obras...">${escapeHtml(md.segurancaSaude || '')}</textarea>
        </div>
      </div>
    `;

    const bindMetadata = (id, key) => {
      const el = container.querySelector('#' + id);
      if (!el) return;
      let timer;
      el.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          const novoMd = { ...(p.metadata || {}), [key]: el.value };
          p.metadata = novoMd;
          onChange({ metadata: novoMd });
        }, 400);
      });
    };
    bindMetadata('pApresentacao',   'apresentacao');
    bindMetadata('pCasesSucesso',   'casesSucesso');
    bindMetadata('pSegurancaSaude', 'segurancaSaude');
  }

  if (window.PropostaDetail) {
    window.PropostaDetail.registerTab({
      id: 'apresentacao',
      label: 'Apresentação',
      icon: '🏢',
      render,
    });
  }
})();
