/**
 * Delegação global para substituir handlers inline (onclick / onerror)
 * que foram removidos como parte do hardening de CSP (FIX SEC-06).
 *
 * Convenção:
 *  - `.js-stop`          → click é stopPropagation (impede bubble para linha clicável)
 *  - `.js-hide-on-error` → onerror esconde o elemento (img quebrada)
 *
 * Listeners adicionados em capture=true para chegar antes de qualquer
 * outro handler de bubble.
 */
(function(){
  document.addEventListener('click', function(e) {
    const t = e.target;
    if (t && t.closest && t.closest('.js-stop')) {
      e.stopPropagation();
    }
  }, true);

  // 'error' não faz bubble — capture=true permite delegação no documento.
  document.addEventListener('error', function(e) {
    const t = e.target;
    if (t && t.matches && t.matches('img.js-hide-on-error')) {
      t.style.display = 'none';
    }
  }, true);
})();
