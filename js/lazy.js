/* Rhino · Lazy loader de libs CDN
   Carrega bibliotecas pesadas só quando alguma view precisar.
   Uso:
     await RhinoLazy.ensure('jspdf');
     await RhinoLazy.ensure(['jspdf', 'jspdf-autotable']);
*/
(function () {
  'use strict';

  const REGISTRY = {
    'leaflet-css': {
      type: 'css',
      href: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
      crossorigin: '',
    },
    'leaflet': {
      deps: ['leaflet-css'],
      type: 'js',
      src: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
      crossorigin: '',
      check: () => typeof window.L !== 'undefined',
    },
    // Chart.js — usado apenas em Dashboard, RDOs, Previsao e contrato/charts.
    // ~220 KB minificado — não carregar eager nas rotas que não plotam gráficos.
    'chart': {
      type: 'js',
      src: './js/lib/chart.js',
      check: () => typeof window.Chart !== 'undefined',
    },
    // Utilitários locais — pequenos mas evita 2 round-trips a mais no boot.
    'geo': {
      type: 'js',
      src: './js/lib/geo.js',
      check: () => typeof window.GeoUtils !== 'undefined',
    },
    'recurrence': {
      type: 'js',
      src: './js/lib/recurrence.js',
      check: () => typeof window.RhinoRecurrence !== 'undefined',
    },
    'jspdf': {
      type: 'js',
      src: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
      check: () => typeof window.jspdf !== 'undefined',
    },
    'jspdf-autotable': {
      deps: ['jspdf'],
      type: 'js',
      src: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
      check: () => { try { const { jsPDF } = window.jspdf || {}; return typeof jsPDF?.API?.autoTable === 'function'; } catch { return false; } },
    },
    'signature_pad': {
      type: 'js',
      src: 'https://cdn.jsdelivr.net/npm/signature_pad@4.2.0/dist/signature_pad.umd.min.js',
      check: () => typeof window.SignaturePad !== 'undefined',
    },
    'mermaid': {
      type: 'module-init',
      check: () => typeof window.mermaid !== 'undefined',
      load: () => import('https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs')
        .then((m) => {
          window.mermaid = m.default;
          window.mermaid.initialize({
            startOnLoad: false,
            theme: 'base',
            // 'strict' bloqueia HTML/JS em labels — Manual usa apenas texto puro,
            // não precisa de 'loose'. Se algum diagrama mostrar problema visual,
            // troque por 'antiscript' (permite HTML simples mas bloqueia <script>).
            securityLevel: 'strict',
            flowchart: {
              htmlLabels: true,
              curve: 'basis',
              padding: 20,
              nodeSpacing: 60,
              rankSpacing: 80,
              useMaxWidth: false,
              wrappingWidth: 200,
            },
            themeVariables: {
              background: '#0f172a',
              primaryColor: '#1e293b',
              primaryTextColor: '#f1f5f9',
              primaryBorderColor: '#475569',
              lineColor: '#94a3b8',
              secondaryColor: '#1d4ed8',
              tertiaryColor: '#065f46',
              fontFamily: 'Nunito, sans-serif',
              fontSize: '15px',
            },
          });
        }),
    },
  };

  const inflight = new Map();

  function injectScript(src, attrs = {}) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      Object.entries(attrs).forEach(([k, v]) => s.setAttribute(k, v));
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`Falha ao carregar ${src}`));
      document.head.appendChild(s);
    });
  }
  function injectCss(href, attrs = {}) {
    return new Promise((resolve, reject) => {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = href;
      Object.entries(attrs).forEach(([k, v]) => l.setAttribute(k, v));
      l.onload = () => resolve();
      l.onerror = () => reject(new Error(`Falha ao carregar ${href}`));
      document.head.appendChild(l);
    });
  }

  async function loadOne(name) {
    const cfg = REGISTRY[name];
    if (!cfg) throw new Error(`Lib desconhecida: ${name}`);
    if (cfg.check && cfg.check()) return;
    if (inflight.has(name)) return inflight.get(name);

    const p = (async () => {
      if (cfg.deps) {
        for (const d of cfg.deps) await loadOne(d);
      }
      if (cfg.load) {
        await cfg.load();
      } else if (cfg.type === 'js') {
        const attrs = {};
        if (cfg.crossorigin !== undefined) attrs.crossorigin = cfg.crossorigin;
        await injectScript(cfg.src, attrs);
      } else if (cfg.type === 'css') {
        const attrs = {};
        if (cfg.crossorigin !== undefined) attrs.crossorigin = cfg.crossorigin;
        await injectCss(cfg.href, attrs);
      }
    })();
    inflight.set(name, p);
    return p;
  }

  window.RhinoLazy = {
    async ensure(names) {
      const list = Array.isArray(names) ? names : [names];
      for (const n of list) await loadOne(n);
    },
  };
})();
