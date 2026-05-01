/* Rhino · Theme Customizer (D3)
   Permite escolher cor primária e raio de borda. Persiste em localStorage.
   FAB no canto inferior direito (oculto no mobile).
*/
(function () {
  'use strict';

  const PRESETS = [
    { name: 'Slate Purple', hex: '#55588B' }, // padrão
    { name: 'Royal Blue',   hex: '#3B5BDB' },
    { name: 'Teal',         hex: '#0E9384' },
    { name: 'Forest',       hex: '#2F855A' },
    { name: 'Sunset',       hex: '#D97706' },
    { name: 'Crimson',      hex: '#B91C1C' },
    { name: 'Magenta',      hex: '#BE185D' },
    { name: 'Indigo',       hex: '#4338CA' },
    { name: 'Ocean',        hex: '#0369A1' },
    { name: 'Graphite',     hex: '#374151' },
    { name: 'Olive',        hex: '#65A30D' },
    { name: 'Plum',         hex: '#7C3AED' },
  ];
  const KEY_COLOR  = 'rhino-theme-color';
  const KEY_RADIUS = 'rhino-theme-radius';

  function shade(hex, pct) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
    const f = pct < 0 ? 0 : 255;
    const t = Math.abs(pct);
    r = Math.round((f - r) * t + r);
    g = Math.round((f - g) * t + g);
    b = Math.round((f - b) * t + b);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  function apply(hex, radius) {
    const root = document.documentElement.style;
    if (hex) {
      root.setProperty('--color-primary', hex);
      root.setProperty('--color-primary-light', shade(hex, 0.15));
      root.setProperty('--color-primary-dark',  shade(hex, -0.20));
      root.setProperty('--sidebar-active-text', hex);
      root.setProperty('--sidebar-active-bg',   hex + '14'); // 8% alpha
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', hex);
    }
    if (radius != null) {
      root.setProperty('--border-radius',    radius + 'px');
      root.setProperty('--border-radius-lg', (radius * 1.6) + 'px');
    }
  }

  function load() {
    let hex = null, radius = null;
    try { hex = localStorage.getItem(KEY_COLOR); } catch {}
    try {
      const r = localStorage.getItem(KEY_RADIUS);
      if (r != null) radius = parseInt(r, 10);
    } catch {}
    apply(hex, radius);
  }
  load();

  // FAB + painel
  function build() {
    const fab = document.createElement('button');
    fab.className = 'theme-customizer-fab';
    fab.setAttribute('aria-label', 'Personalizar tema');
    fab.title = 'Personalizar tema';
    fab.textContent = '🎨';
    document.body.appendChild(fab);

    let panel = null;
    fab.addEventListener('click', () => {
      if (panel) { panel.remove(); panel = null; return; }
      panel = document.createElement('div');
      panel.className = 'theme-customizer-panel';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', 'Personalizar tema');
      const currentHex = (localStorage.getItem(KEY_COLOR) || PRESETS[0].hex).toLowerCase();
      const currentR   = parseInt(localStorage.getItem(KEY_RADIUS) || '6', 10);
      panel.innerHTML = `
        <h4>Personalizar tema</h4>
        <div class="theme-swatches">
          ${PRESETS.map((p) => `
            <button type="button" class="theme-swatch ${p.hex.toLowerCase() === currentHex ? 'is-active' : ''}"
                    style="background:${p.hex};" data-hex="${p.hex}" title="${p.name}" aria-label="${p.name}"></button>
          `).join('')}
        </div>
        <label>Raio de borda <input type="range" min="0" max="18" step="2" value="${currentR}" data-radius></label>
        <button type="button" class="btn btn-sm" data-reset style="margin-top:12px;width:100%;">Restaurar padrão</button>`;
      document.body.appendChild(panel);

      panel.querySelectorAll('[data-hex]').forEach((b) => {
        b.addEventListener('click', () => {
          const hex = b.dataset.hex;
          try { localStorage.setItem(KEY_COLOR, hex); } catch {}
          apply(hex, null);
          panel.querySelectorAll('.theme-swatch').forEach((s) => s.classList.toggle('is-active', s.dataset.hex.toLowerCase() === hex.toLowerCase()));
        });
      });
      panel.querySelector('[data-radius]').addEventListener('input', (e) => {
        const v = parseInt(e.target.value, 10);
        try { localStorage.setItem(KEY_RADIUS, String(v)); } catch {}
        apply(null, v);
      });
      panel.querySelector('[data-reset]').addEventListener('click', () => {
        try { localStorage.removeItem(KEY_COLOR); localStorage.removeItem(KEY_RADIUS); } catch {}
        const root = document.documentElement.style;
        ['--color-primary','--color-primary-light','--color-primary-dark','--sidebar-active-text','--sidebar-active-bg','--border-radius','--border-radius-lg'].forEach((p) => root.removeProperty(p));
        panel.remove(); panel = null;
        if (window.RhinoUI && RhinoUI.toast) RhinoUI.toast('Tema padrão restaurado', { type: 'info' });
      });
      // fechar ao clicar fora
      setTimeout(() => {
        document.addEventListener('click', function once(e) {
          if (panel && !panel.contains(e.target) && e.target !== fab) {
            panel.remove(); panel = null;
            document.removeEventListener('click', once);
          }
        });
      }, 0);
    });
  }
  if (document.readyState !== 'loading') build();
  else document.addEventListener('DOMContentLoaded', build);
})();
