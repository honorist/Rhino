// @ts-check
// Testes E2E de features novas: PWA, command palette, dark mode, atalhos,
// theme customizer, bottom nav. Roda contra app autenticado.
const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.RHINO_URL || 'http://localhost:3001';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@rhino.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

async function login(page) {
  await page.goto(BASE_URL);
  // Login modal aparece se não houver sessão
  const loginVisible = await page.locator('#loginForm').count();
  if (loginVisible) {
    await page.fill('input[name="email"]', ADMIN_EMAIL);
    await page.fill('input[name="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
  }
  // Aceita LGPD se aparecer
  const lgpd = page.locator('#btnAceitarTermos');
  if (await lgpd.count()) await lgpd.click();
  // Perfil picker — pega o primeiro
  const perfil = page.locator('.perfil-card').first();
  if (await perfil.count()) await perfil.click();
  await page.waitForSelector('#sidebar', { state: 'attached', timeout: 10_000 });
}

test.describe('PWA', () => {
  test('manifest.webmanifest é servido com JSON válido', async ({ request }) => {
    const r = await request.get(`${BASE_URL}/manifest.webmanifest`);
    expect(r.status()).toBe(200);
    expect(r.headers()['content-type']).toContain('manifest');
    const body = await r.json();
    expect(body.name).toContain('Rhino');
    expect(body.start_url).toBeTruthy();
    expect(body.display).toBe('standalone');
    expect(Array.isArray(body.icons)).toBe(true);
    expect(body.icons.length).toBeGreaterThan(0);
  });

  test('service worker é servido com Content-Type JS', async ({ request }) => {
    const r = await request.get(`${BASE_URL}/sw.js`);
    expect(r.status()).toBe(200);
    expect(r.headers()['content-type']).toContain('javascript');
    const text = await r.text();
    expect(text).toContain('addEventListener');
  });

  test('HTML referencia manifest e ícones', async ({ request }) => {
    const r = await request.get(`${BASE_URL}/`);
    const html = await r.text();
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('apple-touch-icon');
    expect(html).toContain('theme-color');
  });

  test('SW registra sem erro no browser', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE_URL);
    // Espera o boot loader sumir (= app booted)
    await page.waitForFunction(() => !document.querySelector('.boot-loader'), { timeout: 10_000 });
    const swRegistered = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return 'no-sw-support';
      const reg = await navigator.serviceWorker.getRegistration();
      return reg ? 'registered' : 'none';
    });
    // Em http://localhost SW não registra (precisa HTTPS); em prod sim.
    expect(['registered', 'none']).toContain(swRegistered);
    expect(errors).toEqual([]);
  });
});

test.describe('Boot loader', () => {
  test('boot loader aparece e some após boot', async ({ page }) => {
    await page.goto(BASE_URL);
    // Pode ser fast em dev, então não exigimos visibilidade explícita
    await page.waitForFunction(() => !document.querySelector('.boot-loader'), { timeout: 10_000 });
    expect(await page.locator('.boot-loader').count()).toBe(0);
  });
});

test.describe('Command palette', () => {
  test('Ctrl+K abre o palette e Esc fecha', async ({ page }) => {
    await login(page);
    await page.keyboard.press('Control+K');
    await expect(page.locator('.cmdk-overlay')).toBeVisible({ timeout: 2000 });
    await page.keyboard.press('Escape');
    await expect(page.locator('.cmdk-overlay')).toHaveCount(0);
  });

  test('palette lista rotas locais', async ({ page }) => {
    await login(page);
    await page.keyboard.press('Control+K');
    await expect(page.locator('.cmdk-list')).toBeVisible();
    const items = await page.locator('.cmdk-item').count();
    expect(items).toBeGreaterThan(3);
    await page.keyboard.press('Escape');
  });
});

test.describe('Atalhos de teclado', () => {
  test('? abre help de atalhos', async ({ page }) => {
    await login(page);
    await page.keyboard.press('Shift+/'); // = ?
    await expect(page.locator('#rh-shortcuts-modal')).toBeVisible({ timeout: 2000 });
    await page.keyboard.press('Escape');
  });

  test('g+d navega para Dashboard', async ({ page }) => {
    await login(page);
    await page.keyboard.press('g');
    await page.keyboard.press('d');
    await page.waitForFunction(() => location.hash === '#/dashboard', { timeout: 2000 });
  });
});

