/**
 * Aplica tema salvo o quanto antes (evita flash claro → escuro no boot).
 * Sem preferência salva → respeita prefers-color-scheme do sistema.
 *
 * Extraído de index.html (inline script) para permitir CSP sem 'unsafe-inline'.
 * Carregar SÍNCRONO (sem defer) — precisa rodar antes do primeiro paint.
 */
(function(){
  try {
    var saved = localStorage.getItem('rhino-theme');
    var prefersDark = !saved && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (saved === 'dark' || prefersDark) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
    if (!saved && window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
        if (!localStorage.getItem('rhino-theme')) {
          if (e.matches) document.documentElement.setAttribute('data-theme', 'dark');
          else document.documentElement.removeAttribute('data-theme');
        }
      });
    }
  } catch (e) {}
})();
