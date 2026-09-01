// @ts-check
// Testes E2E de features transversais — versão pós-React (F5-2).
//
// Command palette, atalhos de teclado e bottom nav foram marcados
// skip.'d nesta suíte como TODO (F4-5b/F4-5c) quando este arquivo nasceu —
// as features foram implementadas depois (js/polish.js `openCmdK`/atalho
// Ctrl+K, js/power.js `RU.showShortcutsHelp`/atalho "?", js/polish.js
// `renderBottomNav`) mas os testes nunca foram destravados (item D14 do
// plano async-wandering-kite). Removido apenas o teste "ContratoDetail
// global (sub-módulos servem 200)": nasceu vazio nesta mesma suíte
// (commit c3a3b69) testando o code-splitting de chunks React — a reescrita
// em React foi completamente removida em 2026-05-28 (commit 4481d68) e o
// hash-router legado (voltou a produção) não tem conceito equivalente.

const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.RHINO_URL || 'http://localhost:3001';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@rhino.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

async function login(page) {
  await page.goto(BASE_URL);
  if ((await page.locator('#loginForm').count()) > 0) {
    await page.fill('input[name="email"]', ADMIN_EMAIL);
    await page.fill('input[name="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForFunction(
      () =>
        document.querySelector('#btnAceitarTermos, #btnAceitar') ||
        document.querySelector('.perfil-card') ||
        document.querySelector('#sidebar a, #sidebar button'),
      { timeout: 10_000 },
    );
  }
  if ((await page.locator('#btnAceitarTermos, #btnAceitar').count()) > 0) {
    await page.locator('#btnAceitarTermos, #btnAceitar').click();
    await page.waitForFunction(
      () =>
        document.querySelector('.perfil-card') ||
        document.querySelector('#sidebar a, #sidebar button'),
      { timeout: 10_000 },
    );
  }
  if ((await page.locator('.perfil-card').count()) > 0) {
    await page.locator('.perfil-card').first().click();
  }
  await page.waitForSelector('#sidebar', { state: 'attached', timeout: 10_000 });
}

test.describe('PWA', () => {
  test('manifest é servido (legacy ou React)', async ({ request }) => {
    // No modo React (vite-plugin-pwa), o manifest é gerado em /manifest.webmanifest
    // automaticamente. No legacy, o arquivo já existe na raiz.
    const r = await request.get(`${BASE_URL}/manifest.webmanifest`);
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.name).toContain('Rhino');
    expect(body.start_url).toBeTruthy();
    expect(body.display).toBe('standalone');
    expect(Array.isArray(body.icons)).toBe(true);
  });

  test('service worker é servido com Content-Type JS', async ({ request }) => {
    const r = await request.get(`${BASE_URL}/sw.js`);
    expect(r.status()).toBe(200);
    expect(r.headers()['content-type']).toContain('javascript');
    const text = await r.text();
    // Workbox no React gera nomes diferentes mas mantém addEventListener
    expect(text).toContain('addEventListener');
  });

  test('HTML referencia manifest', async ({ request }) => {
    const r = await request.get(`${BASE_URL}/`);
    const html = await r.text();
    // Vite injeta link rel="manifest" automaticamente via vite-plugin-pwa.
    expect(html).toContain('manifest');
  });
});

test.describe('Theme customizer', () => {
  test('FAB abre painel com presets', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await login(page);
    // React: ThemeCustomizer renderiza um <button class="theme-customizer-fab">.
    // Legacy: mesmo FAB criado por themer.js.
    const fab = page.locator('.theme-customizer-fab');
    await expect(fab).toBeVisible({ timeout: 3000 });
    await fab.evaluate((el) => el.click()); // FAB anima/posiciona fora da viewport p/ o Playwright; dispara o click via DOM
    await expect(page.locator('.theme-customizer-panel')).toBeVisible({ timeout: 3000 });
    const swatches = await page.locator('.theme-swatch').count();
    expect(swatches).toBeGreaterThanOrEqual(8);
  });
});

test.describe('Global search (M3)', () => {
  test('GET /api/search?q=ab exige auth e retorna 200 com sessão', async ({ request, playwright }) => {
    const r1 = await request.get(`${BASE_URL}/api/search?q=ab`);
    expect(r1.status()).toBe(401);

    const ctx = await playwright.request.newContext({
      baseURL: BASE_URL,
      extraHTTPHeaders: { 'Content-Type': 'application/json' },
    });
    await ctx.post('/api/auth/login', {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    const r2 = await ctx.get('/api/search?q=ab');
    expect(r2.status()).toBe(200);
    const body = await r2.json();
    expect(body).toHaveProperty('results');
    expect(Array.isArray(body.results)).toBe(true);
  });

  test('busca com q vazia retorna sem resultados', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({
      baseURL: BASE_URL,
      extraHTTPHeaders: { 'Content-Type': 'application/json' },
    });
    await ctx.post('/api/auth/login', {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
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

test.describe('Command palette', () => {
  test('Ctrl+K abre o palette, busca filtra e Esc fecha', async ({ page }) => {
    await login(page);
    await page.keyboard.press('Control+K');
    const overlay = page.locator('.cmdk-overlay');
    await expect(overlay).toBeVisible();
    await expect(page.locator('.cmdk-panel[aria-label="Buscar e navegar"]')).toBeVisible();

    await page.locator('.cmdk-input').fill('dashboard');
    await expect(page.locator('.cmdk-item').first()).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(overlay).toHaveCount(0);
  });
});

test.describe('Atalhos de teclado', () => {
  test('? abre o modal de ajuda e Esc fecha', async ({ page }) => {
    await login(page);
    // Garante que o foco não está num campo editável (o atalho de tecla única
    // é ignorado nesse caso — ver js/power.js).
    await page.locator('#sidebar').click();
    await page.keyboard.press('?');
    const modal = page.locator('#rh-shortcuts-modal');
    await expect(modal).toBeVisible();
    await expect(modal.locator('.cmdk-item').first()).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0);
  });
});

test.describe('Bottom nav', () => {
  test('aparece em viewport mobile e some em desktop', async ({ page }) => {
    await login(page);
    await page.setViewportSize({ width: 375, height: 700 });
    await expect(page.locator('.bottom-nav')).toBeVisible({ timeout: 2000 });
    await expect(page.locator('.bottom-nav__item').first()).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.locator('.bottom-nav')).toHaveCount(0);
  });
});

test.describe('Boot loader', () => {
  test('está na marcação inicial servida e é removido após o boot completar', async ({ page, request }) => {
    // Aparece: o HTML servido pelo backend já inclui o loader estático — é o
    // primeiro frame que o usuário vê antes do JS assumir (index.html).
    const r = await request.get(BASE_URL + '/');
    const html = await r.text();
    expect(html).toMatch(/class="boot-loader"/);

    // Some: depois do boot completar (login + app pronto), o loader não deve
    // mais estar no DOM (window.RhinoBoot.done() o remove — js/polish.js).
    await login(page);
    await expect(page.locator('.boot-loader')).toHaveCount(0);
  });
});
