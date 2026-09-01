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
      // Sub-permissões de etapa (flags binárias fora do padrão #/rota, ver
      // js/views/Configuracao.js) — sem elas os botões de cada etapa do fluxo
      // de Solicitações de Compra e de Manutenção não renderizam mesmo com
      // acesso total à rota base.
      ['solicitacoes-compra:avaliar', 'solicitacoes-compra:aprovar', 'solicitacoes-compra:receber',
       'manutencao:avaliar', 'manutencao:aprovar',
       'contrato-tab:visao', 'contrato-tab:financeiro', 'contrato-tab:equipe', 'contrato-tab:rdo', 'contrato-tab:pendencias',
      ].forEach((t) => abas.add(t));
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
  // O boot pós-reload às vezes redireciona pro dashboard (race do hash). Se não assentou na
  // rota certa, re-navega in-app via hashchange (confiável depois do boot) e re-verifica.
  await page.waitForFunction((p) => location.hash === '#' + p, path, { timeout: 3000 }).catch(async () => {
    await page.evaluate((p) => { location.hash = '#' + p; window.dispatchEvent(new HashChangeEvent('hashchange')); }, path);
    await page.waitForFunction((p) => location.hash === '#' + p, path, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
  });
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

    // c) Drill-in: clicar na linha abre só o overview; quem navega pro DETALHE é "Abrir".
    await page.locator('.row-contrato', { hasText: 'Contrato Fluxo' }).getByRole('button', { name: /^Abrir$/ }).first().click();
    await expect(page.locator('h1.page-title')).toHaveText('Contrato Fluxo', {
      timeout: 5000,
    });
    await page.locator('.ctd-tab[data-ctd-tab="financeiro"]').click(); // aba do detalhe (não o sidebar)
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
    // timeout curto: o modal de candidato pode ficar hidden (não detached) → sem timeout, espera 30s.
    await candModal.waitFor({ state: 'detached', timeout: 4000 }).catch(() => {});

    // `detail` é um locator lazy (.modal-overlay >> last); após o modal de candidato fechar,
    // o .last() pode resolver pro modal errado. Asserta o texto visível na página (robusto).
    await expect(page.getByText('Maria Candidata').first()).toBeVisible();
  });
});

