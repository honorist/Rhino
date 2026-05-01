/* Rhino · F17 — Onboarding Tour
   Usa Shepherd.js (carregado via RhinoLazy) para guiar novos usuários.
   Dispara automaticamente na primeira visita (sem rhino-tour-v1 no localStorage).
   Exporta window.RhinoTour para acionar manualmente via Configurações.
*/
(function () {
  'use strict';

  const TOUR_KEY = 'rhino-tour-v1';
  const SHEPHERD_CSS = 'https://cdn.jsdelivr.net/npm/shepherd.js@13/dist/css/shepherd.css';
  const SHEPHERD_JS  = 'https://cdn.jsdelivr.net/npm/shepherd.js@13/dist/js/shepherd.min.js';

  async function loadShepherd() {
    if (window.Shepherd) return window.Shepherd;
    if (!document.querySelector(`link[href="${SHEPHERD_CSS}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet'; link.href = SHEPHERD_CSS;
      document.head.appendChild(link);
    }
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SHEPHERD_JS; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
    return window.Shepherd;
  }

  const STEPS = [
    {
      id: 'boas-vindas',
      attachTo: { element: '#sidebar', on: 'right' },
      text: '<b>Bem-vindo ao Rhino!</b><br>Este é o menu principal. Vamos conhecer as principais seções em menos de 1 minuto.',
      title: '👋 Bem-vindo',
    },
    {
      id: 'dashboard',
      attachTo: { element: '[data-hash="#/dashboard"]', on: 'right' },
      text: 'O <b>Dashboard</b> mostra um resumo de contratos, saldo do caixa, NFs a receber e muito mais.',
      title: '📊 Dashboard',
      beforeShowPromise: () => navigateTo('#/dashboard'),
    },
    {
      id: 'contratos',
      attachTo: { element: '[data-hash="#/contratos"]', on: 'right' },
      text: 'Em <b>Contratos</b> você cadastra e acompanha obras: orçamento, medições, cronograma, RDOs e equipe.',
      title: '📁 Contratos',
    },
    {
      id: 'financeiro',
      attachTo: { element: '[data-hash="#/caixa"]', on: 'right' },
      text: 'O módulo <b>Financeiro</b> controla Caixa, Contas a Pagar, Notas Fiscais e Aportes dos sócios.',
      title: '💰 Financeiro',
    },
    {
      id: 'rdos',
      attachTo: { element: '[data-hash="#/rdos"]', on: 'right' },
      text: 'Em <b>RDOs</b> você registra o Relatório Diário de Obra com equipe, equipamentos e fotos.',
      title: '📋 RDOs',
    },
    {
      id: 'atalhos',
      attachTo: { element: 'body', on: 'bottom' },
      text: `Dica: pressione <kbd>Ctrl+K</kbd> para busca global e <kbd>?</kbd> para ver todos os atalhos de teclado.<br>
             Você pode reiniciar este tour em <b>Configurações → Tour Guiado</b>.`,
      title: '⌨️ Atalhos',
    },
  ];

  function navigateTo(hash) {
    return new Promise(resolve => {
      if (location.hash !== hash) location.hash = hash;
      setTimeout(resolve, 400);
    });
  }

  async function startTour(force = false) {
    if (!force && localStorage.getItem(TOUR_KEY)) return;
    try {
      const Shepherd = await loadShepherd();
      const tour = new Shepherd.Tour({
        useModalOverlay: true,
        defaultStepOptions: {
          cancelIcon: { enabled: true },
          classes: 'rh-tour-step',
          scrollTo: { behavior: 'smooth', block: 'center' },
          buttons: [
            { text: 'Anterior', action: function () { this.back(); }, secondary: true },
            { text: 'Próximo →', action: function () { this.next(); } },
          ],
        },
      });

      for (const step of STEPS) {
        tour.addStep({
          id: step.id,
          title: step.title,
          text: step.text,
          attachTo: step.attachTo,
          beforeShowPromise: step.beforeShowPromise,
          buttons: step.id === STEPS[STEPS.length - 1].id
            ? [
                { text: 'Anterior', action: function () { this.back(); }, secondary: true },
                { text: '✅ Concluir', action: function () { this.complete(); } },
              ]
            : step.id === STEPS[0].id
              ? [{ text: 'Começar →', action: function () { this.next(); } }]
              : undefined,
        });
      }

      tour.on('complete', () => localStorage.setItem(TOUR_KEY, '1'));
      tour.on('cancel',   () => localStorage.setItem(TOUR_KEY, '1'));
      tour.start();
    } catch (e) {
      console.warn('[tour]', e);
    }
  }

  window.RhinoTour = { start: (force) => startTour(force) };

  // Auto-dispara para novos usuários após boot
  window.addEventListener('rh:boot-done', () => setTimeout(() => startTour(false), 1200));
})();
