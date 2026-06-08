// @ts-check
// Testes E2E de features transversais — versão pós-React (F5-2).
//
// Mantidos: PWA, Theme customizer (Ctrl+K continua TODO até F4-5b),
// Global search API, Health version.
//
// Removidos/skipados: Command palette (F4-5b pendente), Atalhos de teclado
// (não portados), Bottom nav (F4-5c pendente), ContratoDetail global
// (window.ContratoDetail virou módulo React).

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

// ─── Skipped até follow-ups ────────────────────────────────────────────
test.describe.skip('Command palette (F4-5b pendente)', () => {
  test('Ctrl+K abre o palette e Esc fecha', async ({ page }) => {
    await login(page);
    await page.keyboard.press('Control+K');
    await expect(page.locator('.cmdk-overlay')).toBeVisible();
  });
});

test.describe.skip('Atalhos de teclado (não portados)', () => {
  test('? abre help', async () => {});
});

test.describe.skip('Bottom nav (F4-5c pendente)', () => {
  test('aparece em mobile', async () => {});
});

test.describe.skip('Boot loader (removido em React)', () => {
  test('aparece e some', async () => {});
});

test.describe.skip('ContratoDetail global (módulo virou React)', () => {
  test('sub-módulos servem 200', async () => {});
});