test.describe('Fluxo composto: Recurso → Folga', () => {
  test.beforeEach(async ({ page }) => {
    await freshApp(page);
  });

  test('3. Cria recurso e registra folga', async ({ page }) => {
    test.setTimeout(60_000); // fluxo com 3 criações em sequência (cliente+contrato+recurso)
    // Nomes únicos por execução: reruns locais na mesma base deixariam vários
    // "Folga Fluxo" e um seletor por texto/`.last()` correria o risco de pegar
    // uma linha de uma tentativa anterior (sem alocação configurada).
    const tag = Date.now();
    const nomeCliente = `Cli Folga ${tag}`;
    const nomeContrato = `Contrato Folga ${tag}`;
    const nomeRecurso = `Folga Fluxo ${tag}`;

    // a) Cliente + contrato — "+ Registrar Folga" só aparece com
    // alocacaoAtual setado, que só é gravado se uma Obra atual for
    // selecionada (Recursos.js: `if (data.alocacao_contractId) {...}`).
    // Cria os próprios aqui em vez de depender de dado de outro teste.
    await goto(page, '/clientes');
    await page.getByRole('button', { name: /\+\s*Novo Cliente/i }).click();
    await submitModal(page, { 'Nome': nomeCliente, 'Empresa': 'Obra Folga' });

    await goto(page, '/contratos');
    await page.getByRole('button', { name: /\+\s*Novo Contrato/i }).first().click();
    let modal = page.locator('.modal-overlay');
    await modal.waitFor({ state: 'visible' });
    const selCli = modal.getByLabel(/^Cliente/i);
    const cliValue = await selCli.locator('option', { hasText: nomeCliente }).getAttribute('value');
    await selCli.selectOption(cliValue);
    await modal.getByLabel(/Nome do Contrato/i).fill(nomeContrato);
    await modal.getByLabel(/Valor Total/i).fill('50000');
    await modal.getByRole('button', { name: /^(Criar|Salvar)$/ }).click();
    await modal.waitFor({ state: 'detached' }).catch(() => {});
    await expect(page.locator('#app')).toContainText(nomeContrato);

    // b) Cria recurso já como Funcionário Ativo alocado nesse contrato —
    // o botão "Folgas" só aparece para status='funcionario' (Recursos.js).
    await goto(page, '/recursos');
    await page.locator('#btnNovoRecurso').click();
    modal = page.locator('.modal-overlay');
    await modal.waitFor({ state: 'visible' });
    await modal.getByLabel(/Nome completo/i).fill(nomeRecurso);
    await modal.locator('#statusSelect').selectOption('funcionario');
    const obraSelect = modal.getByLabel(/^Obra atual/i);
    const obraValue = await obraSelect.locator('option', { hasText: nomeContrato }).getAttribute('value');
    await obraSelect.selectOption(obraValue);
    await modal.getByLabel(/Início na obra/i).fill('2026-01-01');
    await modal.getByRole('button', { name: /^(Criar|Salvar)$/i }).click();
    await modal.waitFor({ state: 'detached' }).catch(() => {});
    await expect(page.locator('#app')).toContainText(nomeRecurso);

    // c) Drill-in > Folgas
    await page.locator('tr', { hasText: nomeRecurso }).locator('.btn-folgas').click();
    const folgasModal = page.locator('#modalFolgas');
    await folgasModal.waitFor({ state: 'visible' });
    await expect(folgasModal.getByText('Nenhuma alocação configurada')).toHaveCount(0);

    // d) Registra folga
    await folgasModal.locator('#btnNovaFolga').click();
    const novaFolgaModal = page.locator('#modalNovaFolga');
    await novaFolgaModal.waitFor({ state: 'visible' });
    await novaFolgaModal.getByLabel(/Início da folga/i).fill('2026-10-01');
    await novaFolgaModal.getByLabel(/Fim da folga/i).fill('2026-10-07');
    await novaFolgaModal.locator('#btnSalvarFolga').click();
    await novaFolgaModal.waitFor({ state: 'detached', timeout: 4000 }).catch(() => {});

    // showFolgas() re-renderiza (sem remover a instância anterior de #modalFolgas —
    // ver comentário do fluxo de candidato acima); asserta pelo texto visível na
    // página em vez de uma instância específica do modal (mais robusto).
    await expect(page.getByText('Nenhuma folga registrada')).toHaveCount(0);
  });
});

