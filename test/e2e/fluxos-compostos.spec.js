// @ts-check
/**
 * Fluxos compostos E2E (F5-2c).
 *
 * Cobre fluxos críticos que atravessam várias telas:
 *  1. Cliente → Contrato → Saída → NF → Caixa
 *  2. Recurso → Folga
 *  3. Solicitação de compra → Avaliar → Aprovar → Receber
 *  4. Recrutamento: Solicitação → Candidato → Triagem → Aprovação
 *
 * Selectors React (size='xl'/'lg' do Modal). Reusa helpers do smoke.spec.js.
 */
const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.RHINO_URL || 'http://localhost:3001';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@rhino.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

async function freshApp(page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('rhino:') || k.startsWith('rhino-'))
        .forEach((k) => localStorage.removeItem(k));
      sessionStorage.clear();
      // Marca o tour de onboarding como visto — senão o popup "Bem-vindo ao Rhino"
      // sobe na sessão nova e bloqueia os cliques (timeout de 30s).
      localStorage.setItem('rhino-tour-v1', '1');
    } catch {}
  }).catch(() => {});
  await page.goto(BASE_URL);

  await page.waitForFunction(
    () =>
      document.querySelector('#loginForm') ||
      document.querySelector('.perfil-card') ||
      document.querySelector('#sidebar a, #sidebar button'),
    { timeout: 10_000 },
  );

  if ((await page.locator('#loginForm').count()) > 0) {
    await page.fill('input[name="email"]', ADMIN_EMAIL);
    await page.fill('input[name="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
  }

  await page
    .locator('#btnAceitarTermos, #btnAceitar')
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(async () => {
      await page.locator('#btnAceitarTermos, #btnAceitar').click();
    })
    .catch(() => {});

  // Clicar no 1º card do picker seleciona um perfil RESTRITO (ex.: Coordenador, sem #/clientes)
  // → iniciarApp redireciona pro dashboard e os fluxos de UI travam. Em vez disso, injeta um
  // perfil sintético de ACESSO TOTAL: abas = a base de TODAS as rotas da SPA (+ variantes edit:),
  // e recarrega — o boot encontra o perfil, pula o picker, e o super-admin enxerga tudo.
  await page.waitForFunction(() => typeof window.routes !== 'undefined', { timeout: 10_000 }).catch(() => {});
  await page.evaluate(() => {
    try {
      localStorage.setItem('rhino-tour-v1', '1');
      const rotas = typeof window.routes !== 'undefined' ? Object.keys(window.routes) : [];
      const abas = new Set();
      rotas.forEach((r) => {
        const base = r.replace(/(#\/[^/]+).*/, '$1'); // '#/contratos/:id' → '#/contratos'
        abas.add(base);
        abas.add('edit:' + base);
      });
      sessionStorage.setItem('rhino-perfil', JSON.stringify({ id: '__e2e_full__', label: 'E2E (acesso total)', abas: [...abas] }));
    } catch {}
  });
  await page.goto(BASE_URL);
  await page.waitForSelector('#sidebar', { state: 'attached', timeout: 10_000 });
}

async function goto(page, path) {
  // A SPA é hash-based (#/clientes). Navegar via location.hash logo após o login dá race
  // (o boot pós-login perde/sobrescreve o hashchange → fica no dashboard). Navegar direto
  // pra URL com hash força a SPA a bootar JÁ na rota certa — confiável. A sessão (cookie)
  // persiste entre reloads, então não re-loga.
  await page.goto(BASE_URL + '/#' + path, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#app', { state: 'attached', timeout: 15_000 });
  // Garante que a rota foi processada (o conteúdo do #app trocou do boot-loader).
  await page.waitForFunction(() => {
    const app = document.querySelector('#app');
    return app && !app.querySelector('.boot-loader');
  }, { timeout: 15_000 }).catch(() => {});
}

async function submitModal(page, fields) {
  const modal = page.locator('#modalOverlay, .modal-overlay').first();
  await modal.waitFor({ state: 'visible', timeout: 5000 });
  for (const [labelRe, val] of Object.entries(fields)) {
    const re = new RegExp(labelRe, 'i');
    const input = modal.getByLabel(re).first();
    if ((await input.count()) === 0) continue;
    await input.fill(val);
  }
  const btnLegacy = modal.locator('#btnSalvar');
  if ((await btnLegacy.count()) > 0) {
    await btnLegacy.first().evaluate((el) => el.click());
  } else {
    await modal
      .getByRole('button', { name: /^(Criar|Salvar|Atualizar|Adicionar)$/i })
      .first()
      .click();
  }
  await modal.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
}

// =====================================================================

test.describe('Fluxo composto: Cliente → Contrato → BMs', () => {
  test.beforeEach(async ({ page }) => {
    await freshApp(page);
  });

  test('1. Cria cliente, contrato, saída e confere lista em /contratos', async ({ page }) => {
    // a) Cliente
    await goto(page, '/clientes');
    await page.getByRole('button', { name: /\+\s*Novo Cliente/i }).click();
    await submitModal(page, {
      Nome: 'Cliente Fluxo',
      Empresa: 'Empresa Fluxo Ltda',
    });
    await expect(page.locator('#app')).toContainText('Cliente Fluxo');

    // b) Contrato com esse cliente
    await goto(page, '/contratos');
    // .first(): em lista vazia há 2 botões "+ Novo Contrato" (header + CTA do empty-state); ambos abrem o mesmo modal.
    await page.getByRole('button', { name: /\+\s*Novo Contrato/i }).first().click();
    const modal = page.locator('.modal-overlay');
    await modal.waitFor({ state: 'visible' });
    const selCli = modal.getByLabel(/^Cliente/i);
    await selCli.selectOption({ label: /Cliente Fluxo/i }).catch(async () => {
      await selCli.selectOption({ index: 1 });
    });
    await modal.getByLabel(/Nome do Contrato/i).fill('Contrato Fluxo');
    await modal.getByLabel(/Valor Total/i).fill('80000');
    await modal.getByLabel(/Data Início/i).fill('2026-01-01');
    await modal.getByLabel(/Data Fim/i).fill('2026-12-31');
    await modal.getByRole('button', { name: /^(Criar|Salvar)$/ }).click();
    await modal.waitFor({ state: 'detached' }).catch(() => {});
    await expect(page.locator('#app')).toContainText('Contrato Fluxo');

    // c) Drill-in no contrato → tab Financeiro → adicionar saída
    await page.locator('#app').getByText('Contrato Fluxo', { exact: true }).first().click();
    await expect(page.locator('h1.page-title')).toHaveText('Contrato Fluxo', {
      timeout: 5000,
    });
    await page.getByRole('button', { name: 'Financeiro' }).click();
    await page.getByRole('button', { name: /\+\s*Adicionar Saída/i }).first().click();
    const modal2 = page.locator('.modal-overlay');
    await modal2.waitFor({ state: 'visible' });
    await modal2.getByLabel(/Descrição/i).fill('Compra material fluxo');
    await modal2
      .getByLabel(/^Tipo/i)
      .selectOption({ index: 1 })
      .catch(() => {});
    await modal2.getByLabel(/Valor/i).fill('5000');
    await modal2.getByLabel(/^Data/i).first().fill('2026-04-15');
    await modal2.getByRole('button', { name: /^(Criar|Salvar)$/ }).click();
    await modal2.waitFor({ state: 'detached' }).catch(() => {});
    await expect(page.locator('#app')).toContainText('Compra material fluxo');
  });
});

test.describe('Fluxo composto: Recrutamento (US-05 a US-09)', () => {
  test.beforeEach(async ({ page }) => {
    await freshApp(page);
  });

  test('2. Abre solicitação, adiciona candidato, faz triagem', async ({ page }) => {
    await goto(page, '/recrutamento');

    // a) Nova solicitação
    await page.getByRole('button', { name: /\+\s*Nova solicitação/i }).first().click();
    const modal = page.locator('.modal-overlay');
    await modal.waitFor({ state: 'visible' });
    // Não preenche contrato (opcional)
    // Preenche a 1ª linha de vagas
    const inputs = modal.locator('input[placeholder*="Pedreiro"]');
    await inputs.first().fill('Servente Fluxo');
    await modal.getByRole('button', { name: /^Criar solicitação$/ }).click();
    await modal.waitFor({ state: 'detached' }).catch(() => {});

    // b) Vê na lista
    await expect(page.locator('#app')).toContainText('Servente Fluxo');

    // c) Drill-in
    await page.locator('#app').getByText(/Servente Fluxo/i).first().click();
    const detail = page.locator('.modal-overlay').last();
    await detail.waitFor({ state: 'visible' });

    // d) Adiciona candidato
    await detail.getByRole('button', { name: /\+\s*Candidato/i }).click();
    const candModal = page.locator('.modal-overlay').last();
    await candModal.waitFor({ state: 'visible' });
    await candModal.getByLabel(/Nome \*/i).fill('Maria Candidata');
    await candModal.getByLabel(/Telefone/i).fill('(51) 99999-0000');
    await candModal.getByRole('button', { name: /^Adicionar$/ }).click();
    await candModal.waitFor({ state: 'detached' }).catch(() => {});

    await expect(detail).toContainText('Maria Candidata');
  });
});

test.describe('Fluxo composto: Recurso → Folga', () => {
  test.skip('3. Cria recurso e registra folga (TODO: modal de folga)', async () => {
    // Stub — requer mapeamento do modal de folga via Recursos > drill-in.
  });
});

test.describe('Fluxo composto: Solicitação de Compra completa', () => {
  test.skip('4. Cria → Avalia → Aprova → Recebe (TODO: workflow de aprovação)', async () => {
    // Stub — fluxo passa por 3 perfis (encarregado/compras/gerência),
    // exige stub de auth ou usuários de cada perfil.
  });
});
