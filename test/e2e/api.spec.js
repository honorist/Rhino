// @ts-check
// Testes E2E via API HTTP — cobrem os fluxos críticos pós-refatoração FASE 5+6 + auth (FASE 11).
// Roda direto contra http://localhost:3001 (app + Postgres em docker compose).
const { test, expect, request } = require('@playwright/test');

const BASE_URL = process.env.RHINO_URL || 'http://localhost:3001';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@rhino.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Cria contexto autenticado (faz login e mantém cookie de sessão).
async function api() {
  const ctx = await request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { 'Content-Type': 'application/json' } });
  const r = await ctx.post('/api/auth/login', { data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  if (!r.ok()) throw new Error(`Login falhou: ${r.status()} ${await r.text()}`);
  return ctx;
}

async function unauth() {
  return await request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { 'Content-Type': 'application/json' } });
}

test.describe('Auth', () => {
  test('rotas /api/* exigem login', async () => {
    const ctx = await unauth();
    const r = await ctx.get('/api/contracts');
    expect(r.status()).toBe(401);
  });

  test('login com senha errada → 401', async () => {
    const ctx = await unauth();
    const r = await ctx.post('/api/auth/login', { data: { email: ADMIN_EMAIL, password: 'wrong' } });
    expect(r.status()).toBe(401);
  });

  test('login + /me + logout', async () => {
    const ctx = await unauth();
    const login = await ctx.post('/api/auth/login', { data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
    expect(login.status()).toBe(200);
    const me = await ctx.get('/api/auth/me');
    expect(me.status()).toBe(200);
    expect((await me.json()).user.email).toBe(ADMIN_EMAIL.toLowerCase());
    const logout = await ctx.post('/api/auth/logout');
    expect(logout.status()).toBe(200);
    const meAfter = await ctx.get('/api/auth/me');
    expect(meAfter.status()).toBe(401);
  });

  test('/api/health não exige login', async () => {
    const ctx = await unauth();
    const r = await ctx.get('/api/health');
    expect(r.status()).toBe(200);
  });
});

test.describe('Health & smoke', () => {
  test('health responde db ok', async () => {
    const ctx = await api();
    const r = await ctx.get('/api/health');
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.db).toBe('ok');
  });

  test('todos os endpoints GET principais retornam 200', async () => {
    const ctx = await api();
    const eps = ['contracts','clientes','socios','fornecedores','recursos','caixa','contas-pagar','notas-fiscais','tipos-base','niveis-acesso','doc-templates','base','investimentos','dashboard'];
    for (const ep of eps) {
      const r = await ctx.get(`/api/${ep}`);
      expect(r.status(), ep).toBe(200);
    }
  });
});

test.describe('Clientes CRUD', () => {
  test('cria, edita, deleta cliente', async () => {
    const ctx = await api();
    const post = await ctx.post('/api/clientes', { data: { nome: 'PW Cliente', empresa: 'PW Co' } });
    expect(post.status()).toBe(200);
    const created = (await post.json()).clientes.find(c => c.nome === 'PW Cliente');
    expect(created).toBeTruthy();

    const put = await ctx.put(`/api/clientes/${created.id}`, { data: { empresa: 'PW Updated' } });
    expect(put.status()).toBe(200);
    expect((await put.json()).clientes.find(c => c.id === created.id).empresa).toBe('PW Updated');

    const del = await ctx.delete(`/api/clientes/${created.id}`);
    expect(del.status()).toBe(200);
    expect((await del.json()).clientes.find(c => c.id === created.id)).toBeFalsy();
  });
});

test.describe('Contracts + sub-recursos', () => {
  let contractId;

  test.afterAll(async () => {
    if (contractId) {
      const ctx = await api();
      await ctx.delete(`/api/contracts/${contractId}`); // cascade de saidas/organograma/rdos
    }
  });

  test('cria contrato', async () => {
    const ctx = await api();
    const r = await ctx.post('/api/contracts', { data: { name: 'PW Contract', client: 'X', value: 50000 } });
    expect(r.status()).toBe(200);
    const c = (await r.json()).contracts.find(c => c.name === 'PW Contract');
    expect(c).toBeTruthy();
    contractId = c.id;
  });

  test('budget item', async () => {
    const ctx = await api();
    const r = await ctx.post(`/api/contracts/${contractId}/budget`, { data: { description: 'PW orcamento', type: 'material', value: 1000 } });
    expect(r.status()).toBe(200);
    const c = (await r.json()).contracts.find(c => c.id === contractId);
    expect(c.budget.length).toBe(1);
  });

  test('saída cria NF e respeita prazo=0', async () => {
    const ctx = await api();
    const r = await ctx.post(`/api/contracts/${contractId}/saidas`, {
      data: { description: 'PW saida', type: 'material', value: 500, date: '2026-06-01', prazoRecebimento: 0 },
    });
    expect(r.status()).toBe(200);
    const body = await r.json();
    const saida = body.saidas.find(s => s.description === 'PW saida');
    expect(saida).toBeTruthy();
    const nf = body.notas_fiscais.find(n => n.id === saida.nfId);
    expect(nf.prazoRecebimento).toBe(0);
  });

  test('editar prazo da saída persiste', async () => {
    const ctx = await api();
    const list = await (await ctx.get('/api/contracts')).json();
    const saida = list.saidas.find(s => s.description === 'PW saida');
    const put = await ctx.put(`/api/saidas/${saida.id}`, { data: { prazoRecebimento: 45 } });
    expect(put.status()).toBe(200);
    const nfs = await (await ctx.get('/api/notas-fiscais')).json();
    expect(nfs.notas_fiscais.find(n => n.id === saida.nfId).prazoRecebimento).toBe(45);
  });

  test('RDO criado com numero', async () => {
    const ctx = await api();
    const r = await ctx.post(`/api/contracts/${contractId}/rdos`, { data: { data: '2026-06-15' } });
    expect(r.status()).toBe(200);
    const c = (await r.json()).contracts.find(c => c.id === contractId);
    expect(c.rdos.length).toBeGreaterThan(0);
    expect(c.rdos[0].data).toBe('2026-06-15');
  });

  test('organograma encarregado', async () => {
    const ctx = await api();
    let recs = (await (await ctx.get('/api/recursos')).json()).recursos;
    let rec = recs[0];
    if (!rec) {
      const created = await (await ctx.post('/api/recursos', {
        data: { nome: 'PW Recurso', profissao: 'Pedreiro' },
      })).json();
      rec = created.recursos[0];
    }
    const r = await ctx.post(`/api/contracts/${contractId}/organograma`, {
      data: { recursoId: rec.id, nivel: 'encarregado', cargo: 'Encarregado' },
    });
    expect(r.status()).toBe(200);
    const c = (await r.json()).contracts.find(c => c.id === contractId);
    expect(c.organograma.find(m => m.recursoId === rec.id)).toBeTruthy();
  });
});

test.describe('Contas a pagar — pagar/estornar', () => {
  test('cria, paga, estorna, deleta com cascade no caixa', async () => {
    const ctx = await api();
    const created = await (await ctx.post('/api/contas-pagar', {
      data: { descricao: 'PW conta', valor: 800, dataVencimento: '2026-06-30' },
    })).json();
    const conta = created.contas.find(c => c.descricao === 'PW conta');
    expect(conta).toBeTruthy();

    const pago = await (await ctx.post(`/api/contas-pagar/${conta.id}/pagar`, {
      data: { valorPago: 800, formaPagamento: 'PIX' },
    })).json();
    const pagoConta = pago.contas.find(c => c.id === conta.id);
    expect(pagoConta.status).toBe('pago');
    expect(pagoConta.caixaEntryId).toBeTruthy();

    // Caixa deve ter a entrada criada pelo pagamento
    const cxBefore = await (await ctx.get('/api/caixa')).json();
    expect(cxBefore.entries.find(e => e.id === pagoConta.caixaEntryId)).toBeTruthy();

    const estorno = await (await ctx.post(`/api/contas-pagar/${conta.id}/estornar`)).json();
    expect(estorno.contas.find(c => c.id === conta.id).status).toBe('pendente');

    const cxAfter = await (await ctx.get('/api/caixa')).json();
    expect(cxAfter.entries.find(e => e.id === pagoConta.caixaEntryId)).toBeFalsy();

    await ctx.delete(`/api/contas-pagar/${conta.id}`);
  });
});

test.describe('Investimentos cascade', () => {
  test('aporte destino=base cria base_item, delete remove cascade', async () => {
    const ctx = await api();
    const r = await ctx.post('/api/investimentos', {
      data: { value: 2000, destino: 'base', origem: 'socio', description: 'PW aporte' },
    });
    expect(r.status()).toBe(200);
    const inv = (await r.json()).investimentos.find(x => x.description === 'PW aporte');
    expect(inv.baseItemId).toBeTruthy();

    const base = await (await ctx.get('/api/base')).json();
    expect(base.items.find(b => b.id === inv.baseItemId)).toBeTruthy();

    await ctx.delete(`/api/investimentos/${inv.id}`);

    const baseAfter = await (await ctx.get('/api/base')).json();
    expect(baseAfter.items.find(b => b.id === inv.baseItemId)).toBeFalsy();
  });
});

test.describe('Aditivos, Marcos e Ocorrências', () => {
  let contractId;

  test.beforeAll(async () => {
    const ctx = await api();
    const r = await ctx.post('/api/contracts', { data: { name: 'PW Aditivos Contract', value: 100000 } });
    contractId = (await r.json()).contracts.find(c => c.name === 'PW Aditivos Contract').id;
  });

  test.afterAll(async () => {
    if (contractId) {
      const ctx = await api();
      await ctx.delete(`/api/contracts/${contractId}`);
    }
  });

  // ── Aditivos ─────────────────────────────────────────────────────────────

  test('aditivo: criar → editar → deletar', async () => {
    const ctx = await api();

    // criar
    const post = await ctx.post(`/api/contracts/${contractId}/aditivos`, {
      data: { descricao: 'Aditivo PW', tipo: 'valor', valorDelta: 5000, data: '2026-06-01' },
    });
    expect(post.status()).toBe(200);
    const postBody = await post.json();
    const contract0 = postBody.contracts.find(c => c.id === contractId);
    const aditivo = contract0?.aditivos?.find(a => a.descricao === 'Aditivo PW');
    expect(aditivo).toBeTruthy();
    const adId = aditivo.id;

    // editar
    const put = await ctx.put(`/api/contracts/${contractId}/aditivos/${adId}`, {
      data: { descricao: 'Aditivo PW Editado', aprovado: true },
    });
    expect(put.status()).toBe(200);
    const putBody = await put.json();
    const contract1 = putBody.contracts.find(c => c.id === contractId);
    expect(contract1.aditivos.find(a => a.id === adId).aprovado).toBe(true);

    // deletar
    const del = await ctx.delete(`/api/contracts/${contractId}/aditivos/${adId}`);
    expect(del.status()).toBe(200);
    const delBody = await del.json();
    const contract2 = delBody.contracts.find(c => c.id === contractId);
    expect(contract2.aditivos?.find(a => a.id === adId)).toBeFalsy();
  });

  test('aditivo: retorna 404 para id inexistente', async () => {
    const ctx = await api();
    const r = await ctx.put(`/api/contracts/${contractId}/aditivos/nao_existe`, { data: { descricao: 'X' } });
    expect(r.status()).toBe(404);
  });

  // ── Marcos ───────────────────────────────────────────────────────────────

  test('marco: criar → concluir → deletar', async () => {
    const ctx = await api();

    const post = await ctx.post(`/api/contracts/${contractId}/marcos`, {
      data: { titulo: 'Marco PW', prazo: '2026-07-01', ordem: 1 },
    });
    expect(post.status()).toBe(200);
    const postBody = await post.json();
    const marco = postBody.contracts.find(c => c.id === contractId)?.marcos?.find(m => m.titulo === 'Marco PW');
    expect(marco).toBeTruthy();
    const mId = marco.id;

    // marcar como concluído
    const put = await ctx.put(`/api/contracts/${contractId}/marcos/${mId}`, {
      data: { concluido: true, concluidoEm: '2026-06-28' },
    });
    expect(put.status()).toBe(200);
    const putBody = await put.json();
    expect(putBody.contracts.find(c => c.id === contractId).marcos.find(m => m.id === mId).concluido).toBe(true);

    // deletar
    const del = await ctx.delete(`/api/contracts/${contractId}/marcos/${mId}`);
    expect(del.status()).toBe(200);
  });

  test('marco: retorna 404 para id inexistente', async () => {
    const ctx = await api();
    const r = await ctx.put(`/api/contracts/${contractId}/marcos/nao_existe`, { data: { titulo: 'X' } });
    expect(r.status()).toBe(404);
  });

  // ── Ocorrências ──────────────────────────────────────────────────────────

  test('ocorrência: criar → encerrar → deletar', async () => {
    const ctx = await api();

    const post = await ctx.post(`/api/contracts/${contractId}/ocorrencias`, {
      data: { descricao: 'Ocorrência PW', tipo: 'segurança', severidade: 'alta', data: '2026-06-10' },
    });
    expect(post.status()).toBe(200);
    const postBody = await post.json();
    const ocr = postBody.contracts.find(c => c.id === contractId)?.ocorrencias?.find(o => o.descricao === 'Ocorrência PW');
    expect(ocr).toBeTruthy();
    const oId = ocr.id;

    // encerrar
    const put = await ctx.put(`/api/contracts/${contractId}/ocorrencias/${oId}`, {
      data: { encerrada: true },
    });
    expect(put.status()).toBe(200);
    const putBody = await put.json();
    expect(putBody.contracts.find(c => c.id === contractId).ocorrencias.find(o => o.id === oId).encerrada).toBe(true);

    // deletar
    const del = await ctx.delete(`/api/contracts/${contractId}/ocorrencias/${oId}`);
    expect(del.status()).toBe(200);
  });

  test('ocorrência: retorna 404 para id inexistente', async () => {
    const ctx = await api();
    const r = await ctx.put(`/api/contracts/${contractId}/ocorrencias/nao_existe`, { data: { descricao: 'X' } });
    expect(r.status()).toBe(404);
  });

  // ── Retenção ─────────────────────────────────────────────────────────────

  test('retencaoPercent é salvo e retornado', async () => {
    const ctx = await api();
    const r = await ctx.put(`/api/contracts/${contractId}`, { data: { retencaoPercent: 5.5 } });
    expect(r.status()).toBe(200);
    const updated = (await r.json()).contracts.find(c => c.id === contractId);
    expect(parseFloat(updated.retencaoPercent)).toBeCloseTo(5.5, 1);
  });
});

test.describe('NF emitir/cancelar', () => {
  let contractId, nfId;

  test.beforeAll(async () => {
    const ctx = await api();
    const c = (await (await ctx.post('/api/contracts', {
      data: { name: 'PW NF Contract', client: 'NF Test', value: 10000 },
    })).json()).contracts.find(c => c.name === 'PW NF Contract');
    contractId = c.id;
    const nfRes = await (await ctx.post('/api/notas-fiscais', {
      data: { numero: 'PW-001', contractId, dataLimite: '2026-07-01', valor: 1000, prazoRecebimento: 30 },
    })).json();
    nfId = nfRes.notas_fiscais.find(n => n.numero === 'PW-001').id;
  });

  test.afterAll(async () => {
    const ctx = await api();
    if (contractId) await ctx.delete(`/api/contracts/${contractId}`);
  });

  test('emite NF cria entrada no caixa', async () => {
    const ctx = await api();
    const r = await ctx.post(`/api/notas-fiscais/${nfId}/emitir`, { data: { dataEmissaoReal: '2026-07-01' } });
    expect(r.status()).toBe(200);
    const body = await r.json();
    const nf = body.notas_fiscais.find(n => n.id === nfId);
    expect(nf.emitida).toBe(true);
    expect(nf.caixaEntryId).toBeTruthy();
    expect(body.caixa.entries.find(e => e.id === nf.caixaEntryId)).toBeTruthy();
  });

  test('cancela emissão remove caixa', async () => {
    const ctx = await api();
    const r = await ctx.post(`/api/notas-fiscais/${nfId}/cancelar-emissao`);
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.notas_fiscais.find(n => n.id === nfId).emitida).toBe(false);
  });
});