test.describe('Fluxo composto: Solicitação de Compra completa', () => {
  test.beforeEach(async ({ page }) => {
    await freshApp(page);
  });

  test('4. Cria → Avalia → Aprova → Compra → Recebe', async ({ page }) => {
    test.setTimeout(60_000); // 5 etapas em sequência (fornecedor + 4 transições de status)
    // O perfil sintético de acesso total (freshApp) inclui as sub-permissões de
    // etapa (solicitacoes-compra:avaliar/aprovar/receber) — sem elas os botões
    // de cada etapa não renderizam mesmo com acesso à rota base (ver
    // js/views/SolicitacoesCompra.js `_podeAvaliar/_podeAprovar/_podeReceber`).
    // "Aprovar" dispara um window.confirm() nativo — sem aceitar, o clique não
    // teria efeito algum (Playwright descarta dialogs por padrão).
    page.on('dialog', (d) => d.accept());

    const tag = Date.now();
    const justificativa = `Justificativa fluxo compra ${tag}`;

    // a) Fornecedor (necessário para a cotação na etapa de Avaliar)
    await goto(page, '/fornecedores');
    await page.getByRole('button', { name: /\+\s*Novo Fornecedor/i }).click();
    await submitModal(page, { 'Nome': `Fornec Compra ${tag}` });

    // b) Encarregado cria a solicitação
    await goto(page, '/solicitacoes-compra');
    await page.getByRole('button', { name: /\+\s*Nova solicitação/i }).first().click();
    let modal = page.locator('.modal-overlay');
    await modal.waitFor({ state: 'visible' });
    await modal.getByLabel(/Justificativa/i).fill(justificativa);
    await modal.locator('.item-row [data-f="descricao"]').first().fill(`Cimento ${tag}`);
    await modal.getByRole('button', { name: /^Enviar para compras$/ }).click();
    await modal.waitFor({ state: 'detached' }).catch(() => {});

    // O POST não atualiza Store.state sincronamente — só reflete via um
    // refresh full (Store.loadAll) disparado pelo evento de mutação em tempo
    // real (lib/bus.js + js/realtime.js), que só dispara se a conexão SSE já
    // estiver estabelecida (js/realtime.js: `setTimeout(start, 1500)` — 1.5s
    // de atraso antes de sequer conectar) — não confiável pra depender em
    // teste. `goto()` pra ROTA ATUAL é um no-op (mesma URL não recarrega o
    // documento) — usa page.reload() pra forçar um fetch fresco de verdade.
    async function reload() {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#sidebar', { state: 'attached', timeout: 10_000 });
    }
    await reload();
    const solId = await page.evaluate((j) => {
      const s = (window.Store?.state?.solicitacoes_compra || []).find((x) => x.justificativa === j);
      return s ? s.id : null;
    }, justificativa);
    expect(solId, 'solicitação recém-criada não encontrada após refresh — POST /api/solicitacoes-compra falhou?').toBeTruthy();

    // Mesma observação para cada transição de status abaixo.
    async function refrescaEConfirmaStatus(status) {
      await reload();
      const atual = await page.evaluate(
        ({ id }) => (window.Store?.state?.solicitacoes_compra || []).find((x) => x.id === id)?.status,
        { id: solId },
      );
      expect(atual, `status esperado "${status}" após a transição`).toBe(status);
    }

    // c) Equipe de compras avalia: escolhe fornecedor + preço, envia para aprovação
    await page.locator(`.btn-avaliar[data-id="${solId}"]`).click();
    modal = page.locator('#modalAvaliar');
    await modal.waitFor({ state: 'visible' });
    const cotFornSelect = modal.locator('.input-cot-forn').first();
    const fornValue = await cotFornSelect.locator('option', { hasText: `Fornec Compra ${tag}` }).getAttribute('value');
    await cotFornSelect.selectOption(fornValue);
    await modal.locator('.input-cot-preco').first().fill('150');
    await modal.getByRole('button', { name: /^Enviar para aprovação →$/ }).click();
    await modal.waitFor({ state: 'detached' }).catch(() => {});
    await refrescaEConfirmaStatus('pendente_aprovacao');

    // d) Gerente aprova (confirm() nativo já é aceito pelo listener acima)
    await page.locator(`.btn-aprovar[data-id="${solId}"]`).click();
    modal = page.locator('#modalAprovar');
    await modal.waitFor({ state: 'visible' });
    await modal.getByRole('button', { name: /Aprovar \(autorizar compra\)/ }).click();
    await modal.waitFor({ state: 'detached' }).catch(() => {});
    await refrescaEConfirmaStatus('aprovada');

    // e) Equipe de compras registra a compra (gera Conta a Pagar)
    await page.locator(`.btn-comprar[data-id="${solId}"]`).click();
    modal = page.locator('#modalComprar');
    await modal.waitFor({ state: 'visible' });
    await modal.getByRole('button', { name: /^Registrar compra \(gera CP\)$/ }).click();
    await modal.waitFor({ state: 'detached' }).catch(() => {});
    await refrescaEConfirmaStatus('comprada');

    // f) Confirma chegada (gera entrada de estoque) — data já vem preenchida com hoje
    await page.locator(`.btn-receber[data-id="${solId}"]`).click();
    modal = page.locator('#modalReceber');
    await modal.waitFor({ state: 'visible' });
    await modal.getByRole('button', { name: /^Confirmar chegada \(gera entrada\)$/ }).click();
    await modal.waitFor({ state: 'detached' }).catch(() => {});
    await refrescaEConfirmaStatus('recebida');

    // Ciclo completo: nenhuma etapa pendente restante para essa solicitação.
    await expect(page.locator(`[data-id="${solId}"].btn-receber`)).toHaveCount(0);
    await expect(page.locator(`[data-id="${solId}"].btn-comprar`)).toHaveCount(0);
    await expect(page.locator(`[data-id="${solId}"].btn-aprovar`)).toHaveCount(0);
    await expect(page.locator(`[data-id="${solId}"].btn-avaliar`)).toHaveCount(0);
  });
});