test.describe('Theme', () => {
  test('toggle de tema dark/light persiste em localStorage', async ({ page }) => {
    await login(page);
    // Garante começar em light
    await page.evaluate(() => localStorage.setItem('rhino-theme', 'light'));
    await page.reload();
    await page.waitForSelector('#sidebar', { state: 'attached' });

    await page.keyboard.press('t'); // atalho
    await page.waitForTimeout(150);
    const t1 = await page.evaluate(() => localStorage.getItem('rhino-theme'));
    expect(t1).toBe('dark');
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  });
});

test.describe('Theme customizer', () => {
  test('botão de tema abre painel com presets', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await login(page);
    // Botão foi movido para sidebar (#btn-themer); FAB original está oculto mas funcional
    await page.locator('#btn-themer').click();
    await expect(page.locator('.theme-customizer-panel')).toBeVisible({ timeout: 3000 });
    const swatches = await page.locator('.theme-swatch').count();
    expect(swatches).toBeGreaterThanOrEqual(8);
  });
});

test.describe('Bottom nav (mobile)', () => {
  test('aparece em viewport mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);
    await page.waitForTimeout(300);
    await expect(page.locator('.bottom-nav')).toBeVisible();
    const items = await page.locator('.bottom-nav__item').count();
    expect(items).toBe(5);
  });

  test('não aparece em desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await login(page);
    expect(await page.locator('.bottom-nav').count()).toBe(0);
  });
});

test.describe('Global search (M3)', () => {
  test('GET /api/search?q=ab requer auth e retorna 200 com sessão', async ({ request }) => {
    const r1 = await request.get(`${BASE_URL}/api/search?q=ab`);
    expect(r1.status()).toBe(401);

    const ctx = await request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { 'Content-Type': 'application/json' } });
    await ctx.post('/api/auth/login', { data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
    const r2 = await ctx.get('/api/search?q=ab');
    expect(r2.status()).toBe(200);
    const body = await r2.json();
    expect(body).toHaveProperty('results');
    expect(Array.isArray(body.results)).toBe(true);
  });

  test('busca com q vazia retorna sem resultados', async ({ request }) => {
    const ctx = await request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { 'Content-Type': 'application/json' } });
    await ctx.post('/api/auth/login', { data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
    const r = await ctx.get('/api/search?q=');
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.results).toEqual([]);
  });
});

test.describe('Health version', () => {
  test('version vem do package.json (não "dev")', async ({ request }) => {
    const r = await request.get(`${BASE_URL}/api/health`);
    const body = await r.json();
    expect(body.version).not.toBe('dev');
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});

test.describe('ContratoDetail refactor (M1)', () => {
  test('todos os 10 sub-módulos servem 200', async ({ request }) => {
    const mods = ['charts','visao-geral','organograma','rdos','rdo-form','rdo-pdf','modais','cronograma','export-pdf','modais-extra'];
    for (const m of mods) {
      const r = await request.get(`${BASE_URL}/js/views/contrato/${m}.js`);
      expect(r.status(), m).toBe(200);
    }
  });

  test('window.ContratoDetail tem todos os métodos (incluindo novos)', async ({ page }) => {
    await login(page);
    const methods = await page.evaluate(() => {
      const cd = window.ContratoDetail || {};
      const need = [
        'render', 'renderPizza', 'renderCurvaS', 'renderOrganogramaSection',
        'renderRdoSection', 'showRdoDetail', 'renderCronogramaSection',
        'exportarPDF', 'showModalEditarDados', 'showModalExcluirContrato',
        'showDetalheComposicao',
        // features desta sessão:
        'renderAditivosSection', 'renderMarcosSection',
        'renderOcorrenciasSection', 'renderTimelineSection',
      ];
      return need.map(n => ({ name: n, exists: typeof cd[n] === 'function' }));
    });
    const missing = methods.filter(m => !m.exists).map(m => m.name);
    expect(missing).toEqual([]);
  });
});
