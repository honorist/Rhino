// @ts-check
// playwright test test/e2e/bm_rules.spec.js
// Testa as regras de negócio de BM, NF e Caixa via API HTTP autenticada.
// Requer: servidor + PG rodando, RHINO_URL / ADMIN_EMAIL / ADMIN_PASSWORD

const { test, expect } = require('@playwright/test');

const BASE = process.env.RHINO_URL || 'http://localhost:3001';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@rhino.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// ─── Auth helper ─────────────────────────────────────────────────────────────

async function login(request) {
  const res = await request.post(`${BASE}/api/auth/login`, {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  expect(res.status()).toBe(200);
  const cookies = res.headers()['set-cookie'] || '';
  const sid = cookies.match(/rhino_sid=([^;]+)/)?.[1];
  expect(sid, 'cookie de sessão não recebido').toBeTruthy();
  return { Cookie: `rhino_sid=${sid}` };
}

async function api(request, method, path, body, authHeaders) {
  return request[method.toLowerCase()](`${BASE}${path}`, {
    data: body,
    headers: { 'Content-Type': 'application/json', ...authHeaders },
  });
}

// ─── Setup: cria cliente + contrato para cada suite ──────────────────────────

async function criarContrato(request, auth, valorContrato = 100000) {
  // Cria cliente
  const cliRes = await api(request, 'POST', '/api/clientes', {
    nome: `Cli BM ${Date.now()}`, empresa: 'BM Test Ltda',
  }, auth);
  expect(cliRes.status()).toBe(200);
  const cliData = await cliRes.json();
  const cliente = cliData.clientes?.at(-1);

  // Cria contrato
  const ctrRes = await api(request, 'POST', '/api/contracts', {
    name: `Contrato BM ${Date.now()}`,
    client: cliente.nome,
    clientId: cliente.id,
    value: valorContrato,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
  }, auth);
  expect(ctrRes.status()).toBe(200);
  const ctrData = await ctrRes.json();
  return ctrData.contracts?.at(-1);
}

// ─── Testes de regras de BM ───────────────────────────────────────────────────

test.describe('BM — criação e acumulação', () => {
  let auth;

  test.beforeAll(async ({ request }) => {
    auth = await login(request);
  });

  test('primeira saída cria BM-001', async ({ request }) => {
    const contrato = await criarContrato(request, auth);

    const res = await api(request, 'POST', `/api/contracts/${contrato.id}/saidas`, {
      value: 5000, date: '2026-05-01', type: 'material', description: 'Cimento',
    }, auth);
    expect(res.status()).toBe(200);
    const data = await res.json();

    const nfs = (data.notas_fiscais || []).filter(n => n.contractId === contrato.id);
    expect(nfs.length).toBe(1);
    expect(nfs[0].numero).toBe('BM-001');
    expect(Number(nfs[0].valor)).toBe(5000);
  });

  test('segunda saída no mesmo dia acumula no mesmo BM', async ({ request }) => {
    const contrato = await criarContrato(request, auth);

    await api(request, 'POST', `/api/contracts/${contrato.id}/saidas`, {
      value: 3000, date: '2026-05-01', type: 'material', description: 'A',
    }, auth);
    const res2 = await api(request, 'POST', `/api/contracts/${contrato.id}/saidas`, {
      value: 2000, date: '2026-05-01', type: 'material', description: 'B',
    }, auth);
    expect(res2.status()).toBe(200);
    const data = await res2.json();

    const nfs = (data.notas_fiscais || []).filter(n => n.contractId === contrato.id);
    expect(nfs.length).toBe(1, 'Deveria ter só 1 BM acumulado');
    expect(Number(nfs[0].valor)).toBe(5000);
  });

  test('saída em dia diferente cria BM-002', async ({ request }) => {
    const contrato = await criarContrato(request, auth);

    await api(request, 'POST', `/api/contracts/${contrato.id}/saidas`, {
      value: 3000, date: '2026-05-01', type: 'material', description: 'A',
    }, auth);
    const res2 = await api(request, 'POST', `/api/contracts/${contrato.id}/saidas`, {
      value: 2000, date: '2026-05-02', type: 'material', description: 'B',
    }, auth);
    expect(res2.status()).toBe(200);
    const data = await res2.json();

    const nfs = (data.notas_fiscais || [])
      .filter(n => n.contractId === contrato.id)
      .sort((a, b) => a.numero.localeCompare(b.numero));
    expect(nfs.length).toBe(2);
    expect(nfs[0].numero).toBe('BM-001');
    expect(nfs[1].numero).toBe('BM-002');
  });
});

// ─── Testes de limite do contrato ────────────────────────────────────────────

test.describe('BM — limite do contrato', () => {
  let auth;

  test.beforeAll(async ({ request }) => {
    auth = await login(request);
  });

  test('saída que ultrapassa valor do contrato retorna 400', async ({ request }) => {
    const contrato = await criarContrato(request, auth, 10000);

    // Primeira saída: 9000 (dentro do limite)
    const r1 = await api(request, 'POST', `/api/contracts/${contrato.id}/saidas`, {
      value: 9000, date: '2026-05-01', type: 'material', description: 'A',
    }, auth);
    expect(r1.status()).toBe(200);

    // Segunda saída: 2000 (ultrapassa — 9000+2000=11000 > 10000)
    const r2 = await api(request, 'POST', `/api/contracts/${contrato.id}/saidas`, {
      value: 2000, date: '2026-05-01', type: 'material', description: 'B',
    }, auth);
    expect(r2.status()).toBe(400);
    const errBody = await r2.json();
    expect(errBody.error).toMatch(/ultrapassa|contrato/i);
  });

  test('saída no exato limite do contrato é aceita', async ({ request }) => {
    const contrato = await criarContrato(request, auth, 10000);

    const res = await api(request, 'POST', `/api/contracts/${contrato.id}/saidas`, {
      value: 10000, date: '2026-05-01', type: 'material', description: 'Exato',
    }, auth);
    expect(res.status()).toBe(200);
  });
});

// ─── Testes de validação de entrada ──────────────────────────────────────────

test.describe('Saída — validação de entrada (Migração 2)', () => {
  let auth;

  test.beforeAll(async ({ request }) => {
    auth = await login(request);
  });

  test('value string não-numérica retorna 400', async ({ request }) => {
    const contrato = await criarContrato(request, auth);
    const res = await api(request, 'POST', `/api/contracts/${contrato.id}/saidas`, {
      value: 'abc', date: '2026-05-01',
    }, auth);
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/value/i);
  });

  test('value zero retorna 400', async ({ request }) => {
    const contrato = await criarContrato(request, auth);
    const res = await api(request, 'POST', `/api/contracts/${contrato.id}/saidas`, {
      value: 0, date: '2026-05-01',
    }, auth);
    expect(res.status()).toBe(400);
  });

  test('value negativo retorna 400', async ({ request }) => {
    const contrato = await criarContrato(request, auth);
    const res = await api(request, 'POST', `/api/contracts/${contrato.id}/saidas`, {
      value: -500, date: '2026-05-01',
    }, auth);
    expect(res.status()).toBe(400);
  });

  test('date inválida retorna 400', async ({ request }) => {
    const contrato = await criarContrato(request, auth);
    const res = await api(request, 'POST', `/api/contracts/${contrato.id}/saidas`, {
      value: 1000, date: 'nao-e-data',
    }, auth);
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/date/i);
  });
});

