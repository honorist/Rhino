window.NotasFiscais = {
  currentView: 'lista',
  currentMonth: new Date(),
  // Paginação da aba Lista (UIKit.paginate) — antes despejava todas as NFs no DOM.
  _page: 1,
  _pageSize: 25,
  _paginaAtual: null,

  async render() {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading-spinner">Carregando...</div>';

    try {
      await Store.loadAll();

      const todas = Store.state.notas_fiscais;
      const pendentes = todas.filter((nf) => !nf.emitida);
      const emitidas = todas.filter((nf) => nf.emitida);
      const nfsVencidas = pendentes.filter(
        (nf) => Store.getNotaFiscalStatus(nf.dataLimite).status === 'vencida'
      );
      const nfsProximas = pendentes.filter(
        (nf) => Store.getNotaFiscalStatus(nf.dataLimite).status === 'proximo_vencer'
      );
      const nfsPrazo = pendentes.filter(
        (nf) => Store.getNotaFiscalStatus(nf.dataLimite).status === 'no_prazo'
      );

      const total = todas.length;
      const pctOk =
        total > 0 ? Math.round(((nfsPrazo.length + emitidas.length) / total) * 100) : 100;

      const statusGeral =
        nfsVencidas.length > 0
          ? { cor: '#E53E3E', bg: 'rgba(229,62,62,.07)', texto: 'Atenção urgente', icone: '🔴' }
          : nfsProximas.length > 0
            ? { cor: '#D69E2E', bg: 'rgba(214,158,46,.07)', texto: 'Requer atenção', icone: '⚠️' }
            : { cor: '#38A169', bg: 'rgba(56,161,105,.07)', texto: 'Tudo em dia', icone: '✅' };

      // Próximas a vencer (apenas pendentes, até 30 dias, ordenadas)
      const proximasTimeline = pendentes
        .filter((nf) => {
          const diff = Math.floor((new Date(nf.dataLimite + 'T12:00:00') - new Date()) / 86400000);
          return diff >= -30 && diff <= 30;
        })
        .sort((a, b) => new Date(a.dataLimite) - new Date(b.dataLimite))
        .slice(0, 5);

      const html = `
        <!-- Header (UIKit — padrão B) -->
        ${
          window.UIKit?.pageHeader
            ? window.UIKit.pageHeader({
                title: 'Contas a Receber',
                subtitle: `Notas fiscais e recebimentos previstos · ${total} nota${total !== 1 ? 's' : ''} registrada${total !== 1 ? 's' : ''}`,
                actions:
                  '<button class="btn btn-secondary" id="btnExportarNF">Exportar CSV</button> <button class="btn btn-primary btn-lg" id="btnNovoNF">+ Nova Conta a Receber</button>',
              })
            : ''
        }

        <!-- KPIs (UIKit — padrão B) -->
        ${
          window.UIKit?.kpiGrid
            ? window.UIKit.kpiGrid([
                {
                  icon: '🔴',
                  label: 'Vencidas',
                  value: nfsVencidas.length,
                  color: 'var(--color-danger)',
                },
                {
                  icon: '⚠️',
                  label: 'Próx. 7d',
                  value: nfsProximas.length,
                  color: 'var(--color-warning)',
                },
                {
                  icon: '✅',
                  label: 'No prazo',
                  value: nfsPrazo.length,
                  color: 'var(--color-success)',
                },
                {
                  icon: '📤',
                  label: 'Emitidas',
                  value: emitidas.length,
                  color: 'var(--color-info)',
                },
                {
                  icon: statusGeral.icone,
                  label: 'Saúde dos prazos',
                  value: `${pctOk}%`,
                  color: statusGeral.cor,
                  hint: statusGeral.texto,
                },
              ])
            : ''
        }

        <!-- Timeline de próximos vencimentos -->
        ${
          proximasTimeline.length > 0
            ? `
          <div class="card" style="margin-bottom:var(--sp-xl);">
            <div class="card-header">
              <h3 class="card-title">Próximos Vencimentos</h3>
            </div>
            <div style="display:flex;flex-direction:column;gap:0;">
              ${proximasTimeline
                .map((nf, idx) => {
                  const contract = Store.getContractById(nf.contractId);
                  const st = Store.getNotaFiscalStatus(nf.dataLimite);
                  const dias = Math.floor(
                    (new Date(nf.dataLimite + 'T12:00:00') - new Date()) / 86400000
                  );
                  const cor =
                    st.status === 'vencida'
                      ? '#E53E3E'
                      : st.status === 'proximo_vencer'
                        ? '#D69E2E'
                        : '#38A169';
                  const diasTxt =
                    dias < 0 ? `${Math.abs(dias)}d atrás` : dias === 0 ? 'HOJE' : `em ${dias}d`;
                  return `
                  <div style="display:flex;align-items:center;gap:var(--sp-lg);padding:var(--sp-md) 0;${idx < proximasTimeline.length - 1 ? 'border-bottom:1px solid var(--color-border);' : ''}">
                    <!-- Indicador de dia -->
                    <div style="text-align:center;min-width:52px;">
                      <div style="font-size:20px;font-weight:900;color:${cor};line-height:1;">${new Date(nf.dataLimite + 'T12:00:00').getDate()}</div>
                      <div style="font-size:15px;color:var(--color-text-muted);text-transform:uppercase;">${new Date(nf.dataLimite + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short' })}</div>
                    </div>
                    <!-- Linha vertical -->
                    <div style="width:3px;height:36px;background:${cor};border-radius:99px;flex-shrink:0;"></div>
                    <!-- Detalhes -->
                    <div style="flex:1;">
                      <div style="font-weight:600;font-size:15px;">NF ${escapeHtml(nf.numero)}</div>
                      <div style="font-size:15px;color:var(--color-text-muted);">${escapeHtml(contract?.name) || '—'} · ${escapeHtml(contract?.client) || '—'}</div>
                    </div>
                    <!-- Countdown -->
                    <div style="text-align:right;">
                      <div style="font-weight:800;font-size:15px;color:${cor};">${diasTxt}</div>
                      <div style="font-size:15px;color:var(--color-text-muted);">${new Date(nf.dataLimite + 'T12:00:00').toLocaleDateString('pt-BR')}</div>
                    </div>
                  </div>
                `;
                })
                .join('')}
            </div>
          </div>
        `
            : ''
        }

        <!-- Abas (UIKit.viewToggle — padrão B) -->
        <div style="margin-bottom:var(--sp-lg);">
          ${
            window.UIKit?.viewToggle
              ? window.UIKit.viewToggle({
                  current: this.currentView,
                  options: [
                    { value: 'lista', label: '☰ Lista Geral' },
                    { value: 'semanal', label: '🗓 Semanal' },
                    { value: 'mensal', label: '📅 Mensal' },
                  ],
                })
              : ''
          }
        </div>

        <!-- Conteúdo das abas -->
        <div id="tabContent">
          ${this.currentView === 'lista' ? this.renderLista() : ''}
          ${this.currentView === 'semanal' ? this.renderSemanal() : ''}
          ${this.currentView === 'mensal' ? this.renderMensal() : ''}
        </div>
      `;

      app.innerHTML = html;

      document.getElementById('btnNovoNF').addEventListener('click', () => this.showModal());
      document.getElementById('btnExportarNF').addEventListener('click', () => this._exportarCSV(todas));
      document.querySelectorAll('.ui-view-toggle button[data-view]').forEach((b) => {
        b.addEventListener('click', () => {
          this.currentView = b.dataset.view;
          this._page = 1; // trocar de aba recomeça a paginação
          this.render();
        });
      });

      if (this.currentView === 'lista' && this._paginaAtual) {
        window.UIKit.wirePagination(app, this._paginaAtual, ({ page, pageSize }) => {
          this._page = page;
          this._pageSize = pageSize;
          this.render();
        });
      }

      this.attachListeners();
    } catch (e) {
      console.error(e);
      app.innerHTML =
        '<div class="card"><p class="text-danger">Erro ao carregar notas fiscais. Tente novamente.</p></div>';
    }
  },

  _exportarCSV(lista) {
    const STATUS_LABEL = { vencida: 'Vencida', proximo_vencer: 'Próx. vencimento', no_prazo: 'No prazo' };
    const rows = [['NF', 'Obra', 'Vencimento', 'Valor', 'Situação']];
    lista.forEach((nf) => {
      const contract = Store.getContractById(nf.contractId);
      const situacao = nf.emitida ? 'Emitida' : (STATUS_LABEL[Store.getNotaFiscalStatus(nf.dataLimite).status] || '');
      rows.push([
        nf.numero || '',
        contract ? contract.name : '',
        nf.dataLimite || '',
        parseFloat(nf.valor) || 0,
        situacao,
      ]);
    });
    window.UIKit.downloadCsv(`notas_fiscais_rhino_${new Date().toISOString().slice(0, 10)}.csv`, rows);
  },

  renderLista() {
    if (Store.state.notas_fiscais.length === 0) {
      return `<div class="card"><p class="text-muted" style="padding:var(--sp-lg);">Nenhuma nota fiscal registrada</p></div>`;
    }

    const sorted = [...Store.state.notas_fiscais].sort((a, b) => {
      // Emitidas vão para o fim
      if (a.emitida !== b.emitida) return a.emitida ? 1 : -1;
      return new Date(a.dataLimite) - new Date(b.dataLimite);
    });

    const pagina = window.UIKit.paginate(sorted, this._page, this._pageSize);
    this._page = pagina.page;
    this._paginaAtual = pagina;

    return `
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">NF</th>
                <th scope="col">Contrato/Cliente</th>
                <th scope="col" class="num">Valor</th>
                <th scope="col">Data Limite</th>
                <th scope="col">Recebimento</th>
                <th scope="col">Situação</th>
                <th scope="col">Ações</th>
              </tr>
            </thead>
            <tbody>
              ${pagina.slice
                .map((nf) => {
                  const contract = Store.getContractById(nf.contractId);
                  const st = Store.getNotaFiscalStatus(nf.dataLimite);
                  const prazo = Number.isFinite(parseInt(nf.prazoRecebimento))
                    ? parseInt(nf.prazoRecebimento)
                    : 30;

                  // Calcular data prevista de recebimento
                  const baseData = nf.emitida ? nf.dataEmissaoReal : nf.dataLimite;
                  const dtRecebimento = new Date(baseData + 'T12:00:00');
                  dtRecebimento.setDate(dtRecebimento.getDate() + prazo);
                  const diasAteRecebimento = Math.floor((dtRecebimento - new Date()) / 86400000);

                  // Label da situação
                  let situacaoHTML;
                  if (nf.emitida) {
                    situacaoHTML = `
                    ${window.UIKit?.statusPill ? window.UIKit.statusPill('emitida') : 'Emitida'}
                    <div style="font-size:15px;color:var(--color-text-muted);margin-top:2px;">em ${new Date(nf.dataEmissaoReal + 'T12:00:00').toLocaleDateString('pt-BR')}</div>
                  `;
                  } else {
                    const diasTxt =
                      st.status === 'vencida'
                        ? `${Math.abs(Math.floor((new Date(nf.dataLimite) - new Date()) / 86400000))}d atrás`
                        : `em ${st.dias}d`;
                    situacaoHTML = `
                    ${window.UIKit?.statusPill ? window.UIKit.statusPill(st.status) : st.status}
                    <div style="font-size:15px;color:var(--color-text-muted);margin-top:2px;">${diasTxt}</div>
                  `;
                  }

                  return `
                  <tr class="row-nf" data-id="${nf.id}" style="cursor:pointer;${nf.emitida ? 'opacity:0.75;' : ''}">
                    <td><strong>${escapeHtml(nf.numero)}</strong></td>
                    <td>
                      ${escapeHtml(contract?.name) || '—'}
                      <div style="font-size:15px;color:var(--color-text-muted);">${escapeHtml(contract?.client) || '—'}</div>
                    </td>
                    <td class="num">${Store.formatBRL(nf.valor || 0)}</td>
                    <td>${new Date(nf.dataLimite + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                    <td>
                      <div style="font-size:15px;font-weight:600;color:${nf.emitida ? 'var(--color-info)' : 'var(--color-text-muted)'};">${dtRecebimento.toLocaleDateString('pt-BR')}</div>
                      <div style="font-size:15px;color:var(--color-text-muted);">${prazo}d após emissão${nf.emitida && diasAteRecebimento >= 0 ? ` · em ${diasAteRecebimento}d` : nf.emitida && diasAteRecebimento < 0 ? ' · recebido' : ''}</div>
                    </td>
                    <td>${situacaoHTML}</td>
                    <td>
                      <div class="actions-cell" style="flex-wrap:wrap;">
                        ${
                          !nf.emitida
                            ? `<button type="button" class="action-link btn-emitir-nf" data-id="${nf.id}" style="color:var(--color-success);font-weight:600;">✓ Marcar Emitida</button>`
                            : `<button type="button" class="action-link btn-cancelar-emissao" data-id="${nf.id}" style="color:var(--color-warning);">↶ Desfazer Emissão</button>`
                        }
                        <button type="button" class="action-link btn-editar-nf" data-id="${nf.id}">Editar</button>
                        <button type="button" class="action-link danger btn-excluir-nf" data-id="${nf.id}">Excluir</button>
                      </div>
                    </td>
                  </tr>
                `;
                })
                .join('')}
            </tbody>
          </table>
        </div>
        ${window.UIKit.pagination(pagina, { label: 'notas fiscais' })}
      </div>
    `;
  },

  renderSemanal() {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    // Calcular semanas: semana atual + próximas 4 semanas
    const semanas = [];
    for (let s = 0; s < 5; s++) {
      const inicioSemana = new Date(hoje);
      const diaSemana = hoje.getDay();
      inicioSemana.setDate(hoje.getDate() - diaSemana + s * 7);
      const fimSemana = new Date(inicioSemana);
      fimSemana.setDate(inicioSemana.getDate() + 6);
      semanas.push({ inicio: inicioSemana, fim: fimSemana });
    }

    return `
      <div style="display:flex; flex-direction:column; gap:var(--sp-lg);">
        ${semanas
          .map((sem, idx) => {
            const nfsSem = Store.state.notas_fiscais
              .filter((nf) => {
                const d = new Date(nf.dataLimite + 'T12:00:00');
                return d >= sem.inicio && d <= sem.fim;
              })
              .sort((a, b) => new Date(a.dataLimite) - new Date(b.dataLimite));

            const temRisco = nfsSem.some(
              (nf) => Store.getNotaFiscalStatus(nf.dataLimite).status !== 'no_prazo'
            );
            const label =
              idx === 0 ? 'Esta semana' : idx === 1 ? 'Próxima semana' : `Em ${idx} semanas`;

            return `
            <div class="card" style="border-left:4px solid ${temRisco ? 'var(--color-warning)' : nfsSem.length > 0 ? 'var(--color-primary)' : 'var(--color-border)'};">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:${nfsSem.length > 0 ? 'var(--sp-md)' : '0'};">
                <div>
                  <div style="font-weight:700;">${label}</div>
                  <div style="font-size:15px;color:var(--color-text-muted);">
                    ${sem.inicio.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} — ${sem.fim.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                  </div>
                </div>
                <span style="font-size:15px;font-weight:700;color:${nfsSem.length > 0 ? 'var(--color-primary)' : 'var(--color-text-muted)'};">
                  ${nfsSem.length} NF${nfsSem.length !== 1 ? 's' : ''}
                </span>
              </div>
              ${
                nfsSem.length > 0
                  ? `
                <div class="table-wrap">
                  <table>
                    <thead>
                      <tr><th scope="col">NF</th><th scope="col">Cliente</th><th scope="col">Data Limite</th><th scope="col">Status</th></tr>
                    </thead>
                    <tbody>
                      ${nfsSem
                        .map((nf) => {
                          const contract = Store.getContractById(nf.contractId);
                          const st = Store.getNotaFiscalStatus(nf.dataLimite);
                          return `
                          <tr>
                            <td><strong>${escapeHtml(nf.numero)}</strong></td>
                            <td>${escapeHtml(contract?.client || '—')}</td>
                            <td>${new Date(nf.dataLimite + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                            <td>${window.UIKit?.statusPill ? window.UIKit.statusPill(st.status, st.dias >= 0 ? `${st.dias}d` : 'Vencida') : st.status}</td>
                          </tr>
                        `;
                        })
                        .join('')}
                    </tbody>
                  </table>
                </div>
              `
                  : `<p style="color:var(--color-text-muted);font-size:15px;margin:0;">Nenhuma nota fiscal nesta semana</p>`
              }
            </div>
          `;
          })
          .join('')}
      </div>
    `;
  },

  renderMensal() {
    const ano = this.currentMonth.getFullYear();
    const mes = this.currentMonth.getMonth();
    const numDias = new Date(ano, mes + 1, 0).getDate();
    const primeiroDia = new Date(ano, mes, 1).getDay();

    const nfsMes = Store.state.notas_fiscais.filter((nf) => {
      const d = new Date(nf.dataLimite + 'T12:00:00');
      return d.getFullYear() === ano && d.getMonth() === mes;
    });

    const celulas = [];
    for (let i = 0; i < primeiroDia; i++) celulas.push(null);
    for (let i = 1; i <= numDias; i++) celulas.push(i);

    const linhas = [];
    for (let i = 0; i < celulas.length; i += 7) linhas.push(celulas.slice(i, i + 7));

    return `
      <div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--sp-lg);">
          <button class="btn btn-sm btn-secondary" id="btnMesAnterior">← Anterior</button>
          <h3 style="margin:0;font-size:16px;font-weight:700;">
            ${this.currentMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
          </h3>
          <button class="btn btn-sm btn-secondary" id="btnProximoMes">Próximo →</button>
        </div>
        <div class="card">
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr>
                ${['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d) => `<th scope="col" style="padding:var(--sp-sm);text-align:center;font-size:15px;color:var(--color-text-muted);text-transform:uppercase;">${d}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${linhas
                .map(
                  (linha) => `
                <tr>
                  ${[...Array(7)]
                    .map((_, i) => {
                      const dia = linha[i] ?? null;
                      if (!dia) return `<td style="background:var(--color-bg);"></td>`;

                      const nfsDodia = nfsMes.filter(
                        (nf) => new Date(nf.dataLimite + 'T12:00:00').getDate() === dia
                      );
                      const temRisco = nfsDodia.some(
                        (nf) => Store.getNotaFiscalStatus(nf.dataLimite).status !== 'no_prazo'
                      );
                      const ehHoje =
                        new Date().getDate() === dia &&
                        new Date().getMonth() === mes &&
                        new Date().getFullYear() === ano;

                      return `
                      <td style="border:1px solid var(--color-border);padding:var(--sp-sm);min-height:80px;vertical-align:top;background:${ehHoje ? 'rgba(46,125,82,.06)' : 'white'};">
                        <div style="font-weight:${ehHoje ? '800' : '500'};font-size:15px;margin-bottom:4px;color:${ehHoje ? 'var(--color-primary)' : 'inherit'};">${dia}</div>
                        ${nfsDodia
                          .map((nf) => {
                            const st = Store.getNotaFiscalStatus(nf.dataLimite);
                            const icon =
                              st.status === 'vencida'
                                ? '🔴'
                                : st.status === 'proximo_vencer'
                                  ? '⚠️'
                                  : '🟢';
                            return `<div style="font-size:15px;padding:2px 4px;margin-bottom:2px;border-radius:3px;background:var(--color-primary);color:white;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="NF ${escapeHtml(nf.numero)}">${icon} NF ${escapeHtml(nf.numero)}</div>`;
                          })
                          .join('')}
                      </td>
                    `;
                    })
                    .join('')}
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  showModal(nfId) {
    const nf = nfId ? Store.state.notas_fiscais.find((n) => n.id === nfId) : null;
    const title = nf ? 'Editar Nota Fiscal' : 'Nova Nota Fiscal';
    const clienteAtual = nf ? Store.getContractById(nf.contractId)?.client || '' : '';

    const html = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal" style="width:600px;">
          <div class="modal-header">
            <h2 class="modal-title">${title}</h2>
            <button class="modal-close">✕</button>
          </div>
          <form id="formNF" class="modal-content">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Número da Nota Fiscal *</label>
                <input class="form-control" name="numero" value="${escapeHtml(nf?.numero || '')}" placeholder="Ex: 1234/2026" required>
              </div>
              <div class="form-group">
                <label class="form-label">Valor da NF (R$) *</label>
                <input class="form-control" name="valor" type="text" data-currency inputmode="numeric" value="${nf?.valor ? window.BRLInput.toDisplay(nf.valor) : ''}" placeholder="0,00" required>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Contrato *</label>
              <select class="form-control" name="contractId" id="selectContrato" required>
                <option value="">Selecionar...</option>
                ${Store.state.contracts.map((c) => `<option value="${c.id}" ${nf?.contractId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Cliente</label>
              <input class="form-control" id="inputCliente" readonly style="background:var(--color-bg);" value="${escapeHtml(clienteAtual)}">
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Data Limite para Emissão *</label>
                <input class="form-control" name="dataLimite" type="date" value="${nf?.dataLimite || ''}" required>
              </div>
              <div class="form-group">
                <label class="form-label">Prazo de Recebimento (dias) *</label>
                <input class="form-control" name="prazoRecebimento" type="number" min="0" max="365"
                  value="${nf?.prazoRecebimento ?? 30}" required>
                <div class="form-helper">Dias após a emissão até o pagamento entrar no caixa</div>
              </div>
            </div>

            ${
              nf?.emitida
                ? `
            <div class="form-group">
              <label class="form-label">Data de Emissão Real <span style="color:var(--color-success);font-size:13px;">(NF emitida — altere para recalcular recebimento)</span></label>
              <input class="form-control" name="dataEmissaoReal" type="date" value="${nf.dataEmissaoReal || ''}">
            </div>
            `
                : ''
            }

            <!-- Preview do recebimento -->
            <div id="previewRecebimento" style="padding:var(--sp-md);background:rgba(46,125,82,.07);border:1px solid rgba(46,125,82,.2);border-radius:8px;font-size:15px;display:none;">
              💰 Recebimento previsto: <strong id="dataRecebimentoCalc">—</strong>
            </div>

            <div class="form-group" style="margin-top:var(--sp-md);">
              <label class="form-label">Observações</label>
              <textarea class="form-control" name="observacoes" style="min-height:70px;">${window.escapeHtml(nf?.observacoes || '')}</textarea>
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelar">Cancelar</button>
            <button class="btn btn-primary" id="btnSalvar">${nf ? 'Atualizar' : 'Criar'}</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

    const overlay = document.getElementById('modalOverlay');
    const closeModal = () => overlay.remove();

    overlay.querySelector('.modal-close').addEventListener('click', closeModal);
    document.getElementById('btnCancelar').addEventListener('click', closeModal);
    // Preenche cliente ao selecionar contrato
    const sel = document.getElementById('selectContrato');
    sel.addEventListener('change', () => {
      const c = Store.getContractById(sel.value);
      document.getElementById('inputCliente').value = c ? c.client : '';
    });

    // Calcula e mostra data prevista de recebimento
    const atualizarPreview = () => {
      const emissaoInput = document.querySelector('[name=dataEmissaoReal]');
      const baseDate = emissaoInput
        ? emissaoInput.value
        : document.querySelector('[name=dataLimite]').value;
      const prazo = parseInt(document.querySelector('[name=prazoRecebimento]').value) || 0;
      const preview = document.getElementById('previewRecebimento');
      const calc = document.getElementById('dataRecebimentoCalc');
      if (baseDate) {
        const dt = new Date(baseDate + 'T12:00:00');
        dt.setDate(dt.getDate() + prazo);
        calc.textContent = dt.toLocaleDateString('pt-BR', {
          weekday: 'long',
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        });
        preview.style.display = 'block';
      } else {
        preview.style.display = 'none';
      }
    };
    document.querySelector('[name=dataLimite]').addEventListener('input', atualizarPreview);
    document.querySelector('[name=dataLimite]').addEventListener('change', atualizarPreview);
    document.querySelector('[name=prazoRecebimento]').addEventListener('input', atualizarPreview);
    const emissaoInputEl = document.querySelector('[name=dataEmissaoReal]');
    if (emissaoInputEl) {
      emissaoInputEl.addEventListener('input', atualizarPreview);
      emissaoInputEl.addEventListener('change', atualizarPreview);
    }
    atualizarPreview();

    document.getElementById('btnSalvar').addEventListener('click', async () => {
      const fd = new FormData(document.getElementById('formNF'));
      const data = {
        numero: fd.get('numero'),
        contractId: fd.get('contractId'),
        dataLimite: fd.get('dataLimite'),
        valor: window.BRLInput.parse(fd.get('valor')),
        prazoRecebimento: Number.isFinite(parseInt(fd.get('prazoRecebimento')))
          ? parseInt(fd.get('prazoRecebimento'))
          : 30,
        observacoes: fd.get('observacoes'),
      };
      if (fd.get('dataEmissaoReal')) data.dataEmissaoReal = fd.get('dataEmissaoReal');
      try {
        if (nf) {
          await Store.updateNotaFiscal(nfId, data);
          window.showToast('Nota fiscal atualizada', 'success');
        } else {
          await Store.createNotaFiscal(data);
          window.showToast('Nota fiscal criada', 'success');
        }
        closeModal();
        await this.render();
      } catch (e) {
        window.showToast(e.message, 'error');
      }
    });
  },

  attachListeners() {
    document.querySelectorAll('.btn-editar-nf').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showModal(e.target.dataset.id);
      });
    });
    document.querySelectorAll('.btn-excluir-nf').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteNF(e.target.dataset.id);
      });
    });
    document.querySelectorAll('.btn-emitir-nf').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showModalEmitir(e.target.dataset.id);
      });
    });
    document.querySelectorAll('.btn-cancelar-emissao').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.cancelarEmissao(e.target.dataset.id);
      });
    });
    document.querySelectorAll('.row-nf').forEach((tr) => {
      tr.addEventListener('click', (e) => {
        if (e.target.closest('.actions-cell')) return;
        this.showDetail(tr.dataset.id);
      });
    });
    const btnAnt = document.getElementById('btnMesAnterior');
    const btnPrx = document.getElementById('btnProximoMes');
    if (btnAnt)
      btnAnt.addEventListener('click', () => {
        this.currentMonth.setMonth(this.currentMonth.getMonth() - 1);
        this.render();
      });
    if (btnPrx)
      btnPrx.addEventListener('click', () => {
        this.currentMonth.setMonth(this.currentMonth.getMonth() + 1);
        this.render();
      });
  },

  showDetail(nfId) {
    const nf = Store.state.notas_fiscais.find((n) => n.id === nfId);
    if (!nf) return;
    const fmtD = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—');
    const contract = nf.contractId ? Store.getContractById(nf.contractId) : null;
    const prazo = Number.isFinite(parseInt(nf.prazoRecebimento))
      ? parseInt(nf.prazoRecebimento)
      : 30;
    const baseData = nf.emitida ? nf.dataEmissaoReal : nf.dataLimite;
    const dtRec = baseData
      ? (() => {
          const d = new Date(baseData + 'T12:00:00');
          d.setDate(d.getDate() + prazo);
          return d;
        })()
      : null;
    const diasAteRec = dtRec ? Math.floor((dtRec - new Date()) / 86400000) : null;
    const saidasVinculadas = (Store.state.saidas || []).filter((s) => s.nfId === nf.id);
    const totalSaidas = saidasVinculadas.reduce((acc, s) => acc + (parseFloat(s.value) || 0), 0);
    const caixaEntry = nf.caixaEntryId
      ? (Store.state.caixa || []).find((e) => e.id === nf.caixaEntryId)
      : null;

    const row = (lbl, val) =>
      val
        ? `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--color-border);"><span style="color:var(--color-text-muted);">${lbl}</span><span style="font-weight:500;text-align:right;">${val}</span></div>`
        : '';

    const html = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal" style="width:640px;max-width:95vw;max-height:90vh;overflow-y:auto;">
          <div class="modal-header">
            <div>
              <h2 class="modal-title">NF ${escapeHtml(nf.numero)}</h2>
              <div style="margin-top:6px;">
                ${window.UIKit?.statusPill ? window.UIKit.statusPill(nf.emitida ? 'emitida' : 'pendente') : nf.emitida ? 'Emitida' : 'Pendente'}
                <span style="font-size:22px;font-weight:700;color:var(--color-success);margin-left:12px;">${Store.formatBRL(nf.valor || 0)}</span>
              </div>
            </div>
            <button class="modal-close">✕</button>
          </div>
          <div class="modal-content">
            ${row('Contrato', contract ? `<a href="#/contratos/${contract.id}" style="color:var(--color-primary);">${escapeHtml(contract.name)}</a>` : null)}
            ${row('Cliente', contract ? escapeHtml(contract.client) : null)}
            ${row('Data limite', fmtD(nf.dataLimite))}
            ${row('Prazo de recebimento', `${prazo} dia${prazo === 1 ? '' : 's'} após emissão`)}
            ${
              nf.emitida
                ? `
              ${row('Emitida em', fmtD(nf.dataEmissaoReal))}
              ${row('Recebimento previsto', dtRec ? `${fmtD(dtRec.toISOString().split('T')[0])} ${diasAteRec >= 0 ? `<span style="color:var(--color-text-muted);font-size:13px;">(em ${diasAteRec} dias)</span>` : `<span style="color:var(--color-text-muted);font-size:13px;">(recebido)</span>`}` : null)}
              ${caixaEntry ? row('Entrada no caixa', `${escapeHtml(caixaEntry.description)} em ${fmtD(caixaEntry.date)}`) : ''}
            `
                : ''
            }
            ${row('Medições vinculadas', saidasVinculadas.length ? `${saidasVinculadas.length} BM${saidasVinculadas.length > 1 ? 's' : ''} · total ${Store.formatBRL(totalSaidas)}` : null)}
            ${row('Observações', nf.observacoes ? escapeHtml(nf.observacoes) : null)}
            <div style="font-size:12px;color:var(--color-text-muted);margin-top:var(--sp-md);font-family:monospace;">ID: ${escapeHtml(nf.id)}</div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnDetClose">Fechar</button>
            ${
              !nf.emitida
                ? `<button class="btn btn-primary" id="btnDetEmitir" style="background:var(--color-success);border-color:var(--color-success);">Marcar emitida</button>`
                : `<button class="btn btn-secondary" id="btnDetCancelar">Desfazer emissão</button>`
            }
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalOverlay');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnDetClose').addEventListener('click', close);
    const bEmit = document.getElementById('btnDetEmitir');
    if (bEmit)
      bEmit.addEventListener('click', () => {
        close();
        this.showModalEmitir(nfId);
      });
    const bCancel = document.getElementById('btnDetCancelar');
    if (bCancel)
      bCancel.addEventListener('click', () => {
        close();
        this.cancelarEmissao(nfId);
      });
  },

  showModalEmitir(nfId) {
    const nf = Store.state.notas_fiscais.find((n) => n.id === nfId);
    if (!nf) return;
    const contract = Store.getContractById(nf.contractId);
    const prazo = Number.isFinite(parseInt(nf.prazoRecebimento))
      ? parseInt(nf.prazoRecebimento)
      : 30;
    const hoje = new Date().toISOString().split('T')[0];

    const html = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal" style="width:560px;">
          <div class="modal-header">
            <h2 class="modal-title">✓ Marcar NF ${escapeHtml(nf.numero)} como Emitida</h2>
            <button class="modal-close">✕</button>
          </div>
          <div class="modal-content">
            <div style="padding:var(--sp-md);background:var(--color-bg);border-radius:8px;margin-bottom:var(--sp-lg);">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-md);font-size:15px;">
                <div>
                  <div style="color:var(--color-text-muted);font-size:15px;text-transform:uppercase;">Contrato</div>
                  <div style="font-weight:600;">${escapeHtml(contract?.name || '—')}</div>
                </div>
                <div>
                  <div style="color:var(--color-text-muted);font-size:15px;text-transform:uppercase;">Cliente</div>
                  <div style="font-weight:600;">${escapeHtml(contract?.client || '—')}</div>
                </div>
                <div>
                  <div style="color:var(--color-text-muted);font-size:15px;text-transform:uppercase;">Valor</div>
                  <div style="font-weight:700;color:var(--color-success);">${Store.formatBRL(nf.valor || 0)}</div>
                </div>
                <div>
                  <div style="color:var(--color-text-muted);font-size:15px;text-transform:uppercase;">Prazo Recebimento</div>
                  <div style="font-weight:600;">${prazo} dias</div>
                </div>
              </div>
            </div>

            <form id="formEmitir">
              <div class="form-group">
                <label class="form-label">Data Real de Emissão *</label>
                <input class="form-control" type="date" name="dataEmissaoReal" value="${hoje}" required>
                <div class="form-helper">Normalmente hoje. Será usada para calcular o recebimento no caixa.</div>
              </div>

              <!-- Preview -->
              <div id="previewCaixa" style="padding:var(--sp-md);background:rgba(46,125,82,.08);border:1px solid rgba(46,125,82,.2);border-radius:8px;font-size:15px;">
                <div style="font-weight:600;color:var(--color-primary);margin-bottom:4px;">💰 Entrada automática no caixa</div>
                <div id="previewTexto" style="color:var(--color-text-muted);">Calculando...</div>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelarEmissao">Cancelar</button>
            <button class="btn btn-success" id="btnConfirmarEmissao">✓ Confirmar Emissão</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

    const overlay = document.getElementById('modalOverlay');
    const closeModal = () => overlay.remove();

    overlay.querySelector('.modal-close').addEventListener('click', closeModal);
    document.getElementById('btnCancelarEmissao').addEventListener('click', closeModal);
    const inputData = document.querySelector('[name=dataEmissaoReal]');
    const previewTexto = document.getElementById('previewTexto');

    const atualizarPreview = () => {
      const val = inputData.value;
      if (!val) {
        previewTexto.textContent = '—';
        return;
      }
      const dtEmissao = new Date(val + 'T12:00:00');
      const dtRecebimento = new Date(val + 'T12:00:00');
      dtRecebimento.setDate(dtRecebimento.getDate() + prazo);
      previewTexto.innerHTML = `
        <div style="display:grid;gap:6px;">
          <div>📅 <span style="font-weight:600;">Emissão:</span> ${dtEmissao.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
          <div>💰 <span style="font-weight:600;">Recebimento (${prazo}d após emissão):</span> <span style="color:var(--color-success);font-weight:700;">${dtRecebimento.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</span> — ${Store.formatBRL(nf.valor || 0)}</div>
        </div>
      `;
    };
    inputData.addEventListener('change', atualizarPreview);
    atualizarPreview();

    document.getElementById('btnConfirmarEmissao').addEventListener('click', async () => {
      const dataEmissao = inputData.value;
      if (!dataEmissao) {
        window.showToast('Informe a data de emissão', 'error');
        return;
      }

      try {
        const result = await Store.emitirNotaFiscal(nfId, dataEmissao);
        window.showToast(result.mensagem || 'NF marcada como emitida', 'success');
        closeModal();
        this.render();
      } catch (e) {
        window.showToast(e.message, 'error');
      }
    });
  },

  async cancelarEmissao(id) {
    if (!confirm('Desfazer a emissão? Isso vai remover a entrada agendada no caixa.')) return;
    try {
      await Store.cancelarEmissaoNotaFiscal(id);
      window.showToast('Emissão desfeita. Entrada removida do caixa.', 'success');
      this.render();
    } catch (e) {
      window.showToast(e.message, 'error');
    }
  },

  async deleteNF(id) {
    const nf = Store.state.notas_fiscais.find((n) => n.id === id);
    const msg = nf?.emitida
      ? 'Esta NF está emitida. Excluir também vai remover a entrada no caixa. Continuar?'
      : 'Excluir esta nota fiscal?';
    if (!confirm(msg)) return;
    try {
      await Store.deleteNotaFiscal(id);
      window.showToast('Nota fiscal removida', 'success');
      this.render();
    } catch (e) {
      window.showToast(e.message, 'error');
    }
  },
};
