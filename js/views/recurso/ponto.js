/* Rhino · Recursos · Ponto / Banco de horas (item 6)
   View autocontida (window.RecursoPonto). Consome /api/recursos/:id/ponto —
   marcações diárias de jornada do colaborador, com saldo do dia e banco de
   horas acumulado. Só apresentação: o cálculo das horas e do saldo é do
   servidor (lib/ponto.js). Wiring: um botão "Ponto" na linha de Recursos (ou no
   detalhe do colaborador) chama window.RecursoPonto.show(recursoId). */
(function () {
  const YMD = (s) => {
    if (!s) return '—';
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : escapeHtml(String(s));
  };
  const _h2 = (n) => (Number(n) || 0).toFixed(2).replace('.', ',');
  const _saldoTxt = (n) => {
    const v = Number(n) || 0;
    return `${v > 0 ? '+' : ''}${_h2(v)}h`;
  };
  const _competenciaAtual = () => new Date().toISOString().slice(0, 7);
  const _labelCompetencia = (ym) => {
    const [y, m] = String(ym || '').split('-');
    const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    return m ? `${meses[Number(m) - 1] || m}/${y}` : ym;
  };
  const _shiftMes = (ym, delta) => {
    const [y, m] = String(ym || _competenciaAtual()).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
  };

  window.RecursoPonto = {
    _recurso: null,
    _competencia: null,
    _cache: [],

    // Ponto de entrada: abre o modal da folha de ponto do colaborador.
    async show(recursoId) {
      const r = (Store.state.recursos || []).find((x) => x.id === recursoId);
      if (!r) {
        if (window.showToast) window.showToast('Colaborador não encontrado', 'error');
        return;
      }
      this._recurso = r;
      if (!this._competencia) this._competencia = _competenciaAtual();

      const html = `
        <div class="modal-overlay" id="modalPonto">
          <div class="modal" style="width:780px;max-width:96vw;max-height:90vh;overflow-y:auto;">
            <div class="modal-header">
              <h2 class="modal-title"><span style="display:inline-flex;align-items:center;gap:8px;">${window.rhIcon('clock', 18)}Ponto — ${escapeHtml(r.nome || '')}</span></h2>
              <button class="modal-close">✕</button>
            </div>
            <div class="modal-content" id="pontoConteudo">
              <div class="text-muted" style="text-align:center;padding:var(--sp-lg);">Carregando…</div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" id="btnFecharPonto">Fechar</button>
              <button class="btn btn-primary" id="btnNovaMarcacao">+ Nova marcação</button>
            </div>
          </div>
        </div>`;
      document.body.insertAdjacentHTML('beforeend', html);
      const overlay = document.getElementById('modalPonto');
      const close = () => overlay.remove();
      overlay.querySelector('.modal-close').addEventListener('click', close);
      document.getElementById('btnFecharPonto').addEventListener('click', close);
      document.getElementById('btnNovaMarcacao').addEventListener('click', () => this._showModalMarcacao(null));
      await this._load();
    },

    async _load() {
      const box = document.getElementById('pontoConteudo');
      if (!box) return;
      try {
        const r = await fetch(`/api/recursos/${this._recurso.id}/ponto?competencia=${encodeURIComponent(this._competencia)}`);
        if (!r.ok) throw new Error(await r.text());
        const data = await r.json();
        this._cache = data.pontos || [];
        box.innerHTML = this._renderConteudo(this._cache, data.resumo || {});
        this._attach();
      } catch (e) {
        box.innerHTML = `<p class="text-danger">Erro ao carregar o ponto: ${escapeHtml(e.message)}</p>`;
      }
    },

    _renderConteudo(pontos, resumo) {
      const saldo = Number(resumo.saldo) || 0;
      const corSaldo = saldo > 0 ? '#059669' : saldo < 0 ? '#DC2626' : 'var(--color-text-muted)';

      const cards = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:var(--sp-md);">
          <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;border-left:3px solid #3b82f6;">
            <div class="text-muted font-sm">Dias marcados</div>
            <div style="font-size:18px;font-weight:700;">${resumo.dias || 0}</div>
          </div>
          <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;border-left:3px solid #6366f1;">
            <div class="text-muted font-sm">Horas trabalhadas</div>
            <div style="font-size:18px;font-weight:700;">${_h2(resumo.horasTrabalhadas)}h</div>
          </div>
          <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;border-left:3px solid ${saldo < 0 ? '#dc2626' : '#10b981'};">
            <div class="text-muted font-sm">Banco de horas</div>
            <div style="font-size:18px;font-weight:700;color:${corSaldo};">${_saldoTxt(saldo)}</div>
          </div>
        </div>`;

      const nav = `
        <div style="display:flex;justify-content:center;align-items:center;gap:8px;margin-bottom:var(--sp-md);">
          <button class="btn btn-sm btn-secondary" data-ponto-mes="prev" title="Mês anterior">◀</button>
          <strong style="min-width:96px;text-align:center;">${escapeHtml(_labelCompetencia(this._competencia))}</strong>
          <button class="btn btn-sm btn-secondary" data-ponto-mes="next" title="Próximo mês">▶</button>
        </div>`;

      if (!pontos.length) {
        return `${cards}${nav}
          <div style="text-align:center;padding:var(--sp-xl);color:var(--color-text-muted);">
            <div style="font-size:40px;margin-bottom:8px;opacity:.6;">🕗</div>
            <div style="font-weight:600;margin-bottom:4px;">Nenhuma marcação em ${escapeHtml(_labelCompetencia(this._competencia))}</div>
            <div style="font-size:13px;">Registre entradas e saídas para acompanhar o banco de horas.</div>
          </div>`;
      }

      const linhas = pontos.map((p) => {
        const sd = (Number(p.horasTrabalhadas) || 0) - (Number(p.jornadaPrevista) || 0);
        const corSd = sd > 0 ? '#059669' : sd < 0 ? '#DC2626' : 'var(--color-text-muted)';
        return `
          <tr>
            <td>${YMD(p.data)}</td>
            <td>${p.entrada ? escapeHtml(p.entrada) : '—'}</td>
            <td>${p.saida ? escapeHtml(p.saida) : '—'}</td>
            <td style="text-align:right;">${Number(p.intervaloMin) || 0} min</td>
            <td style="text-align:right;">${_h2(p.horasTrabalhadas)}</td>
            <td style="text-align:right;color:${corSd};font-weight:600;">${_saldoTxt(sd)}</td>
            <td style="text-align:center;white-space:nowrap;">
              <button class="btn btn-sm btn-secondary" data-ponto-edit="${escapeHtml(p.id)}" title="Editar"><span style="display:inline-flex;">${window.rhIcon('edit', 15)}</span></button>
              <button class="btn btn-sm btn-danger" data-ponto-del="${escapeHtml(p.id)}" title="Excluir"><span style="display:inline-flex;">${window.rhIcon('trash-2', 15)}</span></button>
            </td>
          </tr>`;
      }).join('');

      return `${cards}${nav}
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Data</th>
                <th scope="col">Entrada</th>
                <th scope="col">Saída</th>
                <th scope="col" style="text-align:right;">Intervalo</th>
                <th scope="col" style="text-align:right;">Horas</th>
                <th scope="col" style="text-align:right;">Saldo</th>
                <th scope="col" style="text-align:center;">Ações</th>
              </tr>
            </thead>
            <tbody>${linhas}</tbody>
          </table>
        </div>`;
    },

    _attach() {
      document.querySelectorAll('[data-ponto-mes]').forEach((b) => {
        b.addEventListener('click', () => {
          this._competencia = _shiftMes(this._competencia, b.getAttribute('data-ponto-mes') === 'next' ? 1 : -1);
          this._load();
        });
      });
      document.querySelectorAll('[data-ponto-edit]').forEach((b) => {
        b.addEventListener('click', () => {
          const p = (this._cache || []).find((x) => x.id === b.getAttribute('data-ponto-edit'));
          if (p) this._showModalMarcacao(p);
        });
      });
      document.querySelectorAll('[data-ponto-del]').forEach((b) => {
        b.addEventListener('click', async () => {
          if (!confirm('Excluir esta marcação de ponto?')) return;
          try {
            const r = await fetch(`/api/recursos/${this._recurso.id}/ponto/${b.getAttribute('data-ponto-del')}`, { method: 'DELETE' });
            if (!r.ok) throw new Error(await r.text());
            if (window.showToast) window.showToast('Marcação excluída', 'success');
            this._load();
          } catch (e) {
            if (window.showToast) window.showToast(e.message, 'error');
          }
        });
      });
    },

    _showModalMarcacao(item) {
      const editing = !!(item && item.id);
      const hoje = new Date().toISOString().slice(0, 10);
      const html = `
        <div class="modal-overlay" id="modalMarcacao" style="z-index:1200;">
          <div class="modal" style="width:520px;max-width:95vw;">
            <div class="modal-header">
              <h2 class="modal-title">${editing ? '✏️ Editar' : '+ Nova'} marcação</h2>
              <button class="modal-close">✕</button>
            </div>
            <form id="formMarcacao" class="modal-content">
              <div class="form-group">
                <label class="form-label">Data *</label>
                <input class="form-control" type="date" name="data" required value="${escapeHtml(item?.data || hoje)}">
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Entrada</label>
                  <input class="form-control" type="time" name="entrada" value="${escapeHtml(item?.entrada || '')}">
                </div>
                <div class="form-group">
                  <label class="form-label">Saída</label>
                  <input class="form-control" type="time" name="saida" value="${escapeHtml(item?.saida || '')}">
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Intervalo (min)</label>
                  <input class="form-control" type="number" min="0" name="intervaloMin" value="${item?.intervaloMin != null ? item.intervaloMin : 0}">
                </div>
                <div class="form-group">
                  <label class="form-label">Jornada prevista (h)</label>
                  <input class="form-control" type="number" min="0" step="0.5" name="jornadaPrevista" value="${item?.jornadaPrevista != null ? item.jornadaPrevista : 8}">
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Observações</label>
                <textarea class="form-control" name="observacoes" rows="2">${escapeHtml(item?.observacoes || '')}</textarea>
              </div>
              <div class="form-helper">${window.rhIcon('info', 13)} As horas trabalhadas são calculadas no servidor a partir de entrada, saída e intervalo (com virada de madrugada).</div>
            </form>
            <div class="modal-footer">
              <button class="btn btn-secondary" id="btnCancelMarcacao">Cancelar</button>
              <button class="btn btn-primary" id="btnSaveMarcacao">${editing ? 'Salvar' : 'Criar'}</button>
            </div>
          </div>
        </div>`;
      document.body.insertAdjacentHTML('beforeend', html);
      const overlay = document.getElementById('modalMarcacao');
      const close = () => overlay.remove();
      overlay.querySelector('.modal-close').addEventListener('click', close);
      document.getElementById('btnCancelMarcacao').addEventListener('click', close);

      document.getElementById('btnSaveMarcacao').addEventListener('click', async () => {
        const fd = new FormData(document.getElementById('formMarcacao'));
        const f = Object.fromEntries(fd);
        if (!f.data) {
          if (window.showToast) window.showToast('Data é obrigatória', 'error');
          return;
        }
        const body = {
          data: f.data,
          entrada: f.entrada || null,
          saida: f.saida || null,
          intervaloMin: parseInt(f.intervaloMin, 10) || 0,
          jornadaPrevista: f.jornadaPrevista === '' ? 8 : Number(f.jornadaPrevista),
          observacoes: (f.observacoes || '').trim(),
        };
        try {
          const url = editing
            ? `/api/recursos/${this._recurso.id}/ponto/${item.id}`
            : `/api/recursos/${this._recurso.id}/ponto`;
          const r = await fetch(url, {
            method: editing ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!r.ok) throw new Error(await r.text());
          if (window.showToast) window.showToast(editing ? 'Marcação atualizada' : 'Marcação criada', 'success');
          close();
          this._load();
        } catch (e) {
          if (window.showToast) window.showToast(e.message, 'error');
        }
      });
    },
  };
})();
