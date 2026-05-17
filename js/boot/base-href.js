/**
 * Resolve URLs relativas corretamente quando o app é servido a partir de subpastas
 * (ex: GitHub Pages em `/Rhino/`). Injeta um `<base href>` apontando para o
 * diretório atual.
 *
 * Extraído de index.html (inline script) para permitir CSP sem 'unsafe-inline'.
 * Carregar SÍNCRONO (sem defer) — precisa rodar antes que qualquer outro recurso
 * relative seja resolvido.
 */
(function(){
  var p = location.pathname;
  if (!p.endsWith('/') && !/\.[a-z0-9]+$/i.test(p)) {
    history.replaceState(null, '', p + '/' + location.search + location.hash);
  }
  var dir = location.pathname.replace(/[^/]*$/, '');
  var base = document.createElement('base');
  base.href = dir;
  document.head.insertBefore(base, document.head.firstChild);
})();
