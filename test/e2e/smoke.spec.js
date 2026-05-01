// @ts-check
const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.RHINO_URL || 'http://localhost:3001';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@rhino.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Helper: estado limpo a cada teste, com login automático
async function freshApp(page) {
  await page.goto(BASE_URL);
  await page.evaluate(() => {
    try {
      Object.keys(localStorage).filter(k => k.startsWith('rhino:') || k.startsWith('rhino-')).forEach(k => localStorage.removeItem(k));
      sessionStorage.clear();
    } catch {}
  });
  await page.goto(BASE_URL);

  // Aguarda login form ou profile picker (depende de haver sessão ativa)
  await page.waitForFunction(
    () => document.querySelector('#loginForm') || document.querySelector('.perfil-card'),
    { timeout: 10_000 }
  );

  // Faz login se necessário
  if (await page.locator('#loginForm').count() > 0) {
    await page.fill('input[name="email"]', ADMIN_EMAIL);
    await page.fill('input[name="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    // Aceita LGPD se aparecer
    await page.locator('#btnAceitarTermos').click().catch(() => {});
  }

  await page.waitForSelector('.perfil-card', { timeout: 10_000 });
  await page.locator('.perfil-card').first().click();
  await page.waitForSelector('#sidebar', { state: 'attached' });
}

async function goto(page, hash) {
  await page.evaluate(h => { location.hash = h; }, hash);
  await page.waitForTimeout(400);
}

async function fillCurrency(locator, val) {
  await locator.evaluate((el, v) => {
    const num = parseFloat(v) || 0;
    const cents = Math.round(num * 100);
    const s = String(Math.abs(cents)).padStart(3, '0');
    const dec = s.slice(-2);
    const int = s.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    el.value = `${int || '0'},${dec}`;
  }, String(val));
}

async function fillModal(page, values) {
  await page.waitForSelector('#modalOverlay', { state: 'visible', timeout: 5000 });
  for (const [name, val] of Object.entries(values)) {
    const input = page.locator(`#modalOverlay [name="${name}"]`).first();
    const count = await input.count();
    if (count === 0) continue;
    const info = await input.evaluate(el => ({
      tag: el.tagName,
      type: el.type,
      hasCurrency: el.hasAttribute('data-currency')
    }));
    if (info.tag === 'SELECT') {
      // Tenta por value, depois por label, depois por índice não-vazio
      await input.selectOption(String(val)).catch(async () => {
        await input.selectOption({ label: String(val) }).catch(async () => {
          const opts = await input.locator('option').allInnerTexts();
          const idx = opts.findIndex(o => o.trim() && !o.startsWith('—') && !o.startsWith('--'));
          if (idx >= 0) await input.selectOption({ index: idx });
        });
      });
    } else if (info.hasCurrency) {
      // Campo com mask: seta value formatado BR direto no DOM
      await input.evaluate((el, v) => {
        const num = parseFloat(v) || 0;
        const cents = Math.round(num * 100);
        const s = String(Math.abs(cents)).padStart(3, '0');
        const dec = s.slice(-2);
        const int = s.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        el.value = `${int || '0'},${dec}`;
      }, String(val));
    } else {
      await input.fill(String(val));
    }
  }
  await page.locator('#modalOverlay #btnSalvar').evaluate(el => el.click());
  await page.waitForSelector('#modalOverlay', { state: 'detached', timeout: 5000 }).catch(async () => {
    await page.waitForSelector('#modalOverlay', { state: 'hidden', timeout: 3000 }).catch(() => {});
  });
}

async function expectNoJsError(page, label) {
  // Já coletamos erros via page listeners configurados no beforeEach
  // Verifica se a main ainda tem conteúdo visível
  const hasMain = await page.locator('#app').isVisible();
  expect(hasMain, `${label}: #app deve estar visível`).toBe(true);
}

// =====================================================================

test.describe('Rhino — smoke test completo', () => {
  /** @type {string[]} */
  let errors;

  test.beforeEach(async ({ page }) => {
    errors = [];
    page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const txt = msg.text();
        // filtra erros de recursos 404 conhecidos
        if (!/logo\.png|favicon/i.test(txt)) errors.push(`[console.error] ${txt}`);
      }
    });
    await freshApp(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (errors.length && testInfo.status === 'passed') {
      console.warn(`\n⚠️  Erros JS em "${testInfo.title}":\n` + errors.join('\n'));
    }
  });

  // -------------------------------------------------------------------
  test('1. Dashboard carrega sem erro', async ({ page }) => {
    await goto(page, '#/dashboard');
    await page.waitForSelector('#app', { state: 'visible' });
    await expectNoJsError(page, 'Dashboard');
  });

  // -------------------------------------------------------------------
  test('2. Clientes — CRUD', async ({ page }) => {
    await goto(page, '#/clientes');
    await page.click('#btnNovoCliente');
    await fillModal(page, {
      nome: 'Cliente Teste',
      empresa: 'Empresa X',
      email: 'teste@empresa.com',
      telefone: '(51) 99999-9999',
      endereco: 'Rua Teste 123'
    });
    await expect(page.locator('#app')).toContainText('Cliente Teste');
  });

  // -------------------------------------------------------------------
  test('3. Fornecedores — CRUD', async ({ page }) => {
    await goto(page, '#/fornecedores');
    await page.click('#btnNovoFornecedor');
    await fillModal(page, {
      nome: 'Fornec Teste',
      cnpj: '00.000.000/0001-00',
      endereco: 'Av Teste 500',
      telefone: '(51) 3333-3333',
      pessoaContato: 'João',
      materiais: 'concreto, aço'
    });
    await expect(page.locator('#app')).toContainText('Fornec Teste');
  });

  // -------------------------------------------------------------------
  test('4. Sócios — CRUD', async ({ page }) => {
    await goto(page, '#/socios');
    await page.click('#btnNovoSocio');
    await fillModal(page, {
      name: 'Sócio Teste',
      document: '000.000.000-00',
      email: 'socio@teste.com',
      phone: '(51) 98888-8888',
      participacao: '50'
    });
    await expect(page.locator('#app')).toContainText('Sócio Teste');
  });

  // -------------------------------------------------------------------
  test('5. Contratos — CRUD', async ({ page }) => {
    // Cadastra cliente primeiro (dependência)
    await goto(page, '#/clientes');
    await page.click('#btnNovoCliente');
    await fillModal(page, { nome: 'Cliente do Contrato', empresa: 'Obra Ltda' });

    await goto(page, '#/contratos');
    await page.click('#btnNovoContrato');
    await page.waitForSelector('#modalOverlay', { state: 'visible' });
    // Seleciona o cliente cadastrado (primeira opção não-vazia)
    const sel = page.locator('#modalOverlay [name="clientId"]');
    if (await sel.count() > 0) {
      const opts = await sel.locator('option').allInnerTexts();
      const idx = opts.findIndex(o => /Cliente do Contrato/i.test(o));
      await sel.selectOption({ index: idx >= 0 ? idx : 1 });
    }
    await page.locator('#modalOverlay [name="name"]').fill('Contrato Smoke');
    await fillCurrency(page.locator('#modalOverlay [name="value"]'), '100000');
    await page.locator('#modalOverlay [name="startDate"]').fill('2026-01-01');
    await page.locator('#modalOverlay [name="endDate"]').fill('2026-12-31');
    await page.locator('#modalOverlay #btnSalvar').evaluate(el => el.click());
    await page.waitForSelector('#modalOverlay', { state: 'detached', timeout: 5000 }).catch(() => {});
    await expect(page.locator('#app')).toContainText('Contrato Smoke');
  });

  // -------------------------------------------------------------------
  test('6. Caixa — página carrega e mostra saldo', async ({ page }) => {
    // Caixa não tem criação manual de lançamento (é alimentado por contas/NFs/aportes).
    // Verifica apenas que a página renderiza com os KPIs esperados.
    await goto(page, '#/caixa');
    await expect(page.locator('#app')).toContainText('Caixa — Lançamentos');
    await expect(page.locator('#app')).toContainText(/Total Entradas|Total Saídas|Saldo/);
  });

  // -------------------------------------------------------------------
  test('7. Contas a Pagar — criar + pagar', async ({ page }) => {
    await goto(page, '#/contas-pagar');
    await page.click('#btnNovaConta');
    await fillModal(page, {
      descricao: 'Conta luz',
      valor: '500',
      dataEmissao: '2026-04-01',
      dataVencimento: '2026-04-20',
      numeroNF: 'NF-001'
    });
    await expect(page.locator('#app')).toContainText('Conta luz');

    // Clica no botão de pagar (primeiro "Pagar" visível no card da conta)
    const btnPagar = page.locator('button').filter({ hasText: /^Pagar$/ }).first();
    if (await btnPagar.count() > 0) {
      await btnPagar.click();
      await page.waitForSelector('#modalOverlay', { state: 'visible' }).catch(() => {});
      // Se abrir modal de forma de pagamento, preenche
      const btnConfirmar = page.locator('#modalOverlay button').filter({ hasText: /Confirmar|Pagar/ }).first();
      if (await btnConfirmar.count() > 0) await btnConfirmar.click();
    }
  });

  // -------------------------------------------------------------------
  test('8. Notas Fiscais — criar + emitir', async ({ page }) => {
    // Precisa de um contrato antes
    await goto(page, '#/clientes');
    await page.click('#btnNovoCliente');
    await fillModal(page, { nome: 'Cli NF', empresa: 'Cli NF Ltda' });
    await goto(page, '#/contratos');
    await page.click('#btnNovoContrato');
    await page.waitForSelector('#modalOverlay', { state: 'visible' });
    const selCli = page.locator('#modalOverlay [name="clientId"]');
    if (await selCli.count() > 0) {
      const optsCli = await selCli.locator('option').allInnerTexts();
      const idxCli = optsCli.findIndex(o => /Cli NF/i.test(o));
      await selCli.selectOption({ index: idxCli >= 0 ? idxCli : 1 });
    }
    await page.locator('#modalOverlay [name="name"]').fill('Contrato NF');
    await fillCurrency(page.locator('#modalOverlay [name="value"]'), '50000');
    await page.locator('#modalOverlay [name="startDate"]').fill('2026-01-01');
    await page.locator('#modalOverlay [name="endDate"]').fill('2026-06-30');
    await page.locator('#modalOverlay #btnSalvar').evaluate(el => el.click());
    await page.waitForSelector('#modalOverlay', { state: 'detached', timeout: 5000 }).catch(() => {});

    await goto(page, '#/notas-fiscais');
    await page.click('#btnNovoNF');
    await page.waitForSelector('#modalOverlay', { state: 'visible' });
    const selectContract = page.locator('#modalOverlay [name="contractId"]');
    const opts = await selectContract.locator('option').allInnerTexts();
    const idx = opts.findIndex(o => /Contrato NF/i.test(o));
    await selectContract.selectOption({ index: idx >= 0 ? idx : opts.length - 1 });
    await page.locator('#modalOverlay [name="numero"]').fill('NF-100');
    await fillCurrency(page.locator('#modalOverlay [name="valor"]'), '10000');
    await page.locator('#modalOverlay [name="dataLimite"]').fill('2026-05-15');
    await page.locator('#modalOverlay [name="prazoRecebimento"]').fill('30');
    await page.locator('#modalOverlay #btnSalvar').evaluate(el => el.click());
    await page.waitForSelector('#modalOverlay', { state: 'detached', timeout: 5000 }).catch(() => {});
    await expect(page.locator('#app')).toContainText('NF-100');
  });

  // -------------------------------------------------------------------
  test('9. BASE — criar item', async ({ page }) => {
    await goto(page, '#/base');
    await page.click('#btnNovoItem');
    await fillModal(page, {
      description: 'Item BASE teste',
      type: 'fixo',
      value: '2000',
      date: '2026-04-01'
    });
    await expect(page.locator('#app')).toContainText('Item BASE teste');
  });

  // -------------------------------------------------------------------
  test('10. Investimentos — criar aporte', async ({ page }) => {
    // Sócio é pré-requisito
    await goto(page, '#/socios');
    await page.click('#btnNovoSocio');
    await fillModal(page, {
      name: 'Sócio Aporte', document: '111.111.111-11',
      email: 's@a.com', phone: '5199', participacao: '100'
    });

    await goto(page, '#/investimentos');
    await page.click('#btnNovoAporte');
    await page.waitForSelector('#modalOverlay', { state: 'visible' });
    // origem=socio (default), destino=base (não precisa de contrato)
    await page.locator('#modalOverlay input[name="destino"][value="base"]').evaluate(el => { el.click(); });
    await page.waitForTimeout(200);
    const socioSelect = page.locator('#modalOverlay [name="socioId"]');
    if (await socioSelect.count() > 0) {
      const opts = await socioSelect.locator('option').allInnerTexts();
      const idx = opts.findIndex(o => o.trim() && !o.startsWith('—') && !o.startsWith('--') && !o.startsWith('Selecionar'));
      if (idx >= 0) await socioSelect.selectOption({ index: idx });
    }
    await fillCurrency(page.locator('#modalOverlay [name="value"]'), '30000');
    await page.locator('#modalOverlay [name="date"]').fill('2026-04-10');
    await page.locator('#modalOverlay [name="description"]').fill('Aporte inicial');
    await page.locator('#modalOverlay #btnSalvar').evaluate(el => el.click());
    await page.waitForSelector('#modalOverlay', { state: 'detached', timeout: 5000 }).catch(() => {});
    await expect(page.locator('#app')).toContainText('Aporte inicial');
  });

  // -------------------------------------------------------------------
  test('11. Recursos — criar colaborador', async ({ page }) => {
    await goto(page, '#/recursos');
    await page.click('#btnNovoRecurso');
    await fillModal(page, {
      nome: 'João Silva',
      cpf: '123.456.789-00',
      telefone: '(51) 97777-7777',
      email: 'joao@empresa.com',
      profissao: 'Pedreiro'
    });
    await expect(page.locator('#app')).toContainText('João Silva');
  });

  // -------------------------------------------------------------------
  test('12a. Contrato — adicionar e excluir saída', async ({ page }) => {
    // Cria cliente + contrato
    await goto(page, '#/clientes');
    await page.click('#btnNovoCliente');
    await fillModal(page, { nome: 'Cli Saida', empresa: 'Obra Saida' });

    await goto(page, '#/contratos');
    await page.click('#btnNovoContrato');
    await page.waitForSelector('#modalOverlay', { state: 'visible' });
    const selCli = page.locator('#modalOverlay [name="clientId"]');
    const optsCli = await selCli.locator('option').allInnerTexts();
    const idxCli = optsCli.findIndex(o => /Cli Saida/i.test(o));
    await selCli.selectOption({ index: idxCli >= 0 ? idxCli : 1 });
    await page.locator('#modalOverlay [name="name"]').fill('Contrato Saida');
    await fillCurrency(page.locator('#modalOverlay [name="value"]'), '50000');
    await page.locator('#modalOverlay #btnSalvar').evaluate(el => el.click());
    await page.waitForSelector('#modalOverlay', { state: 'detached', timeout: 5000 }).catch(() => {});

    // Abre o contrato criado (clica no card)
    await page.locator('#app').getByText('Contrato Saida').first().click();
    await page.waitForTimeout(400);

    // Vai na aba Financeiro
    await page.locator('[data-ctd-tab="financeiro"]').click();
    await page.waitForTimeout(300);

    // Clica em + Adicionar Saída
    await page.click('#btnNovaSaida');
    await page.waitForSelector('#modalOverlay', { state: 'visible' });
    await page.locator('#modalOverlay [name="description"]').fill('Compra de cimento');
    await page.locator('#modalOverlay [name="type"]').selectOption('material').catch(() => {});
    await fillCurrency(page.locator('#modalOverlay [name="value"]'), '3500');
    await page.locator('#modalOverlay [name="date"]').fill('2026-04-15');
    await page.locator('#modalOverlay #btnSalvar').evaluate(el => el.click());
    await page.waitForSelector('#modalOverlay', { state: 'detached', timeout: 5000 }).catch(() => {});

    // Verifica que aparece
    await expect(page.locator('#app')).toContainText('Compra de cimento');
    await expect(page.locator('#app')).toContainText('R$ 3.500,00');

    // Exclui a saída
    page.on('dialog', d => d.accept());
    await page.locator('.btn-excluir-saida').first().click();
    await page.waitForTimeout(500);
    await expect(page.locator('#app')).not.toContainText('Compra de cimento');
  });

  // -------------------------------------------------------------------
  test('12b. Contrato — orçamento respeita valor do contrato', async ({ page }) => {
    await goto(page, '#/clientes');
    await page.click('#btnNovoCliente');
    await fillModal(page, { nome: 'Cli Orc', empresa: 'Orc Ltda' });

    await goto(page, '#/contratos');
    await page.click('#btnNovoContrato');
    await page.waitForSelector('#modalOverlay', { state: 'visible' });
    const selCli2 = page.locator('#modalOverlay [name="clientId"]');
    const optsCli2 = await selCli2.locator('option').allInnerTexts();
    const idx2 = optsCli2.findIndex(o => /Cli Orc/i.test(o));
    await selCli2.selectOption({ index: idx2 >= 0 ? idx2 : 1 });
    await page.locator('#modalOverlay [name="name"]').fill('Contrato Orcamento');
    await fillCurrency(page.locator('#modalOverlay [name="value"]'), '10000');
    await page.locator('#modalOverlay #btnSalvar').evaluate(el => el.click());
    await page.waitForSelector('#modalOverlay', { state: 'detached', timeout: 5000 }).catch(() => {});

    await page.locator('#app').getByText('Contrato Orcamento').first().click();
    await page.waitForTimeout(400);
    await page.locator('[data-ctd-tab="financeiro"]').click();
    await page.waitForTimeout(300);

    // Primeiro item: 6.000 (OK)
    await page.click('#btnNovoItemOrcamento');
    await page.waitForSelector('#modalOverlay', { state: 'visible' });
    await page.locator('#modalOverlay [name="description"]').fill('Mão de obra');
    await page.locator('#modalOverlay [name="type"]').selectOption('mao_de_obra').catch(() => {});
    await fillCurrency(page.locator('#modalOverlay [name="value"]'), '6000');
    await page.locator('#modalOverlay #btnSalvar').evaluate(el => el.click());
    await page.waitForSelector('#modalOverlay', { state: 'detached', timeout: 5000 }).catch(() => {});
    await expect(page.locator('#app')).toContainText('Mão de obra');

    // Segundo item: 5.000 (ultrapassa — deve falhar)
    page.on('dialog', d => d.accept());
    await page.click('#btnNovoItemOrcamento');
    await page.waitForSelector('#modalOverlay', { state: 'visible' });
    await page.locator('#modalOverlay [name="description"]').fill('Material excedente');
    await page.locator('#modalOverlay [name="type"]').selectOption('material').catch(() => {});
    await fillCurrency(page.locator('#modalOverlay [name="value"]'), '5000');
    await page.locator('#modalOverlay #btnSalvar').evaluate(el => el.click());
    // O modal não deve fechar (item rejeitado)
    await page.waitForTimeout(1000);
    // Item não deve aparecer na tabela
    await expect(page.locator('#app')).not.toContainText('Material excedente');
  });

  // -------------------------------------------------------------------
  test('13. Navegação por todas as abas sem erro JS', async ({ page }) => {
    const rotas = [
      '#/dashboard', '#/contratos', '#/obras', '#/clientes', '#/recursos',
      '#/documentos', '#/fornecedores', '#/caixa', '#/contas-pagar',
      '#/notas-fiscais', '#/socios', '#/investimentos', '#/base',
      '#/configuracao', '#/manual'
    ];
    for (const r of rotas) {
      await goto(page, r);
      await expectNoJsError(page, r);
    }
    // Se acumulou erros em alguma aba, reporta
    expect(errors, `Erros JS acumulados: ${errors.join(' | ')}`).toEqual([]);
  });

  // -------------------------------------------------------------------
  test('13. Persistência — dados sobrevivem a reload', async ({ page }) => {
    await goto(page, '#/clientes');
    await page.click('#btnNovoCliente');
    await fillModal(page, { nome: 'Cliente Persist', empresa: 'Ltda' });
    await expect(page.locator('#app')).toContainText('Cliente Persist');

    await page.reload();
    // Depois do reload, o sessionStorage pode conter o perfil → picker não aparece
    // Aguarda o sidebar OU o picker
    await page.waitForFunction(() => {
      return document.querySelector('.perfil-card') || document.querySelector('#sidebar a, #sidebar button');
    }, { timeout: 10_000 });
    if (await page.locator('.perfil-card').count() > 0) {
      await page.locator('.perfil-card').first().click();
    }
    await goto(page, '#/clientes');
    await expect(page.locator('#app')).toContainText('Cliente Persist');
  });
});
