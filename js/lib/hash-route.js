/* Rhino · Hash route helpers — separa "#/rota?a=1" em path + query.
   Usado pelo router (matchRoute) e pelo gate de permissão (perfil.podeAcessar/
   podeEditar) — extraído pra ficar testável isolado (sem carregar app.js
   inteiro, que tem efeito colateral de boot no top-level). */
(function () {
  'use strict';

  function splitHashQuery(hash) {
    const h = hash || '';
    const qIdx = h.indexOf('?');
    if (qIdx === -1) return { path: h, query: {} };
    const path = h.slice(0, qIdx);
    const query = Object.fromEntries(new URLSearchParams(h.slice(qIdx + 1)));
    return { path, query };
  }

  // "#/contratos/123?tab=evm" → "#/contratos" — descarta querystring e
  // qualquer sub-segmento (rota de detalhe usa a permissão da rota pai).
  function baseHashPath(hash) {
    const { path } = splitHashQuery(hash || '');
    return path.replace(/(#\/[^/]+).*/, '$1');
  }

  window.splitHashQuery = splitHashQuery;
  window.baseHashPath = baseHashPath;
})();
