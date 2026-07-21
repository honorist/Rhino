window.Recursos = {
  busca: '',
  filtroStatus: '',
  filtroProfissoes: [],
  _miniMap: null,
  // Paginação (UIKit.paginate). Antes a tela jogava o resultado filtrado INTEIRO
  // no DOM — com o crescimento do cadastro isso trava justamente a tela mais usada.
  _page: 1,
  _pageSize: 25,

  async render() {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading-spinner">Carregando...</div>';
    try {
      await Store.loadAll();
      this._renderLista();
    } catch (e) {
      console.error(e);
      app.innerHTML =
        '<div class="card"><p class="text-danger">Erro ao carregar recursos. Tente novamente.</p></div>';
    }
  },

  _renderLista() {
    const app = document.getElementById('app');
    const recursos = Store.state.recursos || [];
    const filtrados = this._filtrarRecursos(recursos);
    const pagina = UIKit.paginate(filtrados, this._page, this._pageSize);

    // Funções distintas (normalizadas) — deduplica variações de escrita/caixa
    // ("PEDREIRO", "pedreiro", " Pedreiro " viram um único "Pedreiro").
    const contagemCargo = {};
    recursos.forEach((r) => {
      const c = this._normalizeCargo(r.profissao);
      if (c) contagemCargo[c] = (contagemCargo[c] || 0) + 1;
    });
    const profissoes = Object.keys(contagemCargo).sort((a, b) =>
      a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
    );
    const textoResultado = this._textoResultado(filtrados, recursos.length);

    const total = recursos.length;
    const ativos = recursos.filter((r) => r.status === 'funcionario').length;
    const candidatos = recursos.filter((r) => r.status === 'candidato').length;
    const exFuncionarios = recursos.filter((r) => r.status === 'ex_funcionario').length;

    // Alertas de folga próxima (≤ 5 dias)
    const alertasFolga = recursos.filter((r) => {
      if (r.status !== 'funcionario' || !r.alocacaoAtual) return false;
      const info = this._calcProximaFolga(r);
      return info && info.diasRestantes <= 5;
    }).length;

    const filtroAtivo = this._temFiltro();
    const headerHtml = window.UIKit?.pageHeader
      ? window.UIKit.pageHeader({
          title: 'Recursos Humanos',
          subtitle: filtroAtivo
            ? `${filtrados.length} de ${total} pessoa${total !== 1 ? 's' : ''}`
            : `${total} pessoa${total !== 1 ? 's' : ''} cadastrada${total !== 1 ? 's' : ''}`,
          actions: `
        <button class="btn btn-secondary" id="btnMapaGeral" style="display:inline-flex;align-items:center;gap:6px;">${window.rhIcon('map-pin', 15)}Mapa Geral</button>
        <button class="btn btn-primary btn-lg" id="btnNovoRecurso">+ Novo Cadastro</button>`,
        })
      : '';

    const kpisHtml = window.UIKit?.kpiGrid
      ? window.UIKit.kpiGrid([
          { label: 'Funcionários ativos', value: ativos, color: 'var(--color-success)' },
          { label: 'Candidatos', value: candidatos, color: 'var(--color-info)' },
          { label: 'Ex-funcionários', value: exFuncionarios, color: 'var(--color-gray)' },
          {
            label: alertasFolga > 0 ? 'Folgas próximas' : 'Total',
            value: alertasFolga > 0 ? alertasFolga : total,
            color: alertasFolga > 0 ? 'var(--color-danger)' : 'var(--color-primary)',
            hint: alertasFolga > 0 ? '⚑ próx. 5 dias' : '',
          },
        ])
      : '';

    const toolbarHtml = window.UIKit?.toolbar
      ? window.UIKit.toolbar({
          search: {
            id: 'inputBusca',
            value: this.busca,
            label: 'Buscar',
            placeholder: 'Nome, CPF, profissão...',
          },
          selects: [
            {
              id: 'filtroStatus',
              label: 'Status',
              options: [
                { value: '', label: 'Todos os status', selected: !this.filtroStatus },
                {
                  value: 'funcionario',
                  label: 'Funcionário Ativo',
                  selected: this.filtroStatus === 'funcionario',
                },
                {
                  value: 'candidato',
                  label: 'Candidato',
                  selected: this.filtroStatus === 'candidato',
                },
                {
                  value: 'ex_funcionario',
                  label: 'Ex-Funcionário',
                  selected: this.filtroStatus === 'ex_funcionario',
                },
              ],
            },
          ],
          extra: `<div class="filter-group" style="min-width:180px;">
        <label class="filter-label">Cargo</label>
        ${this._renderCargoFilter(profissoes, contagemCargo)}
      </div>`,
          showClear: filtroAtivo,
          clearId: 'btnLimparRec',
        })
      : '';

    const chipsHtml = window.UIKit?.chips
      ? window.UIKit.chips(
          [
            { value: '', label: 'Todos', count: total, active: !this.filtroStatus },
            {
              value: 'funcionario',
              label: 'Ativos',
              count: ativos,
              active: this.filtroStatus === 'funcionario',
            },
            {
              value: 'candidato',
              label: 'Candidatos',
              count: candidatos,
              active: this.filtroStatus === 'candidato',
            },
            {
              value: 'ex_funcionario',
              label: 'Ex-funcionários',
              count: exFuncionarios,
              active: this.filtroStatus === 'ex_funcionario',
            },
          ],
          { name: 'rec-status', inCard: true }
        )
      : '';

    app.innerHTML = `
      ${headerHtml}
      ${kpisHtml}
      ${toolbarHtml}
      <div id="recursosResultado" style="font-size:13px;color:var(--color-text-muted);margin:-8px 0 8px;display:${textoResultado ? 'block' : 'none'};">${textoResultado}</div>

      <div class="card">
        ${chipsHtml}
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Nome</th>
                <th scope="col">Profissão</th>
                <th scope="col">Status</th>
                <th scope="col">Cidade/UF</th>
                <th scope="col">Próxima Folga</th>
                <th scope="col">Ações</th>
              </tr>
            </thead>
            <tbody id="recursosTbody">
              ${
                filtrados.length === 0
                  ? `<tr><td colspan="6" class="text-center text-muted" style="padding:var(--sp-xl);">
                    ${this._temFiltro() ? 'Nenhum resultado' : 'Nenhum cadastro ainda'}
                   </td></tr>`
                  : pagina.slice.map((r) => this._renderRow(r)).join('')
              }
            </tbody>
          </table>
        </div>
        ${UIKit.pagination(pagina, { label: 'colaboradores' })}
      </div>`;

    // O clamp acontece dentro do paginate: se a lista encolheu, `pagina.page`
    // já vem corrigido — guardar de volta evita ficar preso numa página morta.
    this._page = pagina.page;
    UIKit.wirePagination(app, pagina, ({ page, pageSize }) => {
      this._page = page;
      this._pageSize = pageSize;
      this._renderLista();
    });

    document.getElementById('btnNovoRecurso').addEventListener('click', () => this.showModal());
    document.getElementById('btnMapaGeral').addEventListener('click', () => this.showMapaGeral());
    document.getElementById('inputBusca').addEventListener('input', (e) => {
      this.busca = e.target.value;
      this._page = 1; // filtro mudou: senão o usuário busca e cai numa página vazia
      clearTimeout(this._tBusca);
      this._tBusca = setTimeout(() => this._renderLista(), 250);
    });
    document.getElementById('filtroStatus').addEventListener('change', (e) => {
      this.filtroStatus = e.target.value;
      this._page = 1;
      this._renderLista();
    });
    document.getElementById('btnLimparRec')?.addEventListener('click', () => {
      this.busca = '';
      this.filtroStatus = '';
      this.filtroProfissoes = [];
      this._page = 1;
      this.render();
    });
    document.querySelectorAll('[data-chips="rec-status"] .rh-chip').forEach((b) => {
      b.addEventListener('click', () => {
        this.filtroStatus = b.dataset.value || '';
        this._page = 1;
        this.render();
      });
    });

    this._attachCargoFilter();
    this._attachRowListeners();
  },

  // Religa os listeners das linhas da tabela (chamado no render completo e
  // nas atualizações incrementais que só trocam o <tbody>).
  _attachRowListeners() {
    document.querySelectorAll('.btn-editar-rec').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showModal(e.target.dataset.id);
      })
    );
    document.querySelectorAll('.btn-folgas').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showFolgas(e.target.dataset.id);
      })
    );
    document.querySelectorAll('.btn-distancia').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showDistancias(e.target.dataset.id);
      })
    );
    document.querySelectorAll('.btn-excluir-rec').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteRecurso(e.target.dataset.id);
      })
    );
    document.querySelectorAll('.btn-docs-rec').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.Documentos) window.Documentos.showDocumentos(e.target.dataset.id);
      })
    );
    // Treinamentos NR (item 8)
    document.querySelectorAll('.btn-treinos-rec').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const r = (Store.state.recursos || []).find((x) => x.id === e.target.dataset.id);
        if (r && window.RecursoTreinamentos) window.RecursoTreinamentos.render(r);
      })
    );
    // EPIs (item 9)
    document.querySelectorAll('.btn-epis-rec').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.RecursoEpis) window.RecursoEpis.showEpis(e.target.dataset.id);
      })
    );
    // Ponto / banco de horas (item 6)
    document.querySelectorAll('.btn-ponto').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.RecursoPonto) window.RecursoPonto.show(e.target.dataset.id);
      })
    );

    // Click na linha → abre modal de detalhe do colaborador (reusa ContratoDetail.showDetalheColaborador)
    document.querySelectorAll('.row-recurso').forEach((tr) => {
      tr.addEventListener('click', async (e) => {
        if (e.target.closest('.actions-cell')) return;
        const id = tr.dataset.id;
        // FIX silent-failure: ContratoDetail é lazy. Sem carregar antes, o ?.
        // engolia undefined e o click silenciosamente não fazia nada.
        try {
          if (typeof _loadLazyForPattern === 'function') {
            await _loadLazyForPattern('#/contratos/:id');
          }
        } catch (err) {
          console.error('[Recursos] falha ao carregar ContratoDetail:', err);
          if (window.showToast) window.showToast('Não foi possível abrir o detalhe.', 'error');
          return;
        }
        if (window.ContratoDetail?.showDetalheColaborador) {
          window.ContratoDetail.showDetalheColaborador(id);
        }
      });
    });
  },

  // ── Padronização de cargos/funções ─────────────────────────────────────────
  // Remove espaços extras e aplica "primeira letra maiúscula" (sentence-case).
  // Usado para exibir, agrupar e deduplicar funções escritas de forma diferente.
  _normalizeCargo(s) {
    const v = String(s || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!v) return '';
    return v.charAt(0).toLocaleUpperCase('pt-BR') + v.slice(1).toLocaleLowerCase('pt-BR');
  },

  _temFiltro() {
    return !!(
      (this.busca || '').trim() ||
      this.filtroStatus ||
      (this.filtroProfissoes || []).length
    );
  },

  _filtrarRecursos(recursos) {
    const termo = (this.busca || '').toLowerCase().trim();
    const sel = this.filtroProfissoes || [];
    return recursos.filter((r) => {
      const matchBusca =
        !termo ||
        (r.nome || '').toLowerCase().includes(termo) ||
        (r.cpf || '').includes(termo) ||
        (r.profissao || '').toLowerCase().includes(termo) ||
        (r.endereco || '').toLowerCase().includes(termo);
      const matchStatus = !this.filtroStatus || r.status === this.filtroStatus;
      const matchCargo = sel.length === 0 || sel.includes(this._normalizeCargo(r.profissao));
      return matchBusca && matchStatus && matchCargo;
    });
  },

  // Texto-resumo do resultado filtrado, com a contagem de cargos.
  _textoResultado(filtrados, total) {
    if (!this._temFiltro()) return '';
    const nCargos = new Set(filtrados.map((r) => this._normalizeCargo(r.profissao)).filter(Boolean))
      .size;
    const p = filtrados.length === 1 ? 'pessoa' : 'pessoas';
    const f = nCargos === 1 ? 'função' : 'funções';
    return `Mostrando <strong>${filtrados.length}</strong> de ${total} ${p} · <strong>${nCargos}</strong> ${f}`;
  },

  _labelCargoFilter() {
    const sel = this.filtroProfissoes || [];
    if (sel.length === 0) return 'Todas as funções';
    if (sel.length === 1) return sel[0];
    return `${sel.length} funções selecionadas`;
  },

  // Filtro de função com multi-seleção (checkboxes em dropdown).
  _renderCargoFilter(profissoes, contagem) {
    const sel = this.filtroProfissoes || [];
    const opts = profissoes
      .map(
        (p) => `
      <label class="cargo-opt" data-cargo="${escapeHtml(p)}" style="display:flex;align-items:center;gap:8px;padding:6px 10px;cursor:pointer;font-size:14px;">
        <input type="checkbox" class="cargo-cb" value="${escapeHtml(p)}" ${sel.includes(p) ? 'checked' : ''} style="width:15px;height:15px;cursor:pointer;flex-shrink:0;">
        <span style="flex:1;">${escapeHtml(p)}</span>
        <span style="color:var(--color-text-muted);font-size:12px;">${contagem[p] || 0}</span>
      </label>`
      )
      .join('');
    return `
      <div id="cargoFilterWrap" style="position:relative;width:260px;">
        <button type="button" id="cargoFilterBtn" class="form-control" style="display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:pointer;text-align:left;">
          <span id="cargoFilterLabel" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(this._labelCargoFilter())}</span>
          <span style="color:var(--color-text-muted);flex-shrink:0;">▾</span>
        </button>
        <div id="cargoFilterPanel" style="display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:60;background:var(--color-surface);border:1px solid var(--color-border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.18);">
          <div style="padding:8px;border-bottom:1px solid var(--color-border);">
            <input id="cargoFilterBusca" class="form-control" placeholder="🔎 Buscar função..." style="font-size:13px;height:34px;">
          </div>
          <div style="display:flex;justify-content:space-between;padding:6px 10px;font-size:12px;border-bottom:1px solid var(--color-border);">
            <a id="cargoSelAll" style="color:var(--color-primary);cursor:pointer;">Marcar todas</a>
            <a id="cargoSelNone" style="color:var(--color-text-muted);cursor:pointer;">Limpar seleção</a>
          </div>
          <div id="cargoFilterList" style="max-height:260px;overflow:auto;">
            ${profissoes.length ? opts : '<div style="padding:12px;color:var(--color-text-muted);font-size:13px;text-align:center;">Nenhuma função cadastrada</div>'}
          </div>
        </div>
      </div>`;
  },

  _attachCargoFilter() {
    const btn = document.getElementById('cargoFilterBtn');
    const panel = document.getElementById('cargoFilterPanel');
    const busca = document.getElementById('cargoFilterBusca');
    if (!btn || !panel) return;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const aberto = panel.style.display === 'block';
      panel.style.display = aberto ? 'none' : 'block';
      if (!aberto && busca) busca.focus();
    });
    panel.addEventListener('click', (e) => e.stopPropagation());

    // Click fora fecha — um único handler no document, recriado a cada render.
    if (this._cargoDocHandler) document.removeEventListener('click', this._cargoDocHandler);
    this._cargoDocHandler = () => {
      const p = document.getElementById('cargoFilterPanel');
      if (p) p.style.display = 'none';
    };
    document.addEventListener('click', this._cargoDocHandler);
    // Safety-net: ao trocar de view, remove o handler global (o flush do
    // lifecycle roda mesmo sem novo render). Registra só uma vez por sessão da
    // view para não acumular callbacks a cada re-render.
    if (!this._cargoCleanupRegistrado) {
      this._cargoCleanupRegistrado = true;
      window.viewLifecycle?.onCleanup(() => {
        if (this._cargoDocHandler) document.removeEventListener('click', this._cargoDocHandler);
        this._cargoCleanupRegistrado = false;
      });
    }

    if (busca) {
      busca.addEventListener('input', () => {
        const t = busca.value.toLowerCase().trim();
        document.querySelectorAll('#cargoFilterList .cargo-opt').forEach((opt) => {
          const c = (opt.dataset.cargo || '').toLowerCase();
          opt.style.display = !t || c.includes(t) ? 'flex' : 'none';
        });
      });
    }

    const sincronizar = () => {
      this.filtroProfissoes = [...document.querySelectorAll('#cargoFilterList .cargo-cb')]
        .filter((x) => x.checked)
        .map((x) => x.value);
      this._page = 1; // filtro de cargo mudou
      this._refreshResultados();
    };
    document.querySelectorAll('#cargoFilterList .cargo-cb').forEach((cb) => {
      cb.addEventListener('change', sincronizar);
    });
    const selAll = document.getElementById('cargoSelAll');
    const selNone = document.getElementById('cargoSelNone');
    if (selAll)
      selAll.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('#cargoFilterList .cargo-opt').forEach((opt) => {
          if (opt.style.display !== 'none') {
            const cb = opt.querySelector('.cargo-cb');
            if (cb) cb.checked = true;
          }
        });
        sincronizar();
      });
    if (selNone)
      selNone.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('#cargoFilterList .cargo-cb').forEach((x) => {
          x.checked = false;
        });
        sincronizar();
      });
  },

  // Atualiza só a tabela + contadores (mantém o dropdown de funções aberto).
  _refreshResultados() {
    const recursos = Store.state.recursos || [];
    const filtrados = this._filtrarRecursos(recursos);
    // Este é o caminho INCREMENTAL (troca só o tbody). Ele também precisa
    // paginar: sem isto, mexer no filtro de cargo devolveria a lista inteira ao
    // DOM e furaria a paginação aplicada no _renderLista.
    const pagina = UIKit.paginate(filtrados, this._page, this._pageSize);
    this._page = pagina.page;
    const tbody = document.getElementById('recursosTbody');
    if (tbody) {
      tbody.innerHTML =
        filtrados.length === 0
          ? `<tr><td colspan="6" class="text-center text-muted" style="padding:var(--sp-xl);">${this._temFiltro() ? 'Nenhum resultado' : 'Nenhum cadastro ainda'}</td></tr>`
          : pagina.slice.map((r) => this._renderRow(r)).join('');
      this._attachRowListeners();
    }
    // Redesenha o controle no lugar: o total de páginas muda conforme o filtro.
    const paginacaoAtual = document.querySelector('#app .rh-pagination');
    const novoHtml = UIKit.pagination(pagina, { label: 'colaboradores' });
    if (paginacaoAtual) {
      if (!novoHtml) {
        paginacaoAtual.remove();
      } else {
        const tmp = document.createElement('div');
        tmp.innerHTML = novoHtml;
        paginacaoAtual.replaceWith(tmp.firstElementChild);
        UIKit.wirePagination(document.getElementById('app'), pagina, ({ page, pageSize }) => {
          this._page = page;
          this._pageSize = pageSize;
          this._renderLista();
        });
      }
    } else if (novoHtml) {
      // Antes não paginava e agora precisa (ex.: filtro foi limpo) — só um
      // re-render completo recoloca o controle na posição certa.
      this._renderLista();
      return;
    }
    const res = document.getElementById('recursosResultado');
    if (res) {
      const txt = this._textoResultado(filtrados, recursos.length);
      res.innerHTML = txt;
      res.style.display = txt ? 'block' : 'none';
    }
    const lbl = document.getElementById('cargoFilterLabel');
    if (lbl) lbl.textContent = this._labelCargoFilter();
  },

  _statCard(label, value, cor, icon) {
    return `<div class="card" style="padding:var(--sp-lg);text-align:center;">
      <div style="font-size:28px;color:${cor};margin-bottom:4px;">${icon}</div>
      <div style="font-size:22px;font-weight:700;color:${cor};">${value}</div>
      <div style="font-size:15px;color:var(--color-text-muted);">${label}</div>
    </div>`;
  },

  _calcProximaFolga(r) {
    if (!r.alocacaoAtual || !r.alocacaoAtual.dataInicio) return null;
    const ciclo = parseInt(r.alocacaoAtual.cicloTrabalho) || 21;
    const inicio = new Date(r.alocacaoAtual.dataInicio + 'T12:00:00');
    const folgas = (r.folgas || []).sort((a, b) => new Date(b.dataInicio) - new Date(a.dataInicio));
    const ultimaFolga = folgas[0];

    let baseDate = inicio;
    if (ultimaFolga && ultimaFolga.dataFim) {
      baseDate = new Date(ultimaFolga.dataFim + 'T12:00:00');
    }

    const proxima = new Date(baseDate);
    proxima.setDate(proxima.getDate() + ciclo);

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const diasRestantes = Math.ceil((proxima - hoje) / 86400000);

    return { dataProxima: proxima.toISOString().split('T')[0], diasRestantes };
  },

  _renderRow(r) {
    const statusBadge =
      {
        funcionario: `<span class="badge" style="background:#D1FAE5;color:#065F46;">Funcionário</span>`,
        candidato: `<span class="badge" style="background:#DBEAFE;color:#1E40AF;">Candidato</span>`,
        ex_funcionario: `<span class="badge" style="background:#E5E7EB;color:#374151;">Ex-Funcionário</span>`,
      }[r.status] || '';

    // Cidade/UF (residência do colaborador). "—" quando não cadastrado.
    // (A obra/alocação continua no detalhe e no cadastro — só saiu da listagem.)
    const _cidUf = [r.cidade, r.estado]
      .map((x) => (x || '').trim())
      .filter(Boolean)
      .join(' / ');
    const cidadeUf = _cidUf ? `<span style="font-size:15px;">${escapeHtml(_cidUf)}</span>` : '—';

    // Próxima folga
    let folgaCell = '—';
    if (r.status === 'funcionario' && r.alocacaoAtual) {
      const info = this._calcProximaFolga(r);
      if (info) {
        const { diasRestantes, dataProxima } = info;
        const cor = diasRestantes < 0 ? '#DC2626' : diasRestantes <= 5 ? '#D97706' : '#059669';
        const txt =
          diasRestantes < 0
            ? `<strong style="color:#DC2626;">Vencida há ${Math.abs(diasRestantes)}d</strong>`
            : diasRestantes === 0
              ? `<strong style="color:#D97706;">Hoje</strong>`
              : `<span style="color:${cor};">${diasRestantes}d — ${this._fmtDate(dataProxima)}</span>`;
        folgaCell = txt;
      }
    }

    const temCoordenadas = r.lat && r.lng;

    // Badge de conformidade documental
    const docs = r.documentos || [];
    let docBadge = '';
    if (r.status === 'funcionario' && docs.length > 0) {
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const temVencido = docs.some(
        (d) =>
          d.dataVencimento &&
          Math.ceil((new Date(d.dataVencimento + 'T12:00:00') - hoje) / 86400000) < 0
      );
      const temVencendo = docs.some(
        (d) =>
          d.dataVencimento &&
          Math.ceil((new Date(d.dataVencimento + 'T12:00:00') - hoje) / 86400000) <= 30 &&
          Math.ceil((new Date(d.dataVencimento + 'T12:00:00') - hoje) / 86400000) >= 0
      );
      if (temVencido)
        docBadge = `<span title="Documentos vencidos" style="margin-left:4px;font-size:15px;background:#FEE2E2;color:#991B1B;padding:1px 5px;border-radius:3px;font-weight:700;">docs !</span>`;
      else if (temVencendo)
        docBadge = `<span title="Documentos vencendo em breve" style="margin-left:4px;font-size:15px;background:#FEF3C7;color:#92400E;padding:1px 5px;border-radius:3px;font-weight:700;">docs ~</span>`;
    }

    return `<tr class="row-recurso" data-id="${r.id}" style="cursor:pointer;">
      <td>
        <strong>${escapeHtml(r.nome) || '—'}</strong>${docBadge}
        ${r.cpf ? `<div style="font-size:15px;color:var(--color-text-muted);font-family:monospace;">${escapeHtml(r.cpf)}</div>` : ''}
      </td>
      <td>${escapeHtml(this._normalizeCargo(r.profissao)) || '—'}</td>
      <td>${statusBadge}</td>
      <td>${cidadeUf}</td>
      <td>${folgaCell}</td>
      <td>
        <div class="actions-cell">
          ${r.status === 'funcionario' ? `<button type="button" class="action-link btn-folgas" data-id="${r.id}" style="color:#7C3AED;">Folgas</button>` : ''}
          <button type="button" class="action-link btn-docs-rec" data-id="${r.id}" style="color:#2563EB;">Docs</button>
          <button type="button" class="action-link btn-treinos-rec" data-id="${r.id}" style="color:#0D9488;">NRs</button>
          <button type="button" class="action-link btn-epis-rec" data-id="${r.id}" style="color:#EA580C;">EPIs</button>
          ${r.status === 'funcionario' ? `<button type="button" class="action-link btn-ponto" data-id="${r.id}" style="color:#0891B2;">Ponto</button>` : ''}
          ${temCoordenadas ? `<button type="button" class="action-link btn-distancia" data-id="${r.id}">Distâncias</button>` : ''}
          <button type="button" class="action-link btn-editar-rec" data-id="${r.id}">Editar</button>
          <button type="button" class="action-link danger btn-excluir-rec" data-id="${r.id}">Excluir</button>
        </div>
      </td>
    </tr>`;
  },

  _fmtDate(d) {
    if (!d) return '';
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  },

  _calcIdade(dataNasc) {
    const nasc = new Date(dataNasc);
    const hoje = new Date();
    let idade = hoje.getFullYear() - nasc.getFullYear();
    const m = hoje.getMonth() - nasc.getMonth();
    if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
    return idade;
  },

  // ── MODAL CADASTRO ─────────────────────────────────────────────────────────
  showModal(recursoId) {
    const r = recursoId ? (Store.state.recursos || []).find((x) => x.id === recursoId) : null;
    const isEx = r && r.status === 'ex_funcionario';

    const contratoOptions = Store.state.contracts
      .filter((c) => c.status === 'ativo')
      .map(
        (c) =>
          `<option value="${c.id}" ${r?.alocacaoAtual?.contractId === c.id ? 'selected' : ''}>${escapeHtml(c.name)} — ${escapeHtml(c.client)}</option>`
      )
      .join('');

    const html = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal" style="width:700px;max-height:90vh;overflow-y:auto;">
          <div class="modal-header">
            <h2 class="modal-title">${r ? 'Editar Cadastro' : 'Novo Cadastro'}</h2>
            <button class="modal-close">✕</button>
          </div>
          <form id="formRecurso" class="modal-content">

            <h3 style="font-size:15px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:var(--sp-md);">Dados Pessoais</h3>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Nome completo *</label>
                <input class="form-control" name="nome" value="${escapeHtml(r?.nome || '')}" required>
              </div>
              <div class="form-group">
                <label class="form-label">CPF</label>
                <input class="form-control" name="cpf" value="${escapeHtml(r?.cpf || '')}" placeholder="000.000.000-00">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Data de Nascimento</label>
                <input class="form-control" name="dataNascimento" type="date" value="${r?.dataNascimento || ''}">
              </div>
              <div class="form-group">
                <label class="form-label">Gênero</label>
                <select class="form-control" name="genero">
                  <option value="">—</option>
                  <option value="masculino" ${r?.genero === 'masculino' ? 'selected' : ''}>Masculino</option>
                  <option value="feminino"  ${r?.genero === 'feminino' ? 'selected' : ''}>Feminino</option>
                  <option value="outro"     ${r?.genero === 'outro' ? 'selected' : ''}>Outro</option>
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Telefone</label>
                <input class="form-control" name="telefone" data-phone inputmode="numeric" maxlength="16" value="${r?.telefone ? window.formatPhoneBR(r.telefone) : ''}" placeholder="(00) 00000-0000">
              </div>
              <div class="form-group">
                <label class="form-label">Email</label>
                <input class="form-control" name="email" type="email" value="${escapeHtml(r?.email || '')}">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Endereço (para calcular distâncias)</label>
              <div style="position:relative;" id="enderecoWrapRec">
                <input class="form-control" id="enderecoInputRec" name="endereco"
                  value="${escapeHtml(r?.endereco || '')}" placeholder="Buscar endereço no mapa..."
                  autocomplete="off" style="padding-right:36px;">
                <span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:16px;pointer-events:none;">📍</span>
                <div id="nominatimDropdownRec" class="nominatim-dropdown" style="display:none;top:calc(100% + 4px);left:0;"></div>
              </div>
              <input type="hidden" id="enderecoLatRec" name="lat" value="${r?.lat || ''}">
              <input type="hidden" id="enderecoLngRec" name="lng" value="${r?.lng || ''}">
              <div id="miniMapaRec" style="height:140px;border-radius:6px;margin-top:8px;overflow:hidden;border:1px solid var(--color-border);${r?.lat ? '' : 'display:none;'}"></div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Cidade</label>
                <input class="form-control" name="cidade" value="${escapeHtml(r?.cidade || '')}" placeholder="Cidade de residência">
              </div>
              <div class="form-group" style="max-width:120px;">
                <label class="form-label">UF</label>
                <input class="form-control" name="estado" value="${escapeHtml(r?.estado || '')}" placeholder="UF" maxlength="2" style="text-transform:uppercase;">
              </div>
            </div>

            <div style="border-top:1px solid var(--color-border);padding-top:var(--sp-lg);margin-top:var(--sp-lg);">
              <h3 style="font-size:15px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:var(--sp-md);">Dados Profissionais</h3>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Status *</label>
                  <select class="form-control" name="status" id="statusSelect" required>
                    <option value="candidato"     ${!r || r.status === 'candidato' ? 'selected' : ''}>Candidato</option>
                    <option value="funcionario"   ${r?.status === 'funcionario' ? 'selected' : ''}>Funcionário Ativo</option>
                    <option value="ex_funcionario"${r?.status === 'ex_funcionario' ? 'selected' : ''}>Ex-Funcionário</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Profissão / Função</label>
                  <input class="form-control" name="profissao" value="${escapeHtml(this._normalizeCargo(r?.profissao))}" placeholder="Ex: Eletricista, Pedreiro">
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Categoria no RDO</label>
                  <select class="form-control" name="rdoCategoria">
                    <option value=""    ${!r?.rdoCategoria ? 'selected' : ''}>— não definir —</option>
                    <option value="moi" ${r?.rdoCategoria === 'moi' ? 'selected' : ''}>MOI — Mão de Obra Indireta</option>
                    <option value="mod" ${r?.rdoCategoria === 'mod' ? 'selected' : ''}>MOD — Mão de Obra Direta</option>
                  </select>
                  <div class="form-helper">Usado para classificar o colaborador automaticamente no RDO.</div>
                </div>
                <div class="form-group">
                  <label class="form-label">Data de Admissão</label>
                  <input class="form-control" name="dataAdmissao" type="date" value="${r?.dataAdmissao || ''}">
                </div>
                <div class="form-group">
                  <label class="form-label">Salário (R$)</label>
                  <input class="form-control" name="salario" type="text" data-currency inputmode="numeric" value="${r?.salario ? window.BRLInput.toDisplay(r.salario) : ''}">
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label" style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                    <input type="checkbox" name="elegivelVale" ${r?.elegivelVale ? 'checked' : ''}>
                    Elegível a vale (adiantamento de 40% do salário)
                  </label>
                  <div class="form-helper">Se marcado, a Folha de Pagamento gera um vale de 40% além do saldo de 60%.</div>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">CNH</label>
                  <select class="form-control" name="cnh">
                    <option value="" ${!r?.cnh ? 'selected' : ''}>Não possui</option>
                    ${['A', 'B', 'AB', 'C', 'D', 'E'].map((v) => `<option value="${v}" ${r?.cnh === v ? 'selected' : ''}>${v}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">PIS/PASEP</label>
                  <input class="form-control" name="pis" value="${window.escapeHtml(r?.pis || '')}">
                </div>
              </div>
            </div>

            <div id="secaoAlocacao" style="border-top:1px solid var(--color-border);padding-top:var(--sp-lg);margin-top:var(--sp-lg);${r?.status === 'funcionario' || !r ? '' : 'display:none;'}">
              <h3 style="font-size:15px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:var(--sp-md);">Alocação de Campo</h3>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Obra atual</label>
                  <select class="form-control" name="alocacao_contractId">
                    <option value="">Sem alocação</option>
                    ${contratoOptions}
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Início na obra</label>
                  <input class="form-control" name="alocacao_dataInicio" type="date" value="${r?.alocacaoAtual?.dataInicio || ''}">
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Ciclo de trabalho (dias)</label>
                  <input class="form-control" name="alocacao_cicloTrabalho" type="number" min="1" value="${r?.alocacaoAtual?.cicloTrabalho || 21}" placeholder="21">
                </div>
                <div class="form-group">
                  <label class="form-label">Dias de folga por ciclo</label>
                  <input class="form-control" name="alocacao_cicloFolga" type="number" min="1" value="${r?.alocacaoAtual?.cicloFolga || 7}" placeholder="7">
                </div>
              </div>
            </div>

            <div id="secaoDesligamento" style="border-top:1px solid var(--color-border);padding-top:var(--sp-lg);margin-top:var(--sp-lg);${isEx ? '' : 'display:none;'}">
              <h3 style="font-size:15px;font-weight:700;color:#DC2626;text-transform:uppercase;letter-spacing:.06em;margin-bottom:var(--sp-md);">Desligamento</h3>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Data de Desligamento</label>
                  <input class="form-control" name="dataDesligamento" type="date" value="${r?.dataDesligamento || ''}">
                </div>
                <div class="form-group">
                  <label class="form-label">Motivo</label>
                  <select class="form-control" name="motivoDesligamento">
                    <option value="">—</option>
                    <option value="demissao_sem_justa_causa" ${r?.motivoDesligamento === 'demissao_sem_justa_causa' ? 'selected' : ''}>Demissão sem justa causa</option>
                    <option value="demissao_justa_causa"     ${r?.motivoDesligamento === 'demissao_justa_causa' ? 'selected' : ''}>Demissão com justa causa</option>
                    <option value="pedido_demissao"          ${r?.motivoDesligamento === 'pedido_demissao' ? 'selected' : ''}>Pedido de demissão</option>
                    <option value="fim_contrato"             ${r?.motivoDesligamento === 'fim_contrato' ? 'selected' : ''}>Fim de contrato</option>
                    <option value="acordo"                   ${r?.motivoDesligamento === 'acordo' ? 'selected' : ''}>Acordo</option>
                    <option value="outro"                    ${r?.motivoDesligamento === 'outro' ? 'selected' : ''}>Outro</option>
                  </select>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Observações sobre o desligamento</label>
                <textarea class="form-control" name="obsDesligamento" style="min-height:60px;">${window.escapeHtml(r?.obsDesligamento || '')}</textarea>
              </div>
            </div>

            <div style="border-top:1px solid var(--color-border);padding-top:var(--sp-lg);margin-top:var(--sp-lg);">
              <div class="form-group">
                <label class="form-label">Notas / Observações</label>
                <textarea class="form-control" name="notas" style="min-height:60px;">${window.escapeHtml(r?.notas || '')}</textarea>
              </div>
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelar">Cancelar</button>
            <button class="btn btn-primary" id="btnSalvar">${r ? 'Atualizar' : 'Criar'}</button>
          </div>
        </div>
      </div>`;

    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalOverlay');
    const close = () => {
      if (this._miniMap) {
        this._miniMap.remove();
        this._miniMap = null;
      }
      overlay.remove();
    };
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnCancelar').addEventListener('click', close);
    document.getElementById('statusSelect').addEventListener('change', (e) => {
      document.getElementById('secaoDesligamento').style.display =
        e.target.value === 'ex_funcionario' ? '' : 'none';
      document.getElementById('secaoAlocacao').style.display =
        e.target.value === 'funcionario' ? '' : 'none';
    });

    this._initEnderecoSearch(r?.lat, r?.lng, r?.endereco);

    document.getElementById('btnSalvar').addEventListener('click', async () => {
      const fd = new FormData(document.getElementById('formRecurso'));
      const data = Object.fromEntries(fd);
      if (!data.nome?.trim()) {
        window.showToast('Nome é obrigatório', 'error');
        return;
      }
      // Padroniza a função/cargo (primeira maiúscula) já na gravação.
      if (data.profissao) data.profissao = this._normalizeCargo(data.profissao);
      if (data.salario) data.salario = window.BRLInput.parse(data.salario);
      data.elegivelVale = !!data.elegivelVale;

      // Montar alocacaoAtual
      if (data.alocacao_contractId) {
        data.alocacaoAtual = {
          contractId: data.alocacao_contractId || null,
          dataInicio: data.alocacao_dataInicio || '',
          cicloTrabalho: parseInt(data.alocacao_cicloTrabalho) || 21,
          cicloFolga: parseInt(data.alocacao_cicloFolga) || 7,
        };
      } else {
        data.alocacaoAtual = null;
      }
      delete data.alocacao_contractId;
      delete data.alocacao_dataInicio;
      delete data.alocacao_cicloTrabalho;
      delete data.alocacao_cicloFolga;

      // Manter folgas existentes
      if (r) data.folgas = r.folgas || [];

      try {
        if (r) await Store.updateRecurso(recursoId, data);
        else await Store.createRecurso(data);
        window.showToast(r ? 'Cadastro atualizado' : 'Cadastro criado', 'success');
        close();
        this._renderLista();
      } catch (e) {
        window.showToast(e.message, 'error');
      }
    });
  },

  // ── MODAL FOLGAS ───────────────────────────────────────────────────────────
  showFolgas(recursoId) {
    const r = (Store.state.recursos || []).find((x) => x.id === recursoId);
    if (!r) return;

    const folgas = (r.folgas || []).sort((a, b) => new Date(b.dataInicio) - new Date(a.dataInicio));
    const infoProxima = this._calcProximaFolga(r);
    const contrato = r.alocacaoAtual?.contractId
      ? Store.state.contracts.find((c) => c.id === r.alocacaoAtual.contractId)
      : null;

    const html = `
      <div class="modal-overlay" id="modalFolgas">
        <div class="modal" style="width:680px;max-height:90vh;overflow-y:auto;">
          <div class="modal-header">
            <h2 class="modal-title">Folgas — ${escapeHtml(r.nome)}</h2>
            <button class="modal-close">✕</button>
          </div>
          <div class="modal-content">

            ${
              infoProxima
                ? (() => {
                    const { diasRestantes, dataProxima } = infoProxima;
                    const cor =
                      diasRestantes < 0 ? '#DC2626' : diasRestantes <= 5 ? '#D97706' : '#059669';
                    const msg =
                      diasRestantes < 0
                        ? `Vencida há ${Math.abs(diasRestantes)} dias`
                        : diasRestantes === 0
                          ? 'Folga devida hoje'
                          : `${diasRestantes} dias para a próxima folga`;
                    return `
                <div style="background:${cor}18;border:1px solid ${cor}44;border-radius:8px;padding:var(--sp-md);margin-bottom:var(--sp-lg);display:flex;justify-content:space-between;align-items:center;">
                  <div>
                    <div style="font-weight:700;color:${cor};font-size:15px;">${msg}</div>
                    <div style="font-size:15px;color:var(--color-text-muted);">
                      Próxima folga: ${this._fmtDate(dataProxima)} · Ciclo: ${r.alocacaoAtual?.cicloTrabalho || 21}d trabalho / ${r.alocacaoAtual?.cicloFolga || 7}d folga
                      ${contrato ? ` · Obra: ${escapeHtml(contrato.name)}` : ''}
                    </div>
                  </div>
                  <button class="btn btn-primary" id="btnNovaFolga">+ Registrar Folga</button>
                </div>`;
                  })()
                : `
              <div style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:8px;padding:var(--sp-md);margin-bottom:var(--sp-lg);">
                <p class="text-muted" style="margin:0;">Nenhuma alocação configurada. Edite o cadastro e defina a obra atual.</p>
              </div>`
            }

            <h3 style="font-size:15px;font-weight:700;margin-bottom:var(--sp-md);">Histórico de Folgas</h3>
            ${
              folgas.length === 0
                ? `<p class="text-muted text-center" style="padding:var(--sp-xl);">Nenhuma folga registrada</p>`
                : folgas.map((f) => this._renderFolgaCard(f, r)).join('')
            }
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnFecharFolgas">Fechar</button>
          </div>
        </div>
      </div>`;

    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalFolgas');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnFecharFolgas').addEventListener('click', close);
    const btnNova = document.getElementById('btnNovaFolga');
    if (btnNova)
      btnNova.addEventListener('click', () => {
        close();
        this.showNovaFolga(recursoId);
      });

    // botões de passagem
    overlay.querySelectorAll('.btn-comprar-passagem').forEach((b) =>
      b.addEventListener('click', (e) => {
        close();
        this.showComprarPassagem(recursoId, e.target.dataset.folgaId, e.target.dataset.tipo);
      })
    );
    overlay.querySelectorAll('.btn-excluir-folga').forEach((b) =>
      b.addEventListener('click', async (e) => {
        if (!confirm('Excluir este registro de folga?')) return;
        try {
          await Store.deleteFolga(recursoId, e.target.dataset.folgaId);
          close();
          this.showFolgas(recursoId);
        } catch (err) {
          window.showToast(err.message || 'Erro ao excluir folga', 'error');
          // NÃO chama close() — mantém modal aberto para retry
        }
      })
    );
  },

  _renderFolgaCard(f, r) {
    const vooInfo = (p) => {
      if (!p || !p.comprada) return '';
      const parts = [];
      if (p.companhia) parts.push(escapeHtml(p.companhia));
      if (p.numeroVoo) parts.push(`Voo ${escapeHtml(p.numeroVoo)}`);
      if (p.origem && p.destino) parts.push(`${escapeHtml(p.origem)} → ${escapeHtml(p.destino)}`);
      if (p.dataVoo) parts.push(this._fmtDate(p.dataVoo));
      if (p.horario) parts.push(p.horario);
      return parts.length
        ? `<div style="font-size:15px;color:var(--color-text-muted);margin-top:2px;">${parts.join(' · ')}</div>`
        : '';
    };

    const passagemStatus = (p, tipo) => {
      if (!p || !p.comprada) {
        return `<div><button class="btn btn-secondary btn-comprar-passagem" style="font-size:15px;padding:4px 10px;"
                  data-folga-id="${f.id}" data-tipo="${tipo}">Comprar ${tipo}</button></div>`;
      }
      const contratoPag =
        p.financiadoPor === 'contrato'
          ? Store.state.contracts.find((c) => c.id === p.contractIdPagador)
          : null;
      return `<div>
        <span style="font-size:15px;color:#059669;">
          ✓ ${Store.formatBRL ? Store.formatBRL(p.valor) : 'R$ ' + (p.valor || 0).toFixed(2)}
          · ${p.financiadoPor === 'contrato' && contratoPag ? contratoPag.name : 'Caixa da empresa'}
        </span>
        ${vooInfo(p)}
      </div>`;
    };

    return `
      <div style="border:1px solid var(--color-border);border-radius:8px;padding:var(--sp-md);margin-bottom:var(--sp-sm);background:var(--color-surface);">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <div style="font-weight:700;">${this._fmtDate(f.dataInicio)} → ${f.dataFim ? this._fmtDate(f.dataFim) : '?'}</div>
            <div style="font-size:15px;color:var(--color-text-muted);">${window.escapeHtml(f.observacoes || '')}</div>
          </div>
          <button class="btn-excluir-folga action-link danger" data-folga-id="${f.id}" style="font-size:15px;">Excluir</button>
        </div>
        <div style="display:grid;grid-template-columns:80px 1fr;gap:4px var(--sp-sm);margin-top:var(--sp-sm);align-items:start;">
          <div style="font-size:15px;color:var(--color-text-muted);padding-top:2px;">Ida:</div>
          ${passagemStatus(f.passagemIda, 'ida')}
          <div style="font-size:15px;color:var(--color-text-muted);padding-top:2px;">Volta:</div>
          ${passagemStatus(f.passagemVolta, 'volta')}
        </div>
      </div>`;
  },

  // ── MODAL NOVA FOLGA ───────────────────────────────────────────────────────
  showNovaFolga(recursoId) {
    const r = (Store.state.recursos || []).find((x) => x.id === recursoId);
    const infoProxima = this._calcProximaFolga(r);
    const cicloFolga = r?.alocacaoAtual?.cicloFolga || 7;
    const dataInicioDefault = infoProxima?.dataProxima || '';
    const dataFimDefault = dataInicioDefault
      ? (() => {
          const d = new Date(dataInicioDefault + 'T12:00:00');
          d.setDate(d.getDate() + cicloFolga - 1);
          return d.toISOString().split('T')[0];
        })()
      : '';

    const html = `
      <div class="modal-overlay" id="modalNovaFolga">
        <div class="modal" style="width:480px;">
          <div class="modal-header">
            <h2 class="modal-title">Registrar Folga — ${escapeHtml(r?.nome || '')}</h2>
            <button class="modal-close">✕</button>
          </div>
          <form id="formNovaFolga" class="modal-content">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Início da folga *</label>
                <input class="form-control" name="dataInicio" type="date" value="${dataInicioDefault}" required>
              </div>
              <div class="form-group">
                <label class="form-label">Fim da folga *</label>
                <input class="form-control" name="dataFim" type="date" value="${dataFimDefault}" required>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Observações</label>
              <textarea class="form-control" name="observacoes" style="min-height:60px;"></textarea>
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelarFolga">Cancelar</button>
            <button class="btn btn-primary" id="btnSalvarFolga">Registrar</button>
          </div>
        </div>
      </div>`;

    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalNovaFolga');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnCancelarFolga').addEventListener('click', close);

    document.getElementById('btnSalvarFolga').addEventListener('click', async () => {
      const fd = new FormData(document.getElementById('formNovaFolga'));
      const d = Object.fromEntries(fd);
      if (!d.dataInicio) {
        window.showToast('Data de início obrigatória', 'error');
        return;
      }
      try {
        await Store.addFolga(recursoId, d);
        window.showToast('Folga registrada', 'success');
        close();
        this.showFolgas(recursoId);
      } catch (e) {
        window.showToast(e.message, 'error');
      }
    });
  },

  // ── MODAL COMPRAR PASSAGEM ─────────────────────────────────────────────────
  showComprarPassagem(recursoId, folgaId, tipo) {
    const r = (Store.state.recursos || []).find((x) => x.id === recursoId);
    const contratoOptions = Store.state.contracts
      .filter((c) => c.status === 'ativo')
      .map(
        (c) => `<option value="${c.id}">${escapeHtml(c.name)} — ${escapeHtml(c.client)}</option>`
      )
      .join('');

    const html = `
      <div class="modal-overlay" id="modalPassagem">
        <div class="modal" style="width:500px;">
          <div class="modal-header">
            <h2 class="modal-title">Passagem de ${tipo === 'ida' ? 'Ida' : 'Volta'} — ${escapeHtml(r?.nome || '')}</h2>
            <button class="modal-close">✕</button>
          </div>
          <form id="formPassagem" class="modal-content">

            <h3 style="font-size:15px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:var(--sp-md);">Dados do Voo</h3>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Companhia Aérea</label>
                <input class="form-control" name="companhia" placeholder="Ex: LATAM, GOL, Azul">
              </div>
              <div class="form-group">
                <label class="form-label">Número do Voo</label>
                <input class="form-control" name="numeroVoo" placeholder="Ex: LA3042">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Origem</label>
                <input class="form-control" name="origem" placeholder="Ex: BH / CNF">
              </div>
              <div class="form-group">
                <label class="form-label">Destino</label>
                <input class="form-control" name="destino" placeholder="Ex: GRU / SP">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Data do Voo</label>
                <input class="form-control" name="dataVoo" type="date">
              </div>
              <div class="form-group">
                <label class="form-label">Horário</label>
                <input class="form-control" name="horario" type="time" placeholder="00:00">
              </div>
            </div>

            <div style="border-top:1px solid var(--color-border);padding-top:var(--sp-lg);margin-top:var(--sp-lg);">
              <h3 style="font-size:15px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:var(--sp-md);">Pagamento</h3>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Valor da passagem (R$) *</label>
                  <input class="form-control" name="valor" type="text" data-currency inputmode="numeric" placeholder="0,00" required>
                </div>
                <div class="form-group">
                  <label class="form-label">Data da compra *</label>
                  <input class="form-control" name="dataCompra" type="date" value="${new Date().toISOString().split('T')[0]}" required>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Quem paga? *</label>
                <select class="form-control" name="financiadoPor" id="selectFinanciador" required>
                  <option value="caixa">Caixa da empresa</option>
                  <option value="contrato">Contrato específico</option>
                </select>
              </div>
              <div class="form-group" id="selectContratoWrap" style="display:none;">
                <label class="form-label">Contrato pagador</label>
                <select class="form-control" name="contractIdPagador">
                  <option value="">Selecione...</option>
                  ${contratoOptions}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Como lançar no financeiro?</label>
                <select class="form-control" name="tipoLancamento">
                  <option value="caixa_direto">Saída direta no Caixa</option>
                  <option value="conta_pagar">Conta a Pagar (pendente)</option>
                </select>
              </div>
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelarPassagem">Cancelar</button>
            <button class="btn btn-primary" id="btnConfirmarPassagem">Confirmar Compra</button>
          </div>
        </div>
      </div>`;

    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalPassagem');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnCancelarPassagem').addEventListener('click', close);

    document.getElementById('selectFinanciador').addEventListener('change', (e) => {
      document.getElementById('selectContratoWrap').style.display =
        e.target.value === 'contrato' ? '' : 'none';
    });

    document.getElementById('btnConfirmarPassagem').addEventListener('click', async () => {
      const fd = new FormData(document.getElementById('formPassagem'));
      const d = Object.fromEntries(fd);
      const valor = window.BRLInput.parse(d.valor);
      if (!valor) {
        window.showToast('Informe o valor da passagem', 'error');
        return;
      }

      try {
        await Store.comprarPassagem(recursoId, folgaId, tipo, {
          valor,
          dataCompra: d.dataCompra,
          financiadoPor: d.financiadoPor,
          contractIdPagador: d.contractIdPagador || null,
          tipoLancamento: d.tipoLancamento,
        });
        window.showToast('Passagem registrada e lançada no financeiro', 'success');
        close();
        this.showFolgas(recursoId);
      } catch (e) {
        window.showToast(e.message, 'error');
      }
    });
  },

  // ── MAPA: FUNCIONÁRIO + OBRAS ──────────────────────────────────────────────
  // Helpers movidos para js/lib/geo.js (window.GeoUtils). Wrappers carregam o
  // módulo lazy se ainda não estiver disponível — economiza o request de geo.js
  // em rotas que não usam mapa.
  async _ensureGeo() {
    if (typeof window.GeoUtils === 'undefined' && window.RhinoLazy) {
      await window.RhinoLazy.ensure('geo');
    }
  },
  _haversine(lat1, lng1, lat2, lng2) {
    return window.GeoUtils.haversine(lat1, lng1, lat2, lng2);
  },
  _fetchRotaOSRM(lat1, lng1, lat2, lng2) {
    return window.GeoUtils.fetchRotaOSRM(lat1, lng1, lat2, lng2);
  },
  _fmtMin(min) {
    return window.GeoUtils && window.GeoUtils.fmtMin
      ? window.GeoUtils.fmtMin(min)
      : `${Math.round(min)} min`;
  },

  // Calcula rotas reais para cada obra via OSRM, com concorrência limitada.
  // Atualiza a UI (cards + header) e o mapa (troca linha reta por rota real) conforme cada resposta.
  async _calcularRotasReais(r, obras, map, obraLinhas, obraMarkers) {
    const lat1 = parseFloat(r.lat),
      lng1 = parseFloat(r.lng);
    const CONCORRENTES = 2;
    let idx = 0;
    let obrasComRota = 0;

    const processarUma = async (o) => {
      const isAtual = r.alocacaoAtual?.contractId === o.id;
      const rota = await this._fetchRotaOSRM(lat1, lng1, parseFloat(o.lat), parseFloat(o.lng));
      const card = document.querySelector(`.dist-obra-item[data-id="${o.id}"]`);
      if (!card) return; // modal foi fechado

      if (!rota) {
        // Falhou — marca como indisponível
        const durEl = card.querySelector('.dist-duracao');
        if (durEl)
          durEl.innerHTML = '<span style="color:var(--color-danger);">rota indisponível</span>';
        return;
      }

      o.distancia = rota.km;
      o.duracao = rota.min;
      obrasComRota++;

      // Atualiza card
      const cor = rota.km < 50 ? '#059669' : rota.km < 200 ? '#D97706' : '#DC2626';
      const kmEl = card.querySelector('.dist-km');
      const durEl = card.querySelector('.dist-duracao');
      if (kmEl)
        kmEl.innerHTML = `${rota.km.toFixed(1)} km <span style="font-size:15px;font-weight:500;color:var(--color-text-muted);">via rodovia</span>`;
      if (kmEl) kmEl.style.color = cor;
      if (durEl)
        durEl.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>~ ${this._fmtMin(rota.min)} de carro`;

      // Atualiza popup do marcador
      const mk = obraMarkers[o.id];
      if (mk)
        mk.setPopupContent(
          `<strong>${escapeHtml(o.name)}</strong><br><span style="font-size:15px;">${escapeHtml(o.client)}</span><br><strong style="color:${cor};">${rota.km.toFixed(1)} km</strong> · ${this._fmtMin(rota.min)} de carro`
        );

      // Substitui a linha reta pela rota real
      if (obraLinhas[o.id]) {
        obraLinhas[o.id].remove();
      }
      const rotaLinha = L.polyline(rota.coords, {
        color: isAtual ? '#059669' : '#2563EB',
        weight: isAtual ? 4 : 3,
        opacity: isAtual ? 0.9 : 0.7,
      }).addTo(map);
      obraLinhas[o.id] = rotaLinha;
    };

    const worker = async () => {
      while (idx < obras.length) {
        const o = obras[idx++];
        await processarUma(o);
      }
    };

    const workers = [];
    for (let i = 0; i < Math.min(CONCORRENTES, obras.length); i++) {
      workers.push(worker());
    }
    await Promise.all(workers);

    // Reordena lista por distância real (se houver rotas)
    const header = document.getElementById('distancias-header');
    const lista = document.getElementById('distancias-lista');
    if (header) {
      header.innerHTML =
        obrasComRota === obras.length
          ? `Distâncias via rodovia — ${obras.length} obra${obras.length !== 1 ? 's' : ''} ativa${obras.length !== 1 ? 's' : ''}`
          : `Distâncias via rodovia — ${obrasComRota} de ${obras.length} calculada${obrasComRota !== 1 ? 's' : ''}`;
    }
    if (lista && obrasComRota > 0) {
      const sorted = obras.slice().sort((a, b) => {
        const da = a.distancia ?? Infinity;
        const db = b.distancia ?? Infinity;
        if (da !== db) return da - db;
        return a.distLinhaReta - b.distLinhaReta;
      });
      // reordena cards no DOM
      sorted.forEach((o, i) => {
        const card = lista.querySelector(`.dist-obra-item[data-id="${o.id}"]`);
        if (card) {
          lista.appendChild(card);
          const numSpan = card.querySelector('span[style*="font-weight:600"]');
          if (numSpan) {
            const textAtual = numSpan.textContent.replace(/^\d+\.\s*/, '');
            numSpan.textContent = `${i + 1}. ${textAtual}`;
          }
          // atualiza barra de progresso relativa
          const maxKm =
            sorted[sorted.length - 1].distancia ?? sorted[sorted.length - 1].distLinhaReta;
          const val = o.distancia ?? o.distLinhaReta;
          const bar = card.querySelector('.dist-bar');
          if (bar) bar.style.width = Math.min(100, (val / (maxKm || 1)) * 100) + '%';
        }
      });
    }
  },

  async showDistancias(recursoId) {
    // Carrega geo.js sob demanda — só usado nesta tela e no mapa geral.
    await this._ensureGeo();
    const r = (Store.state.recursos || []).find((x) => x.id === recursoId);
    if (!r || !r.lat || !r.lng) return;

    const obras = Store.state.contracts
      .filter((c) => c.lat && c.lng && c.status === 'ativo')
      .map((o) => ({
        ...o,
        distLinhaReta: this._haversine(
          parseFloat(r.lat),
          parseFloat(r.lng),
          parseFloat(o.lat),
          parseFloat(o.lng)
        ),
        distancia: null, // distância real (rodovia) — preenchida via OSRM
        duracao: null, // minutos de direção
      }))
      .sort((a, b) => a.distLinhaReta - b.distLinhaReta);

    const html = `
      <div class="modal-overlay" id="modalDistancias">
        <div class="modal" style="width:820px;max-height:92vh;display:flex;flex-direction:column;">
          <div class="modal-header" style="flex-shrink:0;">
            <div>
              <h2 class="modal-title">Mapa — ${escapeHtml(r.nome)}</h2>
              <p style="font-size:15px;color:var(--color-text-muted);margin:0;">${escapeHtml(r.endereco || '')}</p>
            </div>
            <button class="modal-close">✕</button>
          </div>
          <div style="flex:1;overflow:hidden;display:flex;flex-direction:column;">
            <div id="mapaDistancias" style="height:380px;width:100%;"></div>
            <div style="padding:var(--sp-md);overflow-y:auto;flex:1;">
              ${
                obras.length === 0
                  ? `<p class="text-muted text-center" style="padding:var(--sp-lg);">Nenhuma obra ativa com localização cadastrada.</p>`
                  : `<p id="distancias-header" style="font-size:15px;color:var(--color-text-muted);margin-bottom:var(--sp-sm);display:flex;align-items:center;gap:8px;">
                     <span class="spinner" style="width:12px;height:12px;border-width:2px;margin:0;"></span>
                     Calculando distâncias reais (via rodovia) — ${obras.length} obra${obras.length !== 1 ? 's' : ''} ativa${obras.length !== 1 ? 's' : ''}
                   </p>
                   <div id="distancias-lista" style="display:flex;flex-direction:column;gap:var(--sp-sm);">
                    ${obras
                      .map((o, i) => {
                        const km = o.distLinhaReta.toFixed(1);
                        const cor =
                          o.distLinhaReta < 50
                            ? '#059669'
                            : o.distLinhaReta < 200
                              ? '#D97706'
                              : '#DC2626';
                        const isAtual = r.alocacaoAtual?.contractId === o.id;
                        return `<div class="dist-obra-item" data-id="${o.id}" style="padding:var(--sp-sm) var(--sp-md);background:var(--color-surface);border:1px solid ${isAtual ? '#059669' : 'var(--color-border)'};border-radius:8px;cursor:pointer;transition:border-color .15s;">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
                          <div style="flex:1;min-width:0;">
                            <span style="font-weight:600;font-size:15px;">${i + 1}. ${escapeHtml(o.name)}</span>
                            ${isAtual ? `<span style="margin-left:6px;font-size:15px;background:#D1FAE5;color:#065F46;padding:1px 5px;border-radius:3px;font-weight:700;">OBRA ATUAL</span>` : ''}
                            <div style="font-size:15px;color:var(--color-text-muted);">${escapeHtml(o.client)}${o.endereco ? ' · ' + escapeHtml(o.endereco) : ''}</div>
                          </div>
                          <div style="text-align:right;white-space:nowrap;">
                            <div class="dist-km" style="font-size:16px;font-weight:700;color:${cor};">${km} km <span style="font-size:15px;font-weight:500;color:var(--color-text-muted);">(reta)</span></div>
                            <div class="dist-duracao" style="font-size:15px;color:var(--color-text-muted);display:flex;align-items:center;gap:4px;justify-content:flex-end;">
                              <span class="spinner" style="width:9px;height:9px;border-width:1.5px;margin:0;"></span>
                              calculando...
                            </div>
                          </div>
                        </div>
                        <div style="height:4px;background:var(--color-border);border-radius:2px;">
                          <div class="dist-bar" style="height:4px;width:0%;background:${cor};border-radius:2px;transition:width .4s;"></div>
                        </div>
                      </div>`;
                      })
                      .join('')}
                  </div>`
              }
            </div>
          </div>
        </div>
      </div>`;

    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalDistancias');

    const close = () => {
      if (this._distMap) {
        this._distMap.remove();
        this._distMap = null;
      }
      overlay.remove();
    };
    overlay.querySelector('.modal-close').addEventListener('click', close);

    // Inicializar mapa (Leaflet sob demanda)
    setTimeout(async () => {
      if (typeof L === 'undefined' && window.RhinoLazy) await window.RhinoLazy.ensure('leaflet');
      if (typeof L === 'undefined') return;
      const map = L.map('mapaDistancias').setView([parseFloat(r.lat), parseFloat(r.lng)], 6);
      this._distMap = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 18,
      }).addTo(map);

      // Ícone do funcionário (azul)
      const iconeFuncionario = L.divIcon({
        className: '',
        html: `<div style="background:#2563EB;color:#fff;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 8px rgba(0,0,0,.4);border:2px solid #fff;">👤</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      // Ícone das obras (verde/amarelo)
      const iconeObra = (isAtual) =>
        L.divIcon({
          className: '',
          html: `<div style="background:${isAtual ? '#059669' : '#D97706'};color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 2px 8px rgba(0,0,0,.4);border:2px solid #fff;">🏗</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

      // Marcador do funcionário
      const markerFun = L.marker([parseFloat(r.lat), parseFloat(r.lng)], { icon: iconeFuncionario })
        .addTo(map)
        .bindPopup(
          `<strong>${escapeHtml(r.nome)}</strong><br><span style="font-size:15px;">${escapeHtml(r.endereco || 'Residência')}</span>`
        );

      const bounds = [[parseFloat(r.lat), parseFloat(r.lng)]];
      const obraMarkers = {};
      const obraLinhas = {}; // polyline reta inicial por obraId

      // Marcadores das obras + linhas retas iniciais (substituídas pela rota real)
      obras.forEach((o) => {
        const oLat = parseFloat(o.lat),
          oLng = parseFloat(o.lng);
        const isAtual = r.alocacaoAtual?.contractId === o.id;
        bounds.push([oLat, oLng]);

        const linhaReta = L.polyline(
          [
            [parseFloat(r.lat), parseFloat(r.lng)],
            [oLat, oLng],
          ],
          {
            color: isAtual ? '#059669' : '#94A3B8',
            weight: isAtual ? 2.5 : 1.5,
            dashArray: '4,6',
            opacity: 0.4,
          }
        ).addTo(map);
        obraLinhas[o.id] = linhaReta;

        const km = o.distLinhaReta.toFixed(1);
        const cor =
          o.distLinhaReta < 50 ? '#059669' : o.distLinhaReta < 200 ? '#D97706' : '#DC2626';
        const marker = L.marker([oLat, oLng], { icon: iconeObra(isAtual) })
          .addTo(map)
          .bindPopup(
            `<strong>${escapeHtml(o.name)}</strong><br><span style="font-size:15px;">${escapeHtml(o.client)}</span><br><strong style="color:${cor};">${km} km (reta)</strong>`
          );

        obraMarkers[o.id] = marker;
      });

      // Ajustar zoom para mostrar tudo
      if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [40, 40] });
      }

      // Calcular rotas reais via OSRM em paralelo com limite de 2 concorrentes
      this._calcularRotasReais(r, obras, map, obraLinhas, obraMarkers);

      // Clicar na linha da lista foca no mapa
      document.querySelectorAll('.dist-obra-item').forEach((item) => {
        item.addEventListener('click', () => {
          const obra = obras.find((o) => o.id === item.dataset.id);
          if (!obra) return;
          map.setView([parseFloat(obra.lat), parseFloat(obra.lng)], 10);
          obraMarkers[obra.id]?.openPopup();
        });
      });

      map.invalidateSize();
    }, 100);
  },

  // ── MAPA GERAL: TODOS OS FUNCIONÁRIOS + TODAS AS OBRAS ────────────────────
  showMapaGeral() {
    const recursos = (Store.state.recursos || []).filter(
      (r) => r.status === 'funcionario' && r.lat && r.lng
    );
    const obras = (Store.state.contracts || []).filter(
      (c) => c.lat && c.lng && c.status === 'ativo'
    );

    const html = `
      <div class="modal-overlay" id="modalMapaGeral">
        <div class="modal" style="width:92vw;max-width:1100px;max-height:92vh;display:flex;flex-direction:column;">
          <div class="modal-header" style="flex-shrink:0;">
            <div>
              <h2 class="modal-title">Mapa Geral — Funcionários e Obras</h2>
              <p style="font-size:15px;color:var(--color-text-muted);margin:0;">${recursos.length} funcionário${recursos.length !== 1 ? 's' : ''} com localização · ${obras.length} obra${obras.length !== 1 ? 's' : ''} ativa${obras.length !== 1 ? 's' : ''}</p>
            </div>
            <div style="display:flex;gap:var(--sp-sm);align-items:center;">
              <span style="font-size:15px;color:var(--color-text-muted);">
                <span style="display:inline-block;width:12px;height:12px;background:#2563EB;border-radius:50%;margin-right:4px;vertical-align:middle;"></span>Funcionário
                <span style="display:inline-block;width:12px;height:12px;background:#059669;border-radius:50%;margin:0 4px 0 12px;vertical-align:middle;"></span>Obra
              </span>
              <button class="modal-close">✕</button>
            </div>
          </div>
          <div id="mapaGeral" style="flex:1;min-height:500px;"></div>
        </div>
      </div>`;

    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalMapaGeral');

    const close = () => {
      if (this._mapaGeral) {
        this._mapaGeral.remove();
        this._mapaGeral = null;
      }
      overlay.remove();
    };
    overlay.querySelector('.modal-close').addEventListener('click', close);

    setTimeout(async () => {
      if (typeof L === 'undefined' && window.RhinoLazy) await window.RhinoLazy.ensure('leaflet');
      if (typeof L === 'undefined') return;
      const centerLat = recursos.length
        ? parseFloat(recursos[0].lat)
        : obras.length
          ? parseFloat(obras[0].lat)
          : -15;
      const centerLng = recursos.length
        ? parseFloat(recursos[0].lng)
        : obras.length
          ? parseFloat(obras[0].lng)
          : -47;
      const map = L.map('mapaGeral').setView([centerLat, centerLng], 5);
      this._mapaGeral = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 18,
      }).addTo(map);

      const bounds = [];

      // Marcadores dos funcionários
      recursos.forEach((r) => {
        const lat = parseFloat(r.lat),
          lng = parseFloat(r.lng);
        bounds.push([lat, lng]);
        const obraAtual = r.alocacaoAtual?.contractId
          ? obras.find((o) => o.id === r.alocacaoAtual.contractId)
          : null;

        const icone = L.divIcon({
          className: '',
          html: `<div style="background:#2563EB;color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 2px 6px rgba(0,0,0,.35);border:2px solid #fff;" title="${escapeHtml(r.nome)}">👤</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        L.marker([lat, lng], { icon: icone })
          .addTo(map)
          .bindPopup(
            `<strong>${escapeHtml(r.nome)}</strong><br>
           <span style="font-size:15px;color:#374151;">${escapeHtml(window.Recursos._normalizeCargo(r.profissao))}</span><br>
           ${obraAtual ? `<span style="font-size:15px;">📍 ${escapeHtml(obraAtual.name)}</span>` : ''}
           <br><span style="font-size:15px;color:#374151;">${escapeHtml(r.endereco || '')}</span>`
          );

        // Linha até a obra atual
        if (obraAtual && obraAtual.lat && obraAtual.lng) {
          L.polyline(
            [
              [lat, lng],
              [parseFloat(obraAtual.lat), parseFloat(obraAtual.lng)],
            ],
            {
              color: '#2563EB',
              weight: 1.5,
              dashArray: '5,5',
              opacity: 0.5,
            }
          ).addTo(map);
        }
      });

      // Marcadores das obras
      obras.forEach((o) => {
        const lat = parseFloat(o.lat),
          lng = parseFloat(o.lng);
        bounds.push([lat, lng]);
        const nFunc = recursos.filter((r) => r.alocacaoAtual?.contractId === o.id).length;

        const icone = L.divIcon({
          className: '',
          html: `<div style="background:#059669;color:#fff;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 2px 6px rgba(0,0,0,.35);border:2px solid #fff;">🏗</div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        });

        L.marker([lat, lng], { icon: icone })
          .addTo(map)
          .bindPopup(
            `<strong>${escapeHtml(o.name)}</strong><br>
           <span style="font-size:15px;color:#374151;">${escapeHtml(o.client)}</span><br>
           ${nFunc > 0 ? `<span style="font-size:15px;">👥 ${nFunc} funcionário${nFunc !== 1 ? 's' : ''} alocado${nFunc !== 1 ? 's' : ''}</span>` : ''}
           <br><span style="font-size:15px;color:#374151;">${escapeHtml(o.endereco || '')}</span>`
          );
      });

      if (bounds.length > 0) map.fitBounds(bounds, { padding: [40, 40] });
      map.invalidateSize();
    }, 100);
  },

  // ── ENDEREÇO SEARCH ────────────────────────────────────────────────────────
  _initEnderecoSearch(lat, lng, enderecoSalvo) {
    const input = document.getElementById('enderecoInputRec');
    const dropdown = document.getElementById('nominatimDropdownRec');
    const latInput = document.getElementById('enderecoLatRec');
    const lngInput = document.getElementById('enderecoLngRec');
    const mapaDiv = document.getElementById('miniMapaRec');
    if (!input) return;

    const mostrarMapa = (la, lo, label) => {
      mapaDiv.style.display = 'block';
      setTimeout(async () => {
        if (typeof L === 'undefined' && window.RhinoLazy) await window.RhinoLazy.ensure('leaflet');
        if (typeof L === 'undefined') return;
        // Guard: a view pode ter sido trocada antes do timer (50ms) → mapaDiv fora do DOM
        // ("Map container not found"). Só inicializa se o container ainda está montado.
        if (!mapaDiv || !document.contains(mapaDiv)) return;
        if (this._miniMap) {
          this._miniMap.remove();
          this._miniMap = null;
        }
        this._miniMap = L.map(mapaDiv, { zoomControl: true, scrollWheelZoom: false }).setView(
          [la, lo],
          14
        );
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap',
        }).addTo(this._miniMap);
        L.marker([la, lo]).addTo(this._miniMap).bindPopup(label).openPopup();
      }, 50);
    };

    if (lat && lng) mostrarMapa(parseFloat(lat), parseFloat(lng), enderecoSalvo || 'Local');

    let debounce = null;
    input.addEventListener('input', () => {
      clearTimeout(debounce);
      const q = input.value.trim();
      if (q.length < 4) {
        dropdown.style.display = 'none';
        return;
      }
      debounce = setTimeout(async () => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=6&addressdetails=1`,
            { headers: { 'Accept-Language': 'pt-BR,pt;q=0.9' } }
          );
          const results = await res.json();
          if (!results.length) {
            dropdown.style.display = 'none';
            return;
          }
          // FIX P0-2: escapa retorno do Nominatim.
          dropdown.innerHTML = results
            .map((r) => {
              const name = r.display_name.split(',').slice(0, 3).join(',');
              const detail = r.display_name.split(',').slice(3).join(',').trim();
              return `<div class="nominatim-item" data-lat="${window.escapeHtml(r.lat)}" data-lng="${window.escapeHtml(r.lon)}" data-name="${window.escapeHtml(r.display_name)}"><strong>${window.escapeHtml(name)}</strong><span>${window.escapeHtml(detail)}</span></div>`;
            })
            .join('');
          dropdown.style.display = 'block';
          dropdown.querySelectorAll('.nominatim-item').forEach((el) => {
            el.addEventListener('click', () => {
              const la = parseFloat(el.dataset.lat),
                lo = parseFloat(el.dataset.lng),
                nome = el.dataset.name;
              input.value = nome;
              latInput.value = la;
              lngInput.value = lo;
              dropdown.style.display = 'none';
              mostrarMapa(la, lo, nome);
            });
          });
        } catch {
          dropdown.style.display = 'none';
        }
      }, 450);
    });

    const _onDocClickRec = (e) => {
      if (!document.getElementById('enderecoWrapRec')?.contains(e.target))
        dropdown.style.display = 'none';
    };
    document.addEventListener('click', _onDocClickRec);
    window.viewLifecycle &&
      window.viewLifecycle.onCleanup(() => document.removeEventListener('click', _onDocClickRec));
  },

  async deleteRecurso(id) {
    if (!confirm('Excluir este cadastro?')) return;
    try {
      await Store.deleteRecurso(id);
      window.showToast('Cadastro removido', 'success');
      this._renderLista();
    } catch (e) {
      window.showToast(e.message, 'error');
    }
  },
};
