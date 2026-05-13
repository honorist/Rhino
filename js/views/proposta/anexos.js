/**
 * Aba: Anexos — upload de PDFs (anexos finais) e imagens ilustrativas (no escopo).
 * Backend salva BYTEA em proposta_anexos. Imagens podem ter legenda.
 */
(function() {
  function render(container, p, onChange) {
    const anexos = Array.isArray(p.anexos) ? p.anexos : [];
    const imagens = anexos.filter(a => a.tipo === 'imagem' && a.secao === 'escopo');
    const pdfs    = anexos.filter(a => a.tipo === 'pdf');

    container.innerHTML = `
      <div class="card" style="padding:24px;">
        <h3 style="margin:0 0 16px;color:#1F497D;">Anexos</h3>

        <!-- Imagens ilustrativas -->
        <div style="border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:24px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <div>
              <h4 style="margin:0;color:#1F497D;">🖼️ Imagens Ilustrativas</h4>
              <p class="text-muted" style="margin:4px 0 0;font-size:12px;">Aparecem na seção "IMAGENS ILUSTRATIVAS" do DOCX/PDF, entre Objetivo e Escopo.</p>
            </div>
            <label class="btn btn-secondary" style="cursor:pointer;">
              + Imagem
              <input type="file" id="upImagem" accept="image/*" multiple style="display:none;">
            </label>
          </div>
          ${imagens.length === 0 ? `
            <div style="text-align:center;padding:24px;color:#94a3b8;border:2px dashed #e2e8f0;border-radius:6px;">
              Nenhuma imagem. Adicione fotos da área, esquemas ou referências visuais.
            </div>
          ` : `
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;">
              ${imagens.map(a => renderImagemCard(a)).join('')}
            </div>
          `}
        </div>

        <!-- PDFs anexos -->
        <div style="border:1px solid #e2e8f0;border-radius:8px;padding:16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <div>
              <h4 style="margin:0;color:#1F497D;">📎 Anexos PDF</h4>
              <p class="text-muted" style="margin:4px 0 0;font-size:12px;">Desenhos técnicos, certificados, especificações. Listados como referência ao final da proposta.</p>
            </div>
            <label class="btn btn-secondary" style="cursor:pointer;">
              + PDF
              <input type="file" id="upPdf" accept="application/pdf" multiple style="display:none;">
            </label>
          </div>
          ${pdfs.length === 0 ? `
            <div style="text-align:center;padding:24px;color:#94a3b8;border:2px dashed #e2e8f0;border-radius:6px;">
              Nenhum PDF anexado.
            </div>
          ` : `
            <div style="display:flex;flex-direction:column;gap:8px;">
              ${pdfs.map(a => renderPdfRow(a)).join('')}
            </div>
          `}
        </div>
      </div>
    `;

    function renderImagemCard(a) {
      const sizeKb = a.sizeBytes ? (a.sizeBytes / 1024).toFixed(0) + ' KB' : '';
      return `
        <div class="card" style="padding:8px;display:flex;flex-direction:column;gap:6px;">
          <img src="/api/propostas/${p.id}/anexos/${a.id}" alt="${escapeHtml(a.nome)}" style="width:100%;height:120px;object-fit:cover;border-radius:4px;background:#f1f5f9;">
          <input type="text" class="form-control anexo-legenda" data-id="${a.id}" placeholder="Legenda (opcional)" value="${escapeHtml(a.legenda || '')}" style="font-size:12px;padding:4px 6px;">
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#64748b;">
            <span title="${escapeHtml(a.nome)}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:120px;">${escapeHtml(a.nome)}</span>
            <button class="btn-anexo-del" data-id="${a.id}" title="Remover" style="background:none;border:none;cursor:pointer;color:#dc2626;font-size:16px;">×</button>
          </div>
        </div>
      `;
    }

    function renderPdfRow(a) {
      const sizeKb = a.sizeBytes ? (a.sizeBytes / 1024).toFixed(0) + ' KB' : '';
      return `
        <div style="display:flex;align-items:center;gap:12px;padding:10px;background:#f8fafc;border-radius:6px;border:1px solid #e2e8f0;">
          <span style="font-size:24px;">📄</span>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:14px;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(a.nome)}</div>
            <div style="font-size:11px;color:#64748b;">${sizeKb}</div>
          </div>
          <a href="/api/propostas/${p.id}/anexos/${a.id}" target="_blank" class="action-link">Abrir</a>
          <button class="btn-anexo-del" data-id="${a.id}" title="Remover" style="background:none;border:none;cursor:pointer;color:#dc2626;font-size:18px;">×</button>
        </div>
      `;
    }

    // Eventos
    const upImg = container.querySelector('#upImagem');
    if (upImg) upImg.addEventListener('change', () => uploadFiles(upImg.files, 'imagem', 'escopo'));
    const upPdf = container.querySelector('#upPdf');
    if (upPdf) upPdf.addEventListener('change', () => uploadFiles(upPdf.files, 'pdf', 'anexo_final'));

    container.querySelectorAll('.btn-anexo-del').forEach(b => {
      b.addEventListener('click', async () => {
        if (!confirm('Remover este anexo?')) return;
        try {
          const res = await fetch(`/api/propostas/${p.id}/anexos/${b.dataset.id}`, { method: 'DELETE' });
          if (!res.ok) throw new Error(await res.text());
          const j = await res.json();
          if (j.proposta) p.anexos = j.proposta.anexos || [];
          render(container, p, onChange);
        } catch (e) { if (window.showToast) showToast('Erro: ' + e.message, 'error'); }
      });
    });

    container.querySelectorAll('.anexo-legenda').forEach(inp => {
      let timer;
      inp.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(async () => {
          try {
            const res = await fetch(`/api/propostas/${p.id}/anexos/${inp.dataset.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ legenda: inp.value }),
            });
            if (res.ok) {
              const j = await res.json();
              if (j.proposta) p.anexos = j.proposta.anexos || [];
            }
          } catch {}
        }, 500);
      });
    });

    async function uploadFiles(files, tipo, secao) {
      if (!files || files.length === 0) return;
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;z-index:9999;color:white;font-size:18px;';
      overlay.textContent = `Enviando ${files.length} arquivo(s)...`;
      document.body.appendChild(overlay);
      try {
        for (const file of files) {
          const fd = new FormData();
          fd.append('file', file);
          fd.append('tipo', tipo);
          fd.append('secao', secao);
          const res = await fetch(`/api/propostas/${p.id}/anexos`, { method: 'POST', body: fd });
          if (!res.ok) throw new Error(await res.text());
        }
        // Recarrega proposta com novos anexos
        const proposta = await Store.fetchProposta(p.id);
        if (proposta) p.anexos = proposta.anexos || [];
        render(container, p, onChange);
        if (window.showToast) showToast(`${files.length} arquivo(s) enviado(s)`, 'success');
      } catch (e) {
        if (window.showToast) showToast('Erro: ' + e.message, 'error');
      } finally {
        overlay.remove();
      }
    }
  }

  if (window.PropostaDetail) {
    window.PropostaDetail.registerTab({
      id: 'anexos',
      label: 'Anexos',
      icon: '📎',
      render,
    });
  }
})();
