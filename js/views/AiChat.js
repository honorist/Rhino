/* Rhino · F15 — AI Chat com os dados
   Painel de chat que envia perguntas ao /api/ai/chat e exibe respostas.
*/
window.AiChat = {
  _history: [],
  _loading: false,

  async render() {
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">🤖 Assistente IA</h1>
          <p class="page-subtitle">Faça perguntas sobre contratos, caixa e contas em linguagem natural</p>
        </div>
      </div>

      <div style="max-width:800px;margin:0 auto;display:flex;flex-direction:column;gap:var(--sp-md);">
        <div id="ai-messages" style="
          background:var(--color-surface);
          border:1px solid var(--color-border);
          border-radius:12px;
          padding:var(--sp-md);
          min-height:320px;
          max-height:520px;
          overflow-y:auto;
          display:flex;
          flex-direction:column;
          gap:var(--sp-sm);
        ">
          ${this._history.length === 0 ? this._renderEmpty() : this._history.map(m => this._renderMessage(m)).join('')}
        </div>

        <div style="display:flex;gap:var(--sp-sm);">
          <input id="ai-input" type="text" class="form-control"
            placeholder="Ex: Qual é o saldo atual do caixa? Quais contratos vencem este mês?"
            style="flex:1;font-size:15px;"
            ${this._loading ? 'disabled' : ''}
          >
          <button id="ai-send" class="btn btn-primary" ${this._loading ? 'disabled' : ''}>
            ${this._loading ? '⏳' : 'Enviar'}
          </button>
        </div>

        <div style="font-size:14px;color:var(--color-text-muted);text-align:center;">
          Sugestões: <a class="rh-ai-suggest">Qual meu saldo?</a> · <a class="rh-ai-suggest">Contratos ativos</a> · <a class="rh-ai-suggest">Contas vencidas</a>
        </div>
      </div>
    `;

    const input = document.getElementById('ai-input');
    const btn = document.getElementById('ai-send');

    const sendMsg = async () => {
      const msg = (input.value || '').trim();
      if (!msg || this._loading) return;
      input.value = '';
      await this._send(msg);
    };

    btn.addEventListener('click', sendMsg);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') sendMsg(); });
    document.querySelectorAll('.rh-ai-suggest').forEach(a => {
      a.style.cursor = 'pointer';
      a.style.color = 'var(--color-primary)';
      a.addEventListener('click', () => { input.value = a.textContent; sendMsg(); });
    });
    input.focus();
  },

  _renderEmpty() {
    return `<div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--color-text-muted);font-size:15px;text-align:center;">
      <div>
        <div style="font-size:40px;margin-bottom:8px;">🤖</div>
        <div>Olá! Posso responder perguntas sobre seus dados financeiros e contratos.</div>
      </div>
    </div>`;
  },

  _renderMessage(m) {
    const isUser = m.role === 'user';
    return `<div style="display:flex;${isUser ? 'justify-content:flex-end' : 'justify-content:flex-start'};">
      <div style="
        max-width:80%;
        padding:10px 14px;
        border-radius:${isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px'};
        background:${isUser ? 'var(--color-primary)' : 'var(--color-bg)'};
        color:${isUser ? '#fff' : 'var(--color-text)'};
        font-size:15px;
        line-height:1.55;
        white-space:pre-wrap;
      ">${isUser ? this._escHtml(m.content) : this._escHtml(m.content)}</div>
    </div>`;
  },

  _escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },

  async _send(msg) {
    this._history.push({ role: 'user', content: msg });
    this._loading = true;
    this.render();

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
        credentials: 'same-origin',
      });
      const data = await res.json();
      if (!res.ok) {
        this._history.push({ role: 'assistant', content: data.error || 'Erro ao contatar IA.' });
      } else {
        this._history.push({ role: 'assistant', content: data.reply || '…' });
      }
    } catch (e) {
      this._history.push({ role: 'assistant', content: 'Erro de conexão. Tente novamente.' });
    }

    this._loading = false;
    this.render();
    const msgs = document.getElementById('ai-messages');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
  },
};
