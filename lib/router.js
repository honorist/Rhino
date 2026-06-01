'use strict';
/**
 * @file Router HTTP mínimo — substituirá a cadeia de `if (pathname === …)`
 * do server.js (Fase 2 do desmembramento).
 *
 * Casamento por método + padrão, na ORDEM de registro (first-match-wins,
 * idêntico ao if-chain). Padrões em string aceitam `:param` (um segmento);
 * RegExp também é aceita para casos legados.
 */

/**
 * Compila um padrão string em RegExp âncorada. `:param` vira grupo de captura
 * de um segmento. Metacaracteres de regex no caminho literal são escapados.
 * @param {string|RegExp} pattern
 * @returns {RegExp}
 */
function compilePattern(pattern) {
  if (pattern instanceof RegExp) return pattern;
  const escaped = String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const withParams = escaped.replace(/:([A-Za-z0-9_]+)/g, '([^/]+)');
  return new RegExp('^' + withParams + '$');
}

/**
 * Cria um router. Cada `get/post/...` registra uma rota; `dispatch` casa.
 * @returns {{get,post,put,delete,patch,list,dispatch}}
 */
function createRouter() {
  const routes = [];

  function add(method, pattern, handler) {
    if (typeof handler !== 'function') {
      throw new TypeError(`Rota ${method} ${pattern}: handler precisa ser função`);
    }
    routes.push({ method, pattern, re: compilePattern(pattern), handler });
  }

  return {
    get:    (p, h) => add('GET', p, h),
    post:   (p, h) => add('POST', p, h),
    put:    (p, h) => add('PUT', p, h),
    delete: (p, h) => add('DELETE', p, h),
    patch:  (p, h) => add('PATCH', p, h),

    /** Rotas registradas — usado pelo teste de paridade da Fase 2. */
    list() {
      return routes.map(r => ({ method: r.method, pattern: String(r.pattern) }));
    },

    /**
     * Casa (method, pathname) contra as rotas. Na primeira que casar, chama
     * `handler({ ...ctx, params })` e retorna `true`. Senão, retorna `false`
     * (o chamador segue para o próximo módulo ou para arquivos estáticos).
     *
     * `params` são os grupos de captura crus — sem decodeURIComponent —
     * preservando o comportamento do roteamento atual.
     * @param {{method:string, pathname:string}} ctx
     * @returns {boolean}
     */
    dispatch(ctx) {
      for (const r of routes) {
        if (r.method !== ctx.method) continue;
        const m = ctx.pathname.match(r.re);
        if (!m) continue;
        const out = r.handler({ ...ctx, params: m.slice(1) });
        // Handlers são quase todos async. Uma rejeição não capturada aqui
        // deixaria o cliente PENDURADO até o timeout do socket (nenhuma resposta
        // é enviada). Captura e responde 500 — sem vazar a mensagem interna.
        if (out && typeof out.then === 'function') {
          out.catch((e) => {
            console.error('[router] handler rejeitou:', ctx.method, ctx.pathname, e && e.message);
            try {
              if (ctx.res && !ctx.res.headersSent) {
                ctx.res.writeHead(500, { 'Content-Type': 'application/json' });
                ctx.res.end(JSON.stringify({ error: 'Erro interno do servidor' }));
              }
            } catch { /* resposta já iniciada — nada a fazer */ }
          });
        }
        return true;
      }
      return false;
    },
  };
}

module.exports = { createRouter, compilePattern };
