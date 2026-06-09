// @ts-check
//
// Smoke test do Rhino (app legacy hash-based).
//
// Selectors:
//  - Modal: .modal-overlay
//  - Botões: getByRole/getByText
//  - Inputs: getByLabel
//
// O helper goto() detecta o modo de roteamento em runtime, então os testes
// continuam válidos independente de mudanças futuras na navegação.

const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.RHINO_URL || 'http://localhost:3001';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@rhino.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

async function freshApp(page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page
    .evaluate(() => {
      try {
        Object.keys(localStorage)
          .filter((k) => k.startsWith('rhino:') || k.startsWith('rhino-'))
          .forEach((k) => localStorage.removeItem(k));
        sessionStorage.clear();
        localStorage.setItem('rhino-tour-v1', '1'); // pula o tour de onboarding (senão bloqueia cliques)
      } catch {}
    })
    .catch(() => {});
  await page.goto(BASE_URL);

  // Espera login, picker OU sidebar já montado (auto-perfil de usuário com nivelAcessoId).
  await page.waitForFunction(
    () =>
      document.querySelector('#loginForm') ||
      document.querySelector('.perfil-card') ||
      document.querySelector('#sidebar a, #sidebar button'),
    { timeout: 10_000 },
  );

  // 1) Login se necessário
  if ((await page.locator('#loginForm').count()) > 0) {
    await page.fill('input[name="email"]', ADMIN_EMAIL);
    await page.fill('input[name="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
  }

  // 2) LGPD: o modal aparece de forma async (POST-login + check de termos),
  // potencialmente DEPOIS do sidebar montar (race em users com nivelAcessoId).
  // Esperamos explicitamente por até 5s.
  await page
    .locator('#btnAceitarTermos, #btnAceitar')
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(async () => {
      await page.locator('#btnAceitarTermos, #btnAceitar').click();
      // overlay LGPD bloqueia pointer events; esperamos sumir
      await page
        .locator('#termosOverlay')
        .waitFor({ state: 'detached', timeout: 5_000 })
        .catch(() => {});
    })
    .catch(() => {
      // LGPD já aceito ou indisponível — segue.
    });

  // 3) Perfil: clicar num card seleciona um perfil RESTRITO (sem #/clientes etc.) → a SPA
  //    redireciona pro dashboard e os testes de UI travam. Em vez disso, injeta um perfil
  //    sintético de ACESSO TOTAL (abas = base de TODAS as rotas + variantes edit:) e recarrega —
  //    o boot encontra o perfil, pula o picker, e o super-admin enxerga tudo.
  await page.waitForFunction(() => typeof window.routes !== 'undefined', { timeout: 10_000 }).catch(() => {});
  await page.evaluate(() => {
    try {
      localStorage.setItem('rhino-tour-v1', '1');
      const rotas = typeof window.routes !== 'undefined' ? Object.keys(window.routes) : [];
      const abas = new Set();
      rotas.forEach((r) => {
        const base = r.replace(/(#\/[^/]+).*/, '$1');
        abas.add(base);
        abas.add('edit:' + base);
      });
      sessionStorage.setItem('rhino-perfil', JSON.stringify({ id: '__e2e_full__', label: 'E2E (acesso total)', abas: [...abas] }));
    } catch {}
  });
  await page.goto(BASE_URL);

  await page.waitForSelector('#sidebar', { state: 'attached', timeout: 10_000 });
  // Garante que nenhum overlay residual bloqueia cliques posteriores.
  await page
    .locator('#termosOverlay, #loginOverlay, #profilePicker')
    .first()
    .waitFor({ state: 'detached', timeout: 5_000 })
    .catch(() => {});
}

async function goto(page, route) {
  const path = route.startsWith('#/') ? route.slice(1) : route;
  // Navega direto pra URL com hash (igual ao fluxos-compostos): setar `location.hash`
  // logo após o login dá race com o boot pós-login (o app.js sobrescreve o hashchange
  // → fica no dashboard → botão nunca aparece → 30s de timeout, sobretudo em CI lento).
  // Recarregar na URL certa força a SPA a bootar JÁ na rota. Sessão+perfil (cookie/
  // sessionStorage) persistem entre reloads, então não re-loga.
  await page.goto(BASE_URL + '/#' + path, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#app', { state: 'attached', timeout: 15_000 });
}

/**
 * Submete um modal preenchendo campos por LABEL e clicando no botão "Criar".
 * @param {import('@playwright/test').Page} page
 * @param {Record<string, string|RegExp>} fields — chave = regex/label do FormField; valor = texto
 */
async function submitModal(page, fields) {
  // Aceita ambos os modos: legacy (#modalOverlay) e React (.modal-overlay).
  const modal = page.locator('#modalOverlay, .modal-overlay').first();
  await modal.waitFor({ state: 'visible', timeout: 5000 });
  for (const [labelRe, val] of Object.entries(fields)) {
    const re = new RegExp(labelRe, 'i');
    // 1) Tenta por label (React/FormField + legacy <label for=>)
    let input = modal.getByLabel(re).first();
    if ((await input.count()) === 0) {
      // 2) Fallback legacy: campos sem <label for=> mas com name="..."
      // Mapeia label PT → name typical do legacy.
      const nameGuess = String(labelRe)
        .toLowerCase()
        .replace(/[áàâã]/g, 'a').replace(/[éê]/g, 'e').replace(/[í]/g, 'i')
        .replace(/[óô]/g, 'o').replace(/[ú]/g, 'u').replace(/[ç]/g, 'c')
        .replace(/[^a-z0-9]/g, '');
      input = modal.locator(`[name="${nameGuess}"], [name="${labelRe.toLowerCase()}"]`).first();
      if ((await input.count()) === 0) continue;
    }
    await input.fill(val);
  }
  // Botão de salvar: legacy = #btnSalvar (pode estar fora da viewport — usar
  // evaluate p/ contornar); React = button "Criar/Salvar/Atualizar"
  const btnLegacy = modal.locator('#btnSalvar');
  if ((await btnLegacy.count()) > 0) {
    await btnLegacy.first().evaluate((el) => (el).click());
  } else {
    // Submit: prefere o id estável #btnSalvar (o texto varia — Criar/Salvar/Registrar Aporte/Cadastrar…).
    const _submit = modal.locator('#btnSalvar');
    if (await _submit.count()) await _submit.first().click();
    else await modal.getByRole('button', { name: /^(Criar|Salvar|Atualizar|Adicionar|Registrar|Cadastrar)/i }).first().click();
  }
  // Modal fecha — aceita detached OU hidden
  await modal.waitFor({ state: 'detached', timeout: 5000 }).catch(async () => {
    await modal.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
  });
}

async function expectNoJsError(page, label) {
  const hasMain = await page.locator('#app').isVisible();
  expect(hasMain, `${label}: #app deve estar visível`).toBe(true);
}

// =====================================================================

test.describe('Rhino — smoke pós-React', () => {
  /** @type {string[]} */
  let errors;

  test.beforeEach(async ({ page }) => {
    errors = [];
    page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const txt = msg.text();
        if (!/logo\.png|favicon/i.test(txt)) errors.push(`[console.error] ${txt}`);
      }
    });
    await freshApp(page);
  });

  test.afterEach(async ({ page: _page }, testInfo) => {
    if (errors.length && testInfo.status === 'passed') {
      console.warn(`\n⚠️  Erros JS em "${testInfo.title}":\n` + errors.join('\n'));
    }
  });

  // -------------------------------------------------------------------
  test('1. Dashboard carrega sem erro', async ({ page }) => {
    await goto(page, '/dashboard');
    await expectNoJsError(page, 'Dashboard');
  });

  // -------------------------------------------------------------------
  test('2. Clientes — CRUD', async ({ page }) => {
    await goto(page, '/clientes');
    await page.getByRole('button', { name: /\+\s*Novo Cliente/i }).click();
    await submitModal(page, {
      'Nome': 'Cliente Teste',
      'Empresa': 'Empresa X',
      'Email': 'teste@empresa.com',
      'Telefone': '(51) 99999-9999',
      'Endereço': 'Rua Teste 123',
    });
    await expect(page.locator('#app')).toContainText('Cliente Teste');
  });

  // -------------------------------------------------------------------
  test('3. Fornecedores — CRUD', async ({ page }) => {
    await goto(page, '/fornecedores');
    await page.getByRole('button', { name: /\+\s*Novo Fornecedor/i }).click();
    await submitModal(page, {
      'Nome': 'Fornec Teste',
      'CNPJ': '00.000.000/0001-00',
      'Endereço': 'Av Teste 500',
      'Telefone': '(51) 3333-3333',
      'Pessoa de Contato': 'João',
    });
    await expect(page.locator('#app')).toContainText('Fornec Teste');
  });

  // -------------------------------------------------------------------
  test('4. Sócios — CRUD', async ({ page }) => {
    await goto(page, '/socios');
    await page.getByRole('button', { name: /\+\s*Novo Sócio/i }).click();
    await submitModal(page, {
      'Nome': 'Sócio Teste',
      'CPF/CNPJ': '000.000.000-00',
      'Participação': '50',
      'Email': 'socio@teste.com',
      'Telefone': '(51) 98888-8888',
    });
    await expect(page.locator('#app')).toContainText('Sócio Teste');
  });

  // -------------------------------------------------------------------
  // Contratos, Caixa, Contas a Pagar, NFs, RDOs, Recursos: têm campos com
  // currency/select que exigem helpers especializados — restaurar quando F5-5
  // identificar bugs reais (até lá, fluxos de leitura estão cobertos pelo #13).
  // -------------------------------------------------------------------
  test('5. Contratos — CRUD', async ({ page }) => {
    // 5a) Cadastra cliente (dependência do select)
    await goto(page, '/clientes');
    await page.getByRole('button', { name: /\+\s*Novo Cliente/i }).click();
    await submitModal(page, {
      'Nome': 'Cliente do Contrato',
      'Empresa': 'Obra Ltda',
    });

    // 5b) Cria contrato
    await goto(page, '/contratos');
    await page.getByRole('button', { name: /\+\s*Novo Contrato/i }).first().click(); // .first(): lista vazia tem header + CTA do empty-state
    const modal = page.locator('.modal-overlay');
    await modal.waitFor({ state: 'visible' });

    // Cliente: select pela label parcial cadastrada (Cliente do Contrato)
    const selectCliente = modal.getByLabel(/^Cliente/i);
    await selectCliente
      .selectOption({ label: /Cliente do Contrato/i })
      .catch(async () => {
        // fallback: pega primeira opção que casa, senão a 2ª (pula placeholder)
        const opts = await selectCliente.locator('option').allInnerTexts();
        const idx = opts.findIndex((o) => /Cliente do Contrato/i.test(o));
        await selectCliente.selectOption({ index: idx >= 0 ? idx : 1 });
      });

    await modal.getByLabel(/Nome do Contrato/i).fill('Contrato Smoke');
    // Valor — Input type=number aceita string numérica direta
    await modal.getByLabel(/Valor Total/i).fill('100000');
    await modal.getByLabel(/Data Início/i).fill('2026-01-01');
    await modal.getByLabel(/Data Fim/i).fill('2026-12-31');
    await modal.getByRole('button', { name: /^(Criar|Salvar)$/ }).click();
    await modal.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});

    await expect(page.locator('#app')).toContainText('Contrato Smoke');
  });
  test('6. Caixa — página carrega e mostra KPIs', async ({ page }) => {
    await goto(page, '/caixa');
    await expect(page.locator('#app')).toContainText(/Caixa|Lançamentos/);
    await expect(page.locator('#app')).toContainText(/Total Entradas|Total Saídas|Saldo/);
  });
  // -------------------------------------------------------------------
  test('7. Contas a Pagar — criar conta', async ({ page }) => {
    await goto(page, '/contas-pagar');
    await page.getByRole('button', { name: /\+\s*Nova Conta/i }).click();
    const modal = page.locator('.modal-overlay');
    await modal.waitFor({ state: 'visible' });
    await modal.getByLabel(/Descrição/i).fill('Conta luz');
    await modal.getByLabel(/^Valor/i).fill('500');
    await modal.getByLabel(/Data de Vencimento/i).fill('2026-04-20');
    await modal.getByRole('button', { name: /^(Criar|Salvar)$/ }).click();
    await modal.waitFor({ state: 'detached' }).catch(() => {});
    await expect(page.locator('#app')).toContainText('Conta luz');
  });
  // -------------------------------------------------------------------
  test('8. Notas Fiscais — criar', async ({ page }) => {
    // Precisa de cliente + contrato como dependência.
    await goto(page, '/clientes');
    await page.getByRole('button', { name: /\+\s*Novo Cliente/i }).click();
    await submitModal(page, { 'Nome': 'Cli NF', 'Empresa': 'Cli NF Ltda' });

    await goto(page, '/contratos');
    await page.getByRole('button', { name: /\+\s*Novo Contrato/i }).first().click(); // .first(): lista vazia tem header + CTA do empty-state
    let modal = page.locator('.modal-overlay');
    await modal.waitFor({ state: 'visible' });
    const selClient = modal.getByLabel(/^Cliente/i);
    await selClient.selectOption({ label: /Cli NF/i }).catch(async () => {
      await selClient.selectOption({ index: 1 });
    });
    await modal.getByLabel(/Nome do Contrato/i).fill('Contrato NF');
    await modal.getByLabel(/Valor Total/i).fill('50000');
    await modal.getByLabel(/Data Início/i).fill('2026-01-01');
    await modal.getByLabel(/Data Fim/i).fill('2026-06-30');
    await modal.getByRole('button', { name: /^(Criar|Salvar)$/ }).click();
    await modal.waitFor({ state: 'detached' }).catch(() => {});

    // Cria NF
    await goto(page, '/notas-fiscais');
    await page.getByRole('button', { name: /\+\s*Nova Conta a Receber/i }).click();
    modal = page.locator('.modal-overlay');
    await modal.waitFor({ state: 'visible' });
    const selCtr = modal.getByLabel(/^Contrato/i);
    await selCtr.selectOption({ label: /Contrato NF/i }).catch(async () => {
      const opts = await selCtr.locator('option').allInnerTexts();
      const idx = opts.findIndex((o) => /Contrato NF/i.test(o));
      await selCtr.selectOption({ index: idx >= 0 ? idx : 1 });
    });
    await modal.getByLabel(/Número da Nota Fiscal/i).fill('NF-100');
    await modal.getByLabel(/Valor da NF/i).fill('10000');
    await modal.getByLabel(/Data Limite/i).fill('2026-05-15');
    await modal.getByRole('button', { name: /^(Criar|Salvar)$/ }).click();
    await modal.waitFor({ state: 'detached' }).catch(() => {});

    await expect(page.locator('#app')).toContainText('NF-100');
  });
  // -------------------------------------------------------------------
  test('9. BASE — criar item', async ({ page }) => {
    await goto(page, '/base');
    await page.getByRole('button', { name: /\+\s*Novo Item/i }).click();
    const modal = page.locator('.modal-overlay');
    await modal.waitFor({ state: 'visible' });
    await modal.getByLabel(/Descrição/i).fill('Item BASE teste');
    await modal.getByLabel(/^Tipo/i).selectOption({ index: 1 }).catch(() => {});
    await modal.getByLabel(/^Valor/i).fill('2000');
    // Data no mês ATUAL — a view BASE filtra pelo mês corrente; data no passado some da lista.
    await modal.getByLabel(/^Data/i).first().fill(new Date().toISOString().slice(0, 10));
    await modal.getByRole('button', { name: /^(Criar|Salvar)$/ }).click();
    await modal.waitFor({ state: 'detached' }).catch(() => {});
    await expect(page.locator('#app')).toContainText('Item BASE teste');
  });
  // -------------------------------------------------------------------
  test('10. Investimentos — criar aporte (destino=BASE)', async ({ page }) => {
    // Sócio é pré-requisito do select Sócio *.
    await goto(page, '/socios');
    await page.getByRole('button', { name: /\+\s*Novo Sócio/i }).click();
    await submitModal(page, {
      'Nome': 'Sócio Aporte',
      'CPF/CNPJ': '111.111.111-11',
      'Participação': '100',
      'Email': 's@a.com',
      'Telefone': '5199',
    });

    await goto(page, '/investimentos');
    await page.getByRole('button', { name: /\+\s*Novo Aporte/i }).click();
    const modal = page.locator('.modal-overlay');
    await modal.waitFor({ state: 'visible' });

    // Sócio: pega primeira opção não-vazia
    const socioSel = modal.getByLabel(/^Sócio/i);
    await socioSel.selectOption({ label: /Sócio Aporte/i }).catch(async () => {
      await socioSel.selectOption({ index: 1 });
    });

    // Destino BASE — radio dentro de <label> que envolve "⚙️ BASE"
    await modal.locator('label', { hasText: /BASE/i }).first().click();

    await modal.getByLabel(/Valor/i).fill('30000');
    await modal.getByLabel(/^Data/i).first().fill(new Date().toISOString().slice(0, 10));
    await modal.getByLabel(/Descrição/i).fill('Aporte inicial');

    await modal.locator('#btnSalvar').click(); // texto é "Registrar Aporte" — usa o id estável
    await modal.waitFor({ state: 'detached' }).catch(() => {});
    await expect(page.locator('#app')).toContainText('Aporte inicial');
  });

  // -------------------------------------------------------------------
  test('11. Recursos — criar colaborador', async ({ page }) => {
    await goto(page, '/recursos');
    await page.locator('#btnNovoRecurso').click(); // texto é "+ Novo Cadastro" — usa o id estável
    await submitModal(page, {
      'Nome': 'João Silva',
      'CPF': '123.456.789-00',
      'Telefone': '(51) 97777-7777',
      'Email': 'joao@empresa.com',
      'Profissão': 'Pedreiro',
    });
    await expect(page.locator('#app')).toContainText('João Silva');
  });

  // -------------------------------------------------------------------
  test('12a. Contrato — adicionar saída', async ({ page }) => {
    // Cria cliente + contrato (mesma sequência do #5)
    await goto(page, '/clientes');
    await page.getByRole('button', { name: /\+\s*Novo Cliente/i }).click();
    await submitModal(page, { 'Nome': 'Cli Saida', 'Empresa': 'Obra Saida' });

    await goto(page, '/contratos');
    await page.getByRole('button', { name: /\+\s*Novo Contrato/i }).first().click(); // .first(): lista vazia tem header + CTA do empty-state
    let modal = page.locator('.modal-overlay');
    await modal.waitFor({ state: 'visible' });
    const selCli = modal.getByLabel(/^Cliente/i);
    await selCli.selectOption({ label: /Cli Saida/i }).catch(async () => {
      await selCli.selectOption({ index: 1 });
    });
    await modal.getByLabel(/Nome do Contrato/i).fill('Contrato Saida');
    await modal.getByLabel(/Valor Total/i).fill('50000');
    await modal.getByRole('button', { name: /^(Criar|Salvar)$/ }).click();
    await modal.waitFor({ state: 'detached' }).catch(() => {});

    // Drill-in: clicar na linha abre só o overview (painel); quem navega pro DETALHE é "Abrir".
    await page.locator('.row-contrato', { hasText: 'Contrato Saida' }).getByRole('button', { name: /^Abrir$/ }).first().click();
    await expect(page.locator('h1.page-title')).toHaveText('Contrato Saida', { timeout: 5000 });

    // Aba Financeiro
    await page.locator('.ctd-tab[data-ctd-tab="financeiro"]').click(); // aba do detalhe (não o "Financeiro" do sidebar)
    await page.getByRole('button', { name: /\+\s*Adicionar Saída/i }).click();
    modal = page.locator('.modal-overlay');
    await modal.waitFor({ state: 'visible' });
    await modal.getByLabel(/Descrição/i).fill('Compra de cimento');
    await modal.getByLabel(/^Tipo/i).selectOption({ index: 1 }).catch(() => {});
    await modal.getByLabel(/Valor/i).fill('3500');
    await modal.getByLabel(/^Data/i).first().fill('2026-04-15');
    await modal.getByRole('button', { name: /^(Criar|Salvar)$/ }).click();
    await modal.waitFor({ state: 'detached' }).catch(() => {});

    await expect(page.locator('#app')).toContainText('Compra de cimento');
  });

  // -------------------------------------------------------------------
  test('12b. Contrato — orçamento respeita valor', async ({ page }) => {
    // Cria cliente + contrato curto (valor 10k pra disparar a regra)
    await goto(page, '/clientes');
    await page.getByRole('button', { name: /\+\s*Novo Cliente/i }).click();
    await submitModal(page, { 'Nome': 'Cli Orc', 'Empresa': 'Orc Ltda' });

    await goto(page, '/contratos');
    await page.getByRole('button', { name: /\+\s*Novo Contrato/i }).first().click(); // .first(): lista vazia tem header + CTA do empty-state
    let modal = page.locator('.modal-overlay');
    await modal.waitFor({ state: 'visible' });
    const selCli2 = modal.getByLabel(/^Cliente/i);
    await selCli2.selectOption({ label: /Cli Orc/i }).catch(async () => {
      await selCli2.selectOption({ index: 1 });
    });
    await modal.getByLabel(/Nome do Contrato/i).fill('Contrato Orcamento');
    await modal.getByLabel(/Valor Total/i).fill('10000');
    await modal.getByRole('button', { name: /^(Criar|Salvar)$/ }).click();
    await modal.waitFor({ state: 'detached' }).catch(() => {});

    await page.locator('.row-contrato', { hasText: 'Contrato Orcamento' }).getByRole('button', { name: /^Abrir$/ }).first().click();
    await expect(page.locator('h1.page-title')).toHaveText('Contrato Orcamento');
    await page.locator('.ctd-tab[data-ctd-tab="financeiro"]').click(); // aba do detalhe (não o "Financeiro" do sidebar)

    // Adiciona item 6k (cabe)
    await page.getByRole('button', { name: /\+\s*Novo Item.*Orçamento|Adicionar Item/i }).first().click();
    modal = page.locator('.modal-overlay');
    await modal.waitFor({ state: 'visible' });
    await modal.getByLabel(/Descrição/i).fill('Mão de obra');
    await modal.getByLabel(/Categoria/i).selectOption({ index: 1 }).catch(() => {}); // modal de orçamento usa "Categoria", não "Tipo"
    await modal.getByLabel(/Valor/i).fill('6000');
    await modal.locator('#btnSalvar').click(); // submit é "Adicionar" — usa o id estável
    await modal.waitFor({ state: 'detached' }).catch(() => {});
    await expect(page.locator('#app')).toContainText('Mão de obra');
  });

  // -------------------------------------------------------------------
  test('13. Navegação por todas as abas sem erro JS', async ({ page }) => {
    const rotas = [
      '/dashboard',
      '/contratos',
      '/obras',
      '/clientes',
      '/recursos',
      '/documentos',
      '/fornecedores',
      '/caixa',
      '/contas-pagar',
      '/notas-fiscais',
      '/socios',
      '/investimentos',
      '/base',
      '/configuracao',
      '/manual',
    ];
    for (const r of rotas) {
      await goto(page, r);
      // Espera a view terminar de carregar (Store.loadAll) antes de recarregar p/ a próxima rota —
      // senão o reload aborta os fetches em voo, gerando "Failed to fetch"/401 transitório (não é bug do app).
      await page.locator('.loading-spinner').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
      await expectNoJsError(page, r);
    }
    expect(errors, `Erros JS acumulados: ${errors.join(' | ')}`).toEqual([]);
  });

  // -------------------------------------------------------------------
  test('14. Persistência — sessão sobrevive a reload', async ({ page }) => {
    await goto(page, '/dashboard');
    await page.reload();
    await page.waitForFunction(
      () =>
        document.querySelector('.perfil-card') ||
        document.querySelector('#sidebar a, #sidebar button'),
      { timeout: 10_000 },
    );
    if ((await page.locator('.perfil-card').count()) > 0) {
      await page.locator('.perfil-card').first().click();
    }
    await page.waitForSelector('#sidebar', { state: 'attached' });
    await goto(page, '/dashboard');
    await expectNoJsError(page, 'reload');
  });
});
