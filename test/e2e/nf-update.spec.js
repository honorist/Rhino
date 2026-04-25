// @ts-check
const { test, expect } = require('@playwright/test');
const BASE_URL = process.env.RHINO_URL || 'http://localhost:5000';

test('NF: editar prazo de recebimento persiste e aparece na tela', async ({ page }) => {
  await page.goto(BASE_URL);
  await page.evaluate(() => {
    Object.keys(localStorage).filter(k => k.startsWith('rhino:') || k.startsWith('rhino-')).forEach(k => localStorage.removeItem(k));
    sessionStorage.clear();
  });
  await page.goto(BASE_URL);
  await page.waitForSelector('.perfil-card', { timeout: 10000 });
  await page.locator('.perfil-card').first().click();
  await page.waitForTimeout(300);

  await page.evaluate(() => location.hash = '#/clientes');
  await page.waitForTimeout(300);
  await page.click('#btnNovoCliente');
  await page.locator('#modalOverlay [name="nome"]').fill('Cli NF');
  await page.locator('#modalOverlay [name="empresa"]').fill('Emp NF');
  await page.locator('#modalOverlay #btnSalvar').evaluate(el => el.click());
  await page.waitForTimeout(300);

  await page.evaluate(() => location.hash = '#/contratos');
  await page.waitForTimeout(300);
  await page.click('#btnNovoContrato');
  const sel = page.locator('#modalOverlay [name="clientId"]');
  const opts = await sel.locator('option').allInnerTexts();
  await sel.selectOption({ index: opts.findIndex(o => /Cli NF/i.test(o)) });
  await page.locator('#modalOverlay [name="name"]').fill('Contrato NF Test');
  await page.locator('#modalOverlay [name="value"]').evaluate(el => { el.value = '10.000,00'; });
  await page.locator('#modalOverlay #btnSalvar').evaluate(el => el.click());
  await page.waitForTimeout(500);

  const cId = await page.evaluate(() => JSON.parse(localStorage.getItem('rhino:contracts.json')).contracts[0].id);
  await page.evaluate(id => location.hash = `#/contratos/${id}`, cId);
  await page.waitForTimeout(500);
  await page.locator('[data-ctd-tab="financeiro"]').click();
  await page.waitForTimeout(300);

  await page.click('#btnNovaSaida');
  await page.locator('#modalOverlay [name="description"]').fill('Servico X');
  await page.locator('#modalOverlay [name="type"]').selectOption('material').catch(() => {});
  await page.locator('#modalOverlay [name="value"]').evaluate(el => { el.value = '3.000,00'; });
  await page.locator('#modalOverlay [name="date"]').fill('2026-04-10');
  await page.locator('#modalOverlay #btnSalvar').evaluate(el => el.click());
  await page.waitForTimeout(500);

  await page.evaluate(() => location.hash = '#/notas-fiscais');
  await page.waitForTimeout(500);
  await expect(page.locator('#app')).toContainText('30d após emissão');

  await page.locator('.btn-editar-nf').first().click();
  await page.waitForSelector('#modalOverlay', { state: 'visible' });
  await expect(page.locator('#modalOverlay [name="prazoRecebimento"]')).toHaveValue('30');
  await page.locator('#modalOverlay [name="prazoRecebimento"]').fill('45');
  await page.locator('#modalOverlay #btnSalvar').evaluate(el => el.click());
  await page.waitForTimeout(1000);

  const prazoPersistido = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('rhino:notas_fiscais.json')).notas_fiscais[0].prazoRecebimento
  );
  expect(prazoPersistido).toBe(45);
  await expect(page.locator('#app')).toContainText('45d após emissão');
});
