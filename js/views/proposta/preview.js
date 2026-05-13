/**
 * Aba: Preview — renderiza a proposta como HTML timbrado num iframe sandbox.
 * Server-side `/api/propostas/:id/preview` retorna o HTML completo.
 */
(function() {
  function render(container, p, onChange) {
    container.innerHTML = `
      <div class="card" style="padding:0;overflow:hidden;">
        <div style="padding:14px 20px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <div>
            <strong>Preview do documento</strong>
            <p class="text-muted" style="margin:2px 0 0;font-size:12px;">Visualização do que será gerado em DOCX e PDF. Dados salvos automaticamente.</p>
          </div>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-secondary" id="btnRecarregarPreview">↻ Recarregar</button>
            <button class="btn btn-secondary" id="btnAbrirNova">↗ Abrir em nova aba</button>
          </div>
        </div>
        <div style="position:relative;height:calc(100vh - 280px);min-height:600px;background:#525659;">
          <iframe id="iframePreview" src="/api/propostas/${p.id}/preview" sandbox="allow-same-origin" style="border:none;width:100%;height:100%;background:white;"></iframe>
        </div>
      </div>
    `;

    container.querySelector('#btnRecarregarPreview')?.addEventListener('click', () => {
      const ifr = container.querySelector('#iframePreview');
      if (ifr) ifr.src = `/api/propostas/${p.id}/preview?t=${Date.now()}`;
    });
    container.querySelector('#btnAbrirNova')?.addEventListener('click', () => {
      window.open(`/api/propostas/${p.id}/preview`, '_blank');
    });
  }

  if (window.PropostaDetail) {
    window.PropostaDetail.registerTab({
      id: 'preview',
      label: 'Preview',
      icon: '👁️',
      render,
    });
  }
})();
