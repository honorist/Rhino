/**
 * Aba: Obrigações — picker de cláusulas da biblioteca (contratada + contratante).
 * Cada cláusula virada como item da proposta tem texto editável (copia da biblioteca).
 */
(function() {
  function uid() { return 'obg_' + Math.random().toString(36).slice(2, 9); }

  function render(container, p, onChange) {
    const clausulas = (window.Store?.state?.clausulas || []).filter(c => c.ativa !== false);
    const contratada  = Array.isArray(p.obrigacoesContratada)  ? p.obrigacoesContratada  : [];
    const contratante = Array.isArray(p.obrigacoesContratante) ? p.obrigacoesContratante : [];

    container.innerHTML = `
      <div class="card" style="padding:24px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;gap:12px;flex-wrap:wrap;">
          <div>
            <h3 style="margin:0;color:#1F497D;">Obrigações</h3>
            <p class="text-muted" style="margin:4px 0 0;font-size:13px;">
              Selecione cláusulas da biblioteca para cada lado. Você pode editar o texto após inserir — a alteração fica só nesta proposta.
            </p>
          </div>
          <a href="#/clausulas" class="action-link" title="Gerenciar biblioteca de cláusulas">📖 Ir para biblioteca</a>
        </div>

        ${renderLado('Obrigações da Contratada',  'contratada',  contratada,  clausulas.filter(c => c.categoria === 'obrigacoes_contratada'))}
        <div style="height:24px;"></div>
        ${renderLado('Obrigações da Contratante', 'contratante', contratante, clausulas.filter(c => c.categoria === 'obrigacoes_contratante'))}
      </div>
    `;

    bindEvents();

    function renderLado(titulo, lado, lista, biblioteca) {
      return `
        <div style="border:1px solid #e2e8f0;border-radius:8px;padding:16px;">
          <h4 style="margin:0 0 12px;color:#1F497D;">${titulo}</h4>

          <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
            <select class="form-control select-clausula" data-lado="${lado}" style="flex:1;min-width:240px;">
              <option value="">— Inserir cláusula da biblioteca —</option>
              ${biblioteca.map(c => `<option value="${c.id}">${escapeHtml(c.titulo)}</option>`).join('')}
            </select>
            <button class="btn btn-secondary btn-add-clausula" data-lado="${lado}">Adicionar</button>
            <button class="btn btn-secondary btn-add-livre" data-lado="${lado}" title="Adicionar texto livre">+ Livre</button>
          </div>

          <div class="lista-obg" data-lado="${lado}" style="display:flex;flex-direction:column;gap:8px;">
            ${lista.length === 0 ? `
              <div style="text-align:center;padding:24px;color:#94a3b8;border:2px dashed #e2e8f0;border-radius:6px;font-size:13px;">
                Nenhuma cláusula selecionada.
              </div>
            ` : lista.map((it, idx) => renderItem(it, idx, lado)).join('')}
          </div>
        </div>
      `;
    }

    function renderItem(it, idx, lado) {
      return `
        <div class="obg-row" data-lado="${lado}" data-idx="${idx}" style="display:flex;gap:10px;align-items:flex-start;padding:10px;background:#f8fafc;border-radius:6px;border:1px solid #e2e8f0;">
          <div style="flex:1;">
            <input type="text" class="form-control obg-titulo" data-lado="${lado}" data-idx="${idx}" value="${escapeHtml(it.titulo || '')}" placeholder="Título (opcional)" style="margin-bottom:6px;font-weight:600;">
            <textarea class="form-control obg-texto" data-lado="${lado}" data-idx="${idx}" rows="3" style="resize:vertical;">${escapeHtml(it.texto || '')}</textarea>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;">
            <button class="btn-obg-up"   data-lado="${lado}" data-idx="${idx}" title="Subir"  style="background:none;border:none;cursor:pointer;color:#64748b;font-size:12px;">▲</button>
            <button class="btn-obg-down" data-lado="${lado}" data-idx="${idx}" title="Descer" style="background:none;border:none;cursor:pointer;color:#64748b;font-size:12px;">▼</button>
            <button class="btn-obg-del"  data-lado="${lado}" data-idx="${idx}" title="Remover" style="background:none;border:none;cursor:pointer;color:#dc2626;font-size:18px;">×</button>
          </div>
        </div>
      `;
    }

    function getLista(lado) {
      return lado === 'contratada' ? [...(p.obrigacoesContratada || [])] : [...(p.obrigacoesContratante || [])];
    }
    function setLista(lado, nova) {
      const key = lado === 'contratada' ? 'obrigacoesContratada' : 'obrigacoesContratante';
      p[key] = nova;
      onChange({ [key]: nova });
    }

    function bindEvents() {
      container.querySelectorAll('.btn-add-clausula').forEach(b => {
        b.addEventListener('click', () => {
          const lado = b.dataset.lado;
          const sel = container.querySelector(`.select-clausula[data-lado="${lado}"]`);
          const id = sel?.value;
          if (!id) return;
          const c = clausulas.find(x => x.id === id);
          if (!c) return;
          const nova = [...getLista(lado), { id: uid(), clausulaId: c.id, titulo: c.titulo, texto: c.texto }];
          setLista(lado, nova);
          render(container, p, onChange);
        });
      });

      container.querySelectorAll('.btn-add-livre').forEach(b => {
        b.addEventListener('click', () => {
          const lado = b.dataset.lado;
          const nova = [...getLista(lado), { id: uid(), clausulaId: null, titulo: '', texto: '' }];
          setLista(lado, nova);
          render(container, p, onChange);
        });
      });

      container.querySelectorAll('.obg-titulo').forEach(inp => {
        let timer;
        inp.addEventListener('input', () => {
          clearTimeout(timer);
          timer = setTimeout(() => {
            const lado = inp.dataset.lado, idx = parseInt(inp.dataset.idx, 10);
            const nova = getLista(lado).map((it, i) => i === idx ? { ...it, titulo: inp.value } : it);
            setLista(lado, nova);
          }, 300);
        });
      });
      container.querySelectorAll('.obg-texto').forEach(ta => {
        let timer;
        ta.addEventListener('input', () => {
          clearTimeout(timer);
          timer = setTimeout(() => {
            const lado = ta.dataset.lado, idx = parseInt(ta.dataset.idx, 10);
            const nova = getLista(lado).map((it, i) => i === idx ? { ...it, texto: ta.value } : it);
            setLista(lado, nova);
          }, 300);
        });
      });

      container.querySelectorAll('.btn-obg-del').forEach(b => {
        b.addEventListener('click', () => {
          const lado = b.dataset.lado, idx = parseInt(b.dataset.idx, 10);
          const nova = getLista(lado).filter((_, i) => i !== idx);
          setLista(lado, nova);
          render(container, p, onChange);
        });
      });

      const swap = (lado, i, j) => {
        const lista = getLista(lado);
        if (j < 0 || j >= lista.length) return;
        [lista[i], lista[j]] = [lista[j], lista[i]];
        setLista(lado, lista);
        render(container, p, onChange);
      };
      container.querySelectorAll('.btn-obg-up').forEach(b => {
        b.addEventListener('click', () => swap(b.dataset.lado, parseInt(b.dataset.idx, 10), parseInt(b.dataset.idx, 10) - 1));
      });
      container.querySelectorAll('.btn-obg-down').forEach(b => {
        b.addEventListener('click', () => swap(b.dataset.lado, parseInt(b.dataset.idx, 10), parseInt(b.dataset.idx, 10) + 1));
      });
    }
  }

  if (window.PropostaDetail) {
    window.PropostaDetail.registerTab({
      id: 'obrigacoes',
      label: 'Obrigações',
      icon: '⚖️',
      render,
    });
  }
})();