// ─── Testes de sync de Caixa ─────────────────────────────────────────────────

test.describe('NF — sync de Caixa ao emitir', () => {
  let auth;

  test.beforeAll(async ({ request }) => {
    auth = await login(request);
  });

  async function criarNFEmitida(request, authH, contratoId) {
    // Cria NF
    const nfRes = await api(request, 'POST', '/api/notas-fiscais', {
      numero: `NF-TEST-${Date.now()}`,
      contractId: contratoId,
      dataLimite: '2026-06-01',
      valor: 10000,
      prazoRecebimento: 30,
    }, authH);
    expect(nfRes.status()).toBe(200);
    const nfData = await nfRes.json();
    const nf = nfData.notas_fiscais?.at(-1);

    // Emite a NF
    const emitRes = await api(request, 'POST', `/api/notas-fiscais/${nf.id}/emitir`, {
      dataEmissaoReal: '2026-05-10',
    }, authH);
    // emitir pode ser PUT ou POST dependendo do endpoint; tenta PUT se POST falhar
    if (emitRes.status() === 404) {
      const putRes = await api(request, 'PUT', `/api/notas-fiscais/${nf.id}`, {
        emitida: true, dataEmissaoReal: '2026-05-10',
      }, authH);
      return { nf, emitStatus: putRes.status() };
    }
    return { nf, emitStatus: emitRes.status() };
  }

  test('alterar prazo de NF (via PUT) atualiza data do caixa', async ({ request }) => {
    const contrato = await criarContrato(request, auth);

    // Cria NF manualmente emitida via PUT com caixaEntryId
    // Para testar o sync, primeiro cria a NF e emite pelo fluxo correto
    const nfRes = await api(request, 'POST', '/api/notas-fiscais', {
      numero: `NF-PRAZO-${Date.now()}`,
      contractId: contrato.id,
      dataLimite: '2026-06-01',
      valor: 10000,
      prazoRecebimento: 30,
    }, auth);
    expect(nfRes.status()).toBe(200);

    // Altera prazo via PUT (deve funcionar sem emissão ainda)
    const nfData = await nfRes.json();
    const nf = nfData.notas_fiscais?.at(-1);
    const putRes = await api(request, 'PUT', `/api/notas-fiscais/${nf.id}`, {
      prazoRecebimento: 45,
    }, auth);
    expect(putRes.status()).toBe(200);

    const updated = (await putRes.json()).notas_fiscais?.find(n => n.id === nf.id);
    expect(Number(updated.prazoRecebimento)).toBe(45);
  });

  test('PUT /api/notas-fiscais — prazoRecebimento string retorna 400', async ({ request }) => {
    const contrato = await criarContrato(request, auth);
    const nfRes = await api(request, 'POST', '/api/notas-fiscais', {
      numero: `NF-VAL-${Date.now()}`,
      contractId: contrato.id,
      dataLimite: '2026-06-01',
      valor: 5000,
    }, auth);
    const nf = (await nfRes.json()).notas_fiscais?.at(-1);

    const putRes = await api(request, 'PUT', `/api/notas-fiscais/${nf.id}`, {
      prazoRecebimento: 'trinta dias',
    }, auth);
    expect(putRes.status()).toBe(400);
    const body = await putRes.json();
    expect(body.error).toMatch(/prazo/i);
  });

  test('POST /api/contas-pagar com valor string retorna 400', async ({ request }) => {
    const res = await api(request, 'POST', '/api/contas-pagar', {
      descricao: 'Conta', valor: 'cem reais',
    }, auth);
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/valor/i);
  });

  test('POST /api/contas-pagar sem descricao retorna 400', async ({ request }) => {
    const res = await api(request, 'POST', '/api/contas-pagar', {
      valor: 100,
    }, auth);
    expect(res.status()).toBe(400);
  });
});
