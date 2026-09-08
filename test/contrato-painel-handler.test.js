'use strict';
/**
 * @file handlers/contrato-painel.js e handlers/contracts.js#handleGetContract.
 * `db`/`repos` dublados — nada toca o Postgres.
 *
 * Dois comportamentos que importam em produção:
 *  1. Resiliência: uma sub-consulta falhando degrada UM card, nunca derruba o
 *     painel inteiro (padrão safe() de handlers/dre.js).
 *  2. Gate financeiro: o painel concentra margem + faturamento num payload só,
 *     e o servidor só gateia MUTAÇÃO — então o handler omite esses blocos de
 *     quem não tem `contrato-tab:financeiro` nem `contrato-tab:dre`.
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const db = require('../db');
const repos = require('../db/repos');
const perms = require('../lib/permissions');
const painelHandler = require('../handlers/contrato-painel');
const contractsHandler = require('../handlers/contracts');

function fakeRes() {
  const res = {
    status: null,
    body: null,
    writeHead(s) { res.status = s; },
    end(payload) { res.body = payload ? JSON.parse(payload) : null; },
  };
  return res;
}

const orig = {
  getMany: db.getMany, getOne: db.getOne,
  contracts: repos.contracts, rdos: repos.rdos, punchItens: repos.punchItens,
  ssmaOcorrencias: repos.ssmaOcorrencias, organograma: repos.organograma,
  recursos: repos.recursos, loadAbas: perms.loadAbas,
};

const CONTRATO = {
  id: 'ctr1', name: 'Obra Teste', value: 100000, status: 'ativo',
  startDate: '2026-01-05', endDate: '2026-12-18',
};

beforeEach(() => {
  db.getMany = async () => [];
  db.getOne = async () => ({ total: 0 });
  repos.contracts = {
    findById: async (id) => (id === 'ctr1' ? { ...CONTRATO } : null),
    findByIdWithChildren: async (id) =>
      id === 'ctr1' ? { ...CONTRATO, organograma: [], rdos: [], aditivos: [], marcos: [], ocorrencias: [] } : null,
  };
  repos.rdos = { findAll: async () => [] };
  repos.punchItens = { findAll: async () => [] };
  repos.ssmaOcorrencias = { findAll: async () => [] };
  repos.organograma = { findAll: async () => [] };
  repos.recursos = { findAll: async () => [] };
  perms.loadAbas = async () => null; // super admin por padrão
});

function restore() {
  Object.assign(db, { getMany: orig.getMany, getOne: orig.getOne });
  Object.assign(repos, {
    contracts: orig.contracts, rdos: orig.rdos, punchItens: orig.punchItens,
    ssmaOcorrencias: orig.ssmaOcorrencias, organograma: orig.organograma, recursos: orig.recursos,
  });
  perms.loadAbas = orig.loadAbas;
}

// ── GET /api/contracts/:id ─────────────────────────────────────────────────

test('handleGetContract devolve o contrato com filhos e as saídas dele', async () => {
  db.getMany = async () => [{ id: 's1', value: 100 }];
  const res = fakeRes();
  await contractsHandler.handleGetContract('ctr1', res);
  assert.equal(res.status, 200);
  assert.equal(res.body.contract.id, 'ctr1');
  assert.ok(Array.isArray(res.body.contract.rdos), 'esperava os filhos do contrato');
  assert.equal(res.body.saidas.length, 1, 'esperava as saídas só deste contrato');
  restore();
});

test('handleGetContract devolve 404 pra contrato inexistente', async () => {
  const res = fakeRes();
  await contractsHandler.handleGetContract('naoexiste', res);
  assert.equal(res.status, 404);
  restore();
});

// ── GET /api/contracts/:id/painel ──────────────────────────────────────────

test('painel devolve retrato + ações pra contrato existente', async () => {
  const res = fakeRes();
  await painelHandler.handleGetContratoPainel({ user: {} }, 'ctr1', res);
  assert.equal(res.status, 200);
  assert.ok(res.body.painel, 'esperava o envelope { painel }');
  assert.ok(res.body.painel.obra, 'esperava o retrato da obra');
  assert.ok(Array.isArray(res.body.painel.acoes));
  assert.ok(res.body.painel.indicadores);
  restore();
});

test('painel devolve 404 pra contrato inexistente', async () => {
  const res = fakeRes();
  await painelHandler.handleGetContratoPainel({ user: {} }, 'naoexiste', res);
  assert.equal(res.status, 404);
  restore();
});

test('uma sub-consulta falhando degrada só aquele card, não o painel', async () => {
  // Punch estoura; o painel tem que responder 200 assim mesmo.
  repos.punchItens = { findAll: async () => { throw new Error('relation "punch_itens" does not exist'); } };
  const res = fakeRes();
  await painelHandler.handleGetContratoPainel({ user: {} }, 'ctr1', res);
  assert.equal(res.status, 200, 'safe() deveria ter absorvido a falha');
  assert.equal(res.body.painel.indicadores.punch.total, 0);
  restore();
});

// ── Gate financeiro ────────────────────────────────────────────────────────

test('perfil COM permissão financeira recebe margem e faturamento', async () => {
  perms.loadAbas = async () => ['contrato-tab:financeiro'];
  const res = fakeRes();
  await painelHandler.handleGetContratoPainel({ user: { nivelAcessoId: 'x' } }, 'ctr1', res);
  assert.ok(res.body.painel.obra.margem, 'esperava margem');
  assert.ok(res.body.painel.obra.faturamento, 'esperava faturamento');
  restore();
});

test('perfil SEM permissão financeira não recebe margem nem faturamento', async () => {
  perms.loadAbas = async () => ['contrato-tab:rdo', 'contrato-tab:equipe'];
  const res = fakeRes();
  await painelHandler.handleGetContratoPainel({ user: { nivelAcessoId: 'x' } }, 'ctr1', res);
  assert.equal(res.status, 200);
  assert.ok(!('margem' in res.body.painel.obra), 'margem não pode ir no payload');
  assert.ok(!('faturamento' in res.body.painel.obra), 'faturamento não pode ir no payload');
  // O resto do painel continua útil pra esse perfil.
  assert.ok(res.body.painel.obra.avancoFisico, 'avanço físico não é dado financeiro');
  assert.ok(res.body.painel.obra.prazo);
  restore();
});

test('perfil com contrato-tab:dre também vê o financeiro', async () => {
  perms.loadAbas = async () => ['contrato-tab:dre'];
  const res = fakeRes();
  await painelHandler.handleGetContratoPainel({ user: { nivelAcessoId: 'x' } }, 'ctr1', res);
  assert.ok(res.body.painel.obra.margem);
  restore();
});

test('válvula legada: perfil sem NENHUMA contrato-tab: continua vendo tudo', async () => {
  // Sem isso, todo perfil antigo (que nunca configurou aba de contrato)
  // perderia o financeiro de uma hora pra outra.
  perms.loadAbas = async () => ['#/contratos', '#/caixa'];
  const res = fakeRes();
  await painelHandler.handleGetContratoPainel({ user: { nivelAcessoId: 'x' } }, 'ctr1', res);
  assert.ok(res.body.painel.obra.margem, 'perfil legado não pode perder acesso');
  restore();
});

test('podeVerFinanceiro: abas null (super admin) libera', () => {
  assert.equal(painelHandler.podeVerFinanceiro(null), true);
  assert.equal(painelHandler.podeVerFinanceiro(['contrato-tab:rdo']), false);
  assert.equal(painelHandler.podeVerFinanceiro(['contrato-tab:financeiro']), true);
  restore();
});
