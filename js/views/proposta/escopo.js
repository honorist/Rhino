/**
 * Aba: Escopo — lista única de itens com chip toggle ESCOPO ↔ FORA DE ESCOPO.
 * Itens com `incluso=true` viram seção ESCOPO no DOCX; `incluso=false` viram EXCLUSÕES.
 */
(function() {
  function uid() { return 'esc_' + Math.random().toString(36).slice(2, 9); }

  function render(container, p, onChange) {
    const itens = Array.isArray(p.escopo) ? p.escopo : [];

    container.innerHTML = `
      <div class="card" style="padding:24px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:12px;">
          <div>
            <h3 style="margin:0;color:#1F497D;">Escopo e Exclusões</h3>
            <p class="text-muted" style="margin:4px 0 0;font-size:13px;">
              Clique no chip <strong>ESCOPO</strong> de cada linha para alternar para <strong>FORA DE ESCOPO</strong>. Itens "fora" aparecem na seção EXCLUSÕES do DOCX.
            </p>
          </div>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-secondary" id="btnAddItem">+ Adicionar Item</button>
          </div>
        </div>

        <div style="display:flex;gap:16px;margin-bottom:12px;font-size:13px;color:#64748b;">
          <span><span class="chip-esc-mini" style="background:#10b981;color:white;padding:2px 8px;border-radius:10px;font-size:11px;">ESCOPO</span> ${itens.filter(i => i.incluso).length} item(s)</span>
          <span><span class="chip-esc-mini" style="background:#dc2626;color:white;padding:2px 8px;border-radius:10px;font-size:11px;">FORA</span> ${itens.filter(i => !i.incluso).length} item(s)</span>
        </div>

        <div id="listaEscopo" style="display:flex;flex-direction:column;gap:8px;">
          ${itens.length === 0 ? `
            <div style="text-align:center;padding:32px;color:#94a3b8;border:2px dashed #e2e8f0;border-radius:8px;">
              Nenhum item ainda. Clique em "+ Adicionar Item" para começar.
            </div>
          ` : itens.map((it, idx) => renderItem(it, idx)).join('')}
        </div>
      </div>
    `;

    function renderItem(it, idx) {
      const incluso = it.incluso !== false;
      const cor = incluso
        ? { bg: '#10b981', fg: 'white', label: 'ESCOPO',         hover: '#059669' }
        : { bg: '#dc2626', fg: 'white', label: 'FORA DE ESCOPO', hover: '#b91c1c' };
      return `
        <div class="escopo-row" data-idx="${idx}" style="display:flex;gap:10px;align-items:flex-start;padding:10px;border:1px solid ${incluso ? '#d1fae5' : '#fee2e2'};background:${incluso ? '#f0fdf4' : '#fef2f2'};border-radius:8px;">
          <div style="display:flex;flex-direction:column;align-items:center;gap:6px;padding-top:2px;">
            <button class="chip-escopo-toggle" data-idx="${idx}"
                    style="background:${cor.bg};color:${cor.fg};border:none;padding:5px 12px;border-radius:14px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;letter-spacing:.3px;">
              ${cor.label}
            </button>
            <div style="display:flex;flex-direction:column;gap:2px;">
              <button class="btn-up"   data-idx="${idx}" title="Subir"   style="background:none;border:none;cursor:pointer;font-size:10px;color:#94a3b8;padding:0;">▲</button>
              <button class="btn-down" data-idx="${idx}" title="Descer"  style="background:none;border:none;cursor:pointer;font-size:10px;color:#94a3b8;padding:0;">▼</button>
            </div>
          </div>
          <textarea class="form-control item-texto" data-idx="${idx}" rows="2"
                    style="flex:1;border:none;background:transparent;resize:vertical;font-size:14px;padding:4px;">${escapeHtml(it.texto || '')}</textarea>
          <button class="btn-del-item" data-idx="${idx}" title="Remover" style="background:none;border:none;cursor:pointer;color:#dc2626;padding:4px 8px;font-size:18px;">×</button>
        </div>
      `;
    }

    /**
     * Captura o estado atual do DOM (textos digitados nos textareas) e mescla
     * com `itens`. Isso evita perder texto não-flushado do debounce de 300ms
     * quando o usuário clica em algum botão que re-renderiza a aba.
     */
    function snapshot() {
      const textareas = container.querySelectorAll('.item-texto');
      const lista = itens.map(it => ({ ...it }));
      textareas.forEach(t => {
        const idx = parseInt(t.dataset.idx, 10);
        if (!isNaN(idx) && lista[idx]) {
          lista[idx].texto = t.value;
        }
      });
      return lista;
    }

    const commit = (novosItens) => onChange({ escopo: novosItens });

    container.querySelector('#btnAddItem')?.addEventListener('click', () => {
      const atuais = snapshot();
      const novos = [...atuais, { id: uid(), texto: '', incluso: true, ordem: atuais.length }];
      commit(novos);
      render(container, { ...p, escopo: novos }, onChange);
    });

    container.querySelectorAll('.chip-escopo-toggle').forEach(b => {
      b.addEventListener('click', () => {
        const idx = parseInt(b.dataset.idx, 10);
        const atuais = snapshot();
        const novos = atuais.map((it, i) => i === idx ? { ...it, incluso: !(it.incluso !== false) } : it);
        commit(novos);
        render(container, { ...p, escopo: novos }, onChange);
      });
    });

    container.querySelectorAll('.item-texto').forEach(t => {
      let timer;
      t.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          // snapshot pega TODOS os textos (não só o que mudou), garantindo sync
          commit(snapshot());
        }, 300);
      });
      // Salvar também ao perder foco (flush imediato — antes do usuário poder clicar em botão)
      t.addEventListener('blur', () => {
        clearTimeout(timer);
        commit(snapshot());
      });
    });

    container.querySelectorAll('.btn-del-item').forEach(b => {
      b.addEventListener('click', () => {
        const idx = parseInt(b.dataset.idx, 10);
        const atuais = snapshot();
        const novos = atuais.filter((_, i) => i !== idx).map((it, i) => ({ ...it, ordem: i }));
        commit(novos);
        render(container, { ...p, escopo: novos }, onChange);
      });
    });

    container.querySelectorAll('.btn-up').forEach(b => {
      b.addEventListener('click', () => {
        const idx = parseInt(b.dataset.idx, 10);
        if (idx === 0) return;
        const atuais = snapshot();
        const novos = [...atuais];
        [novos[idx-1], novos[idx]] = [novos[idx], novos[idx-1]];
        novos.forEach((it, i) => it.ordem = i);
        commit(novos);
        render(container, { ...p, escopo: novos }, onChange);
      });
    });
    container.querySelectorAll('.btn-down').forEach(b => {
      b.addEventListener('click', () => {
        const idx = parseInt(b.dataset.idx, 10);
        const atuais = snapshot();
        if (idx === atuais.length - 1) return;
        const novos = [...atuais];
        [novos[idx+1], novos[idx]] = [novos[idx], novos[idx+1]];
        novos.forEach((it, i) => it.ordem = i);
        commit(novos);
        render(container, { ...p, escopo: novos }, onChange);
      });
    });
  }

  if (window.PropostaDetail) {
    window.PropostaDetail.registerTab({
      id: 'escopo',
      label: 'Escopo / Fora',
      icon: '📑',
      render,
    });
  }
})();
