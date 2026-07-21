'use strict';
/**
 * Data book / prontidão de comissionamento (item 12).
 *
 * Duas camadas num arquivo só (a feature é pequena e enxuta):
 *  1. Regra pura lib/data-book.js › prontidao — contagem da punch list, média do
 *     avanço físico, selo pronto/pendente e as pendências (BR-DATABOOK-001/002).
 *  2. Handler handlers/data-book.js › handleGetDataBook — orquestra
 *     repos.punchItens.findAll + db.getMany (ambos dublados, nada toca o
 *     Postgres), valida o contrato (404) e responde { prontidao }.
 */
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { prontidao } = require('../lib/data-book');

// ═══════════ 1. Regra pura ═══════════

test('BR-DATABOOK-001: conta total/verificados/abertos e % verificado da punch', () => {
  const r = prontidao({
    punchItens: [
      { status: 'verificado' },
      { status: 'aberto' },
      { status: 'resolvido' },
      { status: 'verificado' },
    ],
    atividades: [],
  });
  assert.equal(r.punch.total, 4);
  assert.equal(r.punch.verificados, 2);
  assert.equal(r.punch.abertos, 2);
  assert.equal(r.punch.pctVerificado, 50);
});

test('BR-DATABOOK-001: sem itens de punch → 100% verificado e nenhum aberto', () => {
  const r = prontidao({ punchItens: [], atividades: [{ execPct: 100 }] });
  assert.equal(r.punch.total, 0);
  assert.equal(r.punch.abertos, 0);
  assert.equal(r.punch.pctVerificado, 100);
});

test('fisico.execMedio é a média simples do exec_pct (aceita camel e snake)', () => {
  const r = prontidao({
    punchItens: [],
    atividades: [{ execPct: 100 }, { exec_pct: 50 }, { execPct: 0 }],
  });
  assert.equal(r.fisico.execMedio, 50);
});

test('BR-DATABOOK-002: pronto quando punch toda verificada E físico 100%', () => {
  const r = prontidao({
    punchItens: [{ status: 'verificado' }, { status: 'verificado' }],
    atividades: [{ execPct: 100 }, { execPct: 100 }],
  });
  assert.equal(r.pronto, true);
  assert.deepEqual(r.pendencias, []);
});

test('BR-DATABOOK-002: punch em aberto bloqueia a prontidão e vira pendência', () => {
  const r = prontidao({
    punchItens: [{ status: 'aberto' }, { status: 'verificado' }],
    atividades: [{ execPct: 100 }],
  });
  assert.equal(r.pronto, false);
  assert.ok(r.pendencias.some((p) => /punch/i.test(p)));
});

test('BR-DATABOOK-002: físico abaixo de 100% bloqueia e vira pendência', () => {
  const r = prontidao({
    punchItens: [{ status: 'verificado' }],
    atividades: [{ execPct: 80 }],
  });
  assert.equal(r.pronto, false);
  assert.ok(r.pendencias.some((p) => /físico/i.test(p)));
});

test('BR-DATABOOK-002: sem atividades nunca fica pronto (avanço não medido)', () => {
  const r = prontidao({ punchItens: [], atividades: [] });
  assert.equal(r.fisico.execMedio, 0);
  assert.equal(r.pronto, false);
  assert.ok(r.pendencias.some((p) => /cronograma|atividade/i.test(p)));
});

test('prontidao é tolerante a entrada ausente/inválida', () => {
  const r = prontidao();
  assert.equal(r.punch.total, 0);
  assert.equal(r.fisico.execMedio, 0);
  assert.equal(r.pronto, false);
});

// ═══════════ 2. Handler (repos + db dublados) ═══════════

describe('handleGetDataBook', () => {
  const db = require('../db');
  const repos = require('../db/repos');
  const h = require('../handlers/data-book');

  // Resposta HTTP falsa: guarda status e body sem abrir socket.
  function fakeRes() {
    const res = {
      status: null,
      body: null,
      writeHead(s) {
        res.status = s;
      },
      end(payload) {
        res.body = payload ? JSON.parse(payload) : null;
      },
    };
    return res;
  }

  const orig = { contracts: repos.contracts, punchItens: repos.punchItens, getMany: db.getMany };
  let calls;

  beforeEach(() => {
    calls = { punchFindAll: null, getMany: null };
    repos.contracts = { findById: async (id) => (id === 'C1' ? { id: 'C1', name: 'Obra' } : null) };
    repos.punchItens = {
      findAll: async (filtro) => {
        calls.punchFindAll = filtro;
        return [{ status: 'verificado' }];
      },
    };
    db.getMany = async (sql, params) => {
      calls.getMany = { sql, params };
      return [{ execPct: 100 }];
    };
  });

  function restore() {
    repos.contracts = orig.contracts;
    repos.punchItens = orig.punchItens;
    db.getMany = orig.getMany;
  }

  test('GET data-book responde { prontidao } agregando punch + atividades', async (t) => {
    t.after(restore);
    const res = fakeRes();
    await h.handleGetDataBook('C1', res);
    assert.equal(res.status, 200);
    assert.ok(res.body.prontidao, 'tem o bloco prontidao');
    assert.equal(res.body.prontidao.pronto, true);
    // Punch filtrado por contrato no repositório, não em JS.
    assert.deepEqual(calls.punchFindAll, { contractId: 'C1' });
    // Atividades vêm por SQL parametrizado pelo contrato (sem interpolar id cru).
    assert.deepEqual(calls.getMany.params, ['C1']);
  });

  test('GET data-book em contrato inexistente responde 404 sem consultar dados', async (t) => {
    t.after(restore);
    const res = fakeRes();
    await h.handleGetDataBook('SUMIU', res);
    assert.equal(res.status, 404);
    assert.equal(calls.punchFindAll, null, 'não buscou punch');
    assert.equal(calls.getMany, null, 'não buscou atividades');
  });

  test('GET data-book: falha ao ler atividades não derruba a resposta (fallback)', async (t) => {
    t.after(restore);
    db.getMany = async () => {
      throw new Error('coluna inexistente');
    };
    const res = fakeRes();
    await h.handleGetDataBook('C1', res);
    assert.equal(res.status, 200);
    // Sem atividades legíveis → não fica pronto, mas responde mesmo assim.
    assert.equal(res.body.prontidao.pronto, false);
  });
});
