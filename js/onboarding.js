/* Rhino · F17 — Onboarding Tour
   Shepherd.js v11 via CDN.
   Dispara automaticamente na primeira visita (sem rhino-tour-v1 no localStorage).
   Exporta window.RhinoTour para acionar manualmente via Configurações → Tour Guiado.
*/
(function () {
  'use strict';

  const TOUR_KEY    = 'rhino-tour-v1';
  const SHEPHERD_CSS = 'https://cdn.jsdelivr.net/npm/shepherd.js@11/dist/css/shepherd.css';
  const SHEPHERD_JS  = 'https://cdn.jsdelivr.net/npm/shepherd.js@11/dist/js/shepherd.min.js';

  let _loadingPromise = null;

  async function loadShepherd() {
    if (window.Shepherd && typeof window.Shepherd.Tour === 'function') return window.Shepherd;
    if (_loadingPromise) return _loadingPromise;
    _loadingPromise = (async () => {
      if (!document.querySelector(`link[href="${SHEPHERD_CSS}"]`)) {
        const link = document.createElement('link');
        link.rel = 'stylesheet'; link.href = SHEPHERD_CSS;
        document.head.appendChild(link);
      }
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = SHEPHERD_JS;
        s.onload = () => window.Shepherd ? resolve() : reject(new Error('Shepherd não definido após carga'));
        s.onerror = () => reject(new Error('Falha ao carregar Shepherd.js do CDN'));
        document.head.appendChild(s);
      });
      return window.Shepherd;
    })();
    try { return await _loadingPromise; } finally { _loadingPromise = null; }
  }

  // Navega para um hash e aguarda o DOM estabilizar.
  // afterEl: se fornecido, aguarda até esse seletor existir no DOM.
  function navigateTo(hash, afterEl, timeout) {
    return new Promise(resolve => {
      if (location.hash !== hash) location.hash = hash;
      const wait = timeout || 600;
      if (!afterEl) { setTimeout(resolve, wait); return; }
      const deadline = Date.now() + wait + 800;
      const check = () => {
        if (document.querySelector(afterEl) || Date.now() > deadline) { resolve(); return; }
        setTimeout(check, 80);
      };
      setTimeout(check, wait);
    });
  }

  // Retorna o elemento ou null — nunca lança
  function el(selector) {
    try { return document.querySelector(selector); } catch { return null; }
  }

  // Passos do tour — cada um navega para a página correspondente
  // e aponta para um elemento real da tela (conteúdo, não apenas sidebar)
  const STEPS = [
    // ── 1. Boas-vindas ───────────────────────────────────────────────────────
    {
      id: 'boas-vindas',
      title: '👋 Bem-vindo ao Rhino!',
      text: 'Este tour mostra as principais telas em menos de 2 minutos.<br>Use <b>Próximo →</b> para avançar ou clique em ✕ para sair.',
      attachTo: { element: '#sidebar', on: 'right' },
    },

    // ── 2. Dashboard ─────────────────────────────────────────────────────────
    {
      id: 'dashboard',
      title: '📊 Dashboard',
      text: 'Visão geral do negócio: contratos ativos, saldo do caixa, notas a receber e alertas de prazo — tudo em um só lugar.',
      beforeShowPromise: () => navigateTo('#/dashboard', '#app .card, #app canvas, #app [class*="kpi"]'),
      attachTo: { element: '#app', on: 'right' },
    },

    // ── 3. Contratos ─────────────────────────────────────────────────────────
    {
      id: 'contratos',
      title: '📁 Contratos',
      text: 'Cadastre e acompanhe cada obra. Para cada contrato você tem: orçamento, medições (BMs), aditivos, marcos, cronograma, equipe e RDOs.',
      beforeShowPromise: () => navigateTo('#/contratos', '#app .card, #btnNovoContrato'),
      attachTo: { element: '#app', on: 'right' },
    },

    // ── 4. Detalhe do contrato ────────────────────────────────────────────────
    {
      id: 'contrato-abas',
      title: '📑 Abas do contrato',
      text: 'Dentro de cada contrato há abas: <b>Visão Geral</b>, <b>Financeiro</b>, <b>Aditivos</b>, <b>Marcos</b>, <b>Ocorrências</b> e <b>Timeline</b> — todo o histórico do projeto num só lugar.',
      beforeShowPromise: () => navigateTo('#/contratos', '.ctd-tabs, #btnNovoContrato'),
      attachTo: {
        element: '.ctd-tabs',
        on: 'bottom',
      },
      // Se não há contrato aberto, fallback para o topo da listagem
    },

    // ── 5. Financeiro / Caixa ────────────────────────────────────────────────
    {
      id: 'caixa',
      title: '💰 Caixa',
      text: 'Controle todos os lançamentos: entradas de medições, saídas de contratos, pagamentos e aportes dos sócios. Saldo atualizado em tempo real.',
      beforeShowPromise: () => navigateTo('#/caixa', '#app .card, #app table'),
      attachTo: { element: '#app', on: 'right' },
    },

    // ── 6. Contas a Pagar ────────────────────────────────────────────────────
    {
      id: 'contas-pagar',
      title: '📋 Contas a Pagar',
      text: 'Gerencie fornecedores e despesas. Ao pagar, o lançamento é automaticamente criado no Caixa — sem entrada dupla.',
      beforeShowPromise: () => navigateTo('#/contas-pagar', '#app .card, #btnNovaConta'),
      attachTo: { element: '#app', on: 'right' },
    },

    // ── 7. Notas Fiscais ─────────────────────────────────────────────────────
    {
      id: 'notas-fiscais',
      title: '🧾 Notas Fiscais (BMs)',
      text: 'Cada saída de contrato gera uma NF (Boletim de Medição). Ao emitir, a entrada entra no Caixa automaticamente. Controle % medido vs % executado.',
      beforeShowPromise: () => navigateTo('#/notas-fiscais', '#app .card, #btnNovoNF'),
      attachTo: { element: '#app', on: 'right' },
    },

    // ── 8. RDOs ──────────────────────────────────────────────────────────────
    {
      id: 'rdos',
      title: '📝 RDOs',
      text: 'Relatório Diário de Obra: registre equipe (MOI/MOD), equipamentos, condições climáticas, atividades e fotos. Gera PDF assinado.',
      beforeShowPromise: () => navigateTo('#/rdos', '#app .card, #btnNovoRdo'),
      attachTo: { element: '#app', on: 'right' },
    },

    // ── 9. Recursos ──────────────────────────────────────────────────────────
    {
      id: 'recursos',
      title: '👷 Recursos Humanos',
      text: 'Cadastre colaboradores: nome, função, CPF, contato. Eles aparecem no organograma dos contratos e nos RDOs.',
      beforeShowPromise: () => navigateTo('#/recursos', '#app .card, #btnNovoRecurso'),
      attachTo: { element: '#app', on: 'right' },
    },

    // ── 10. Atalhos ──────────────────────────────────────────────────────────
    {
      id: 'atalhos',
      title: '⌨️ Atalhos úteis',
      text: `
        <ul style="margin:8px 0;padding-left:18px;line-height:2;">
          <li><kbd>Ctrl+K</kbd> — Busca global (qualquer tela)</li>
          <li><kbd>?</kbd> — Lista todos os atalhos</li>
          <li><kbd>t</kbd> — Alternar tema claro/escuro</li>
          <li><b>Configurações → Tour Guiado</b> — repetir este tour</li>
        </ul>`,
      attachTo: { element: '#sidebar', on: 'right' },
      beforeShowPromise: () => navigateTo('#/dashboard', '#app .card'),
    },
  ];

  async function startTour(force = false) {
    if (!force && localStorage.getItem(TOUR_KEY)) return;

    const toast = (msg, type) => {
      if (window.showToast) window.showToast(msg, type);
      else if (window.RhinoUI && RhinoUI.toast) RhinoUI.toast(msg, { type });
    };

    try {
      const Shepherd = await loadShepherd();
      if (!Shepherd || typeof Shepherd.Tour !== 'function') {
        toast('Tour não disponível (biblioteca não carregou)', 'warn');
        return;
      }

      const tour = new Shepherd.Tour({
        useModalOverlay: true,
        defaultStepOptions: {
          cancelIcon: { enabled: true },
          classes: 'rh-tour-step',
          scrollTo: { behavior: 'smooth', block: 'center' },
          buttons: [
            { text: '← Anterior', action: function () { this.back(); }, secondary: true },
            { text: 'Próximo →',  action: function () { this.next(); } },
          ],
        },
      });

      STEPS.forEach((step, i) => {
        const isFirst = i === 0;
        const isLast  = i === STEPS.length - 1;

        // Resolve attachTo: usa seletor de string, faz fallback para '#app' se elemento não encontrado
        const resolveAttach = () => {
          if (!step.attachTo) return undefined;
          const target = typeof step.attachTo.element === 'string'
            ? el(step.attachTo.element)
            : step.attachTo.element;
          return target ? step.attachTo : { element: '#app', on: step.attachTo.on || 'bottom' };
        };

        // IMPORTANTE: não passar a chave 'buttons' nos passos do meio.
        // Se 'buttons: undefined' for passado, Shepherd sobrescreve defaultStepOptions.buttons
        // com vazio, eliminando os botões. Omitir a chave herda o padrão corretamente.
        const cfg = {
          id:    step.id,
          title: step.title,
          text:  step.text,
          attachTo: resolveAttach(),
          beforeShowPromise: step.beforeShowPromise
            ? () => step.beforeShowPromise().then(() => {
                const s = tour.getById(step.id);
                if (s && step.attachTo) s.options.attachTo = resolveAttach();
              })
            : undefined,
        };

        if (isFirst) {
          cfg.buttons = [{ text: 'Começar →', action: function () { this.next(); } }];
        } else if (isLast) {
          cfg.buttons = [
            { text: '← Anterior', action: function () { this.back(); }, secondary: true },
            { text: '✅ Concluir', action: function () { this.complete(); } },
          ];
        }
        // passos do meio: sem 'buttons' → herda defaultStepOptions.buttons (← Anterior + Próximo →)

        tour.addStep(cfg);
      });

      tour.on('complete', () => localStorage.setItem(TOUR_KEY, '1'));
      tour.on('cancel',   () => localStorage.setItem(TOUR_KEY, '1'));
      tour.start();
    } catch (e) {
      console.warn('[tour]', e);
      toast('Não foi possível iniciar o tour: ' + (e.message || 'erro desconhecido'), 'error');
    }
  }

  window.RhinoTour = { start: (force) => startTour(force) };

  // Auto-dispara para novos usuários — 'rh:app-ready' só sai depois que o
  // gate de perfil (termos + seletor de perfil) já foi resolvido, então o
  // tour nunca corre disputando clique com esses overlays.
  window.addEventListener('rh:app-ready', () => setTimeout(() => startTour(false), 1200));
})();
