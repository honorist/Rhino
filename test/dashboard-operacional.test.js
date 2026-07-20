'use strict';
/**
 * Dashboard (handlers/dashboards.js) — cobertura pedida no
 * steering/dashboard-proximos-passos.md (Step 1), viabilizada pelo
 * desmembramento do server.js (item 22/23 do roadmap).
 *
 * Duas garantias que importam em produção:
 *  1. Zero-state: banco vazio não quebra o painel — devolve zeros, 200.
 *  2. Resiliência: cada KPI operacional é embrulhado em safe() — se UMA query
 *     falha (tabela ausente, erro de SQL), aquele KPI cai no fallback e o painel
 *     inteiro ainda responde 200, em vez de derrubar tudo com 500.
 *
 * `db` e `repos` são os módulos compartilhados, monkeypatchados aqui — nada toca
 * o Postgres. handleDashboardOperacional faz require('../db') internamente, mas
 * o módulo é cacheado, então o patch pega.
 */
const { test, afterEach } = require('node:test');
const assert = require('node:assert');

const db = require('../db');
const repos = require('../db/repos');
const dashboards = require('../handlers/dashboards');

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

// Guarda os originais para restaurar (evita vazar mock entre testes/arquivos).
const orig = {
  getOne: db.getOne,
  getMany: db.getMany,
  contracts: repos.contracts,
  caixa: repos.caixa,
  baseItems: repos.baseItems,
  notasFiscais: repos.notasFiscais,
  contasPagar: repos.contasPagar,
};
afterEach(() => Object.assign(db, { getOne: orig.getOne, getMany: orig.getMany }) && Object.assign(repos, {
  contracts: orig.contracts,
  caixa: orig.caixa,
  baseItems: orig.baseItems,
  notasFiscais: orig.notasFiscais,
  contasPagar: orig.contasPagar,
}));

// ── Operacional: zero-state ─────────────────────────────────────────────────
test('operacional: banco vazio devolve zeros e responde 200', async () => {
  db.getOne = async () => null; // `(await fn()) || fallback` → fallback
  db.getMany = async () => [];
  const res = fakeRes();
  await dashboards.handleDashboardOperacional(res);

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.combustivel.mesAtual, 0);
  assert.strictEqual(res.body.compras.abertas, 0);
  assert.strictEqual(res.body.folha.custoAtual, 0);
  assert.strictEqual(res.body.estoque.abaixoMinimo, 0);
  assert.strictEqual(res.body.manutEquip.atrasadas, 0);
  assert.strictEqual(res.body.docsKpi.vencidos, 0);
  assert.deepStrictEqual(res.body.topCombustivel, []);
});

// ── Operacional: uma query falhando não derruba o painel ────────────────────
test('operacional: query com erro cai no fallback (200, não 500)', async () => {
  db.getOne = async () => {
    throw new Error('relation "veiculo_abastecimentos" does not exist');
  };
  db.getMany = async () => {
    throw new Error('boom');
  };
  const res = fakeRes();
  await dashboards.handleDashboardOperacional(res);

  // safe() engoliu cada erro → painel inteiro ainda responde com zeros.
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.propostasKpi.emAndamento, 0);
  assert.strictEqual(res.body.revisoes.vencidas, 0);
  assert.deepStrictEqual(res.body.topCombustivel, []);
});

// ── Financeiro: zero-state não quebra ───────────────────────────────────────
test('financeiro: banco vazio devolve painel coerente e 200', async () => {
  repos.contracts = {
    getEnvelope: async () => ({ contracts: [], saidas: [] }),
  };
  repos.caixa = { findAll: async () => [] };
  repos.baseItems = { findAll: async () => [] };
  repos.notasFiscais = { findAll: async () => [] };
  repos.contasPagar = { findAll: async () => [] };

  const res = fakeRes();
  await dashboards.handleDashboard(res, {});

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.activeContracts, 0);
  assert.strictEqual(res.body.totalContractValue, 0);
  assert.strictEqual(res.body.caixaBalance, 0);
  assert.deepStrictEqual(res.body.contractsWithMargin, []);
  assert.deepStrictEqual(res.body.contratosAVencer, []);
  assert.strictEqual(res.body.nfsStatus.vencidas, 0);
  assert.ok(Array.isArray(res.body.historicoCaixa), 'histórico é sempre uma série');
});

// ── Financeiro: margem por contrato = valor - saídas do contrato ────────────
test('financeiro: margem por obra = valor do contrato menos suas saídas', async () => {
  repos.contracts = {
    getEnvelope: async () => ({
      contracts: [
        { id: 'c1', name: 'Obra 1', client: 'X', value: 1000, status: 'ativo' },
        { id: 'c2', name: 'Obra 2', client: 'Y', value: 500, status: 'ativo' },
      ],
      saidas: [
        { contractId: 'c1', value: 300 },
        { contractId: 'c1', value: 100 },
        { contractId: 'c2', value: 500 },
      ],
    }),
  };
  repos.caixa = { findAll: async () => [] };
  repos.baseItems = { findAll: async () => [] };
  repos.notasFiscais = { findAll: async () => [] };
  repos.contasPagar = { findAll: async () => [] };

  const res = fakeRes();
  await dashboards.handleDashboard(res, {});

  const byId = Object.fromEntries(res.body.contractsWithMargin.map((c) => [c.id, c]));
  assert.strictEqual(byId.c1.margin, 600); // 1000 - (300+100)
  assert.strictEqual(byId.c1.marginPct, '60.00');
  assert.strictEqual(byId.c2.margin, 0); // 500 - 500
  assert.strictEqual(res.body.activeContracts, 2);
  assert.strictEqual(res.body.totalContractValue, 1500);
});
