/**
 * Delegação global para substituir handlers inline (onclick / onerror)
 * que foram removidos como parte do hardening de CSP (FIX SEC-06).
 *
 * Convenção:
 *  - `.js-stop`          → click é stopPropagation (impede bubble para linha clicável)
 *  - `.js-hide-on-error` → onerror esconde o elemento (img quebrada)
 */
(function(){
  // BUG HISTÓRICO: o handler antigo chamava stopPropagation diretamente em
  // CAPTURE phase. Isso cancela TODA propagação restante — inclusive os
  // listeners normais (bubble) anexados aos botões dentro do .js-stop.
  // Resultado: cliques em "Excluir / Duplicar / Salvar" dentro de uma linha
  // clicável de tabela viravam no-op silencioso.
  //
  // Correção: em capture, NÃO paramos a propagação ainda. Anexamos um
  // listener one-shot no próprio .js-stop em bubble phase. Ordem de execução:
  //   1) Listener do BOTÃO (target) roda normalmente
  //   2) Evento sobe (bubble) → chega no .js-stop → stopPropagation
  //   3) Evento NÃO chega no row pai (que tem listener pra abrir detalhe)
  document.addEventListener('click', function(e) {
    const t = e.target;
    if (!t || !t.closest) return;
    const stop = t.closest('.js-stop');
    if (!stop) return;
    stop.addEventListener('click', function once(ev) {
      ev.stopPropagation();
      stop.removeEventListener('click', once);
    }, { once: true });
  }, true);

  // 'error' não faz bubble — capture=true permite delegação no documento.
  document.addEventListener('error', function(e) {
    const t = e.target;
    if (t && t.matches && t.matches('img.js-hide-on-error')) {
      t.style.display = 'none';
    }
  }, true);
})();
