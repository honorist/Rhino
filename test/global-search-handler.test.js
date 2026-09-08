'use strict';
/**
 * Busca global (Cmd/Ctrl+K → /api/search, handlers/platform.js#handleGlobalSearch)
 * — sem cobertura de camada HTTP antes desta mudança. `repos` dublado — nada
 * toca o Postgres.
 *
 * Nota: o item 16 do backlog ("busca global não busca dados de negócio, só
 * nomes de tela") já estava resolvido no código — o command palette
 * (js/polish.js, comentário "M3") já soma resultados remotos deste endpoint,
 * e este handler já varre Contratos/Clientes/Fornecedores/Contas a
 * Pagar/Notas Fiscais/Recursos. Só faltava a cobertura de teste, que é o que
 * este arquivo adiciona.
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const repos = require('../db/repos');
const h = require('../handlers/platform');

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
  contracts: repos.contracts, clientes: repos.clientes, fornecedores: repos.fornecedores,
  contasPagar: repos.contasPagar, notasFiscais: repos.notasFiscais, recursos: repos.recursos,
};

beforeEach(() => {
  repos.contracts = { findAll: async () => [{ id: 'ctr1', name: 'Obra Ipatinga', client: 'Usiminas' }] };
  repos.clientes = { findAll: async () => [{ id: 'cli1', nome: 'Usiminas SA', email: 'contato@usiminas.com' }] };
  repos.fornecedores = { findAll: async () => [{ id: 'for1', nome: 'Aço Forte Ltda', cnpj: '11222333000144' }] };
  repos.contasPagar = { findAll: async () => [{ id: 'cp1', descricao: 'Aluguel de guindaste', fornecedor: 'Locadora X' }] };
  repos.notasFiscais = { findAll: async () => [{ id: 'nf1', numero: 'NF-9001', descricao: 'Serviço de solda' }] };
  repos.recursos = { findAll: async () => [{ id: 'rec1', name: 'João da Silva', role: 'Soldador' }] };
});

function restore() { Object.assign(repos, orig); }

test('query vazia devolve results vazio, sem consultar nada', async () => {
  const res = fakeRes();
  await h.handleGlobalSearch({ q: '' }, res);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.results, []);
  restore();
});

test('query com 1 caractere é ignorada (mínimo de 2)', async () => {
  const res = fakeRes();
  await h.handleGlobalSearch({ q: 'a' }, res);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.results, []);
  restore();
});

test('busca por nome de contrato encontra o contrato', async () => {
  const res = fakeRes();
  await h.handleGlobalSearch({ q: 'ipatinga' }, res);
  assert.equal(res.status, 200);
  assert.equal(res.body.results.length, 1);
  assert.equal(res.body.results[0].kind, 'Contrato');
  assert.equal(res.body.results[0].hash, '#/contratos/ctr1');
  restore();
});

test('busca é case-insensitive e acha por substring em qualquer campo mapeado', async () => {
  const res = fakeRes();
  await h.handleGlobalSearch({ q: 'USIMINAS' }, res);
  assert.equal(res.status, 200);
  const kinds = res.body.results.map((r) => r.kind).sort();
  assert.deepEqual(kinds, ['Cliente', 'Contrato']);
  restore();
});

test('busca por CNPJ encontra o fornecedor', async () => {
  const res = fakeRes();
  await h.handleGlobalSearch({ q: '11222333' }, res);
  assert.equal(res.status, 200);
  assert.equal(res.body.results.length, 1);
  assert.equal(res.body.results[0].kind, 'Fornecedor');
  restore();
});

test('busca cobre conta a pagar, nota fiscal e recurso', async () => {
  const res1 = fakeRes();
  await h.handleGlobalSearch({ q: 'guindaste' }, res1);
  assert.equal(res1.body.results[0].kind, 'Conta a Pagar');

  const res2 = fakeRes();
  await h.handleGlobalSearch({ q: 'nf-9001' }, res2);
  assert.equal(res2.body.results[0].kind, 'Nota Fiscal');

  const res3 = fakeRes();
  await h.handleGlobalSearch({ q: 'soldador' }, res3);
  assert.equal(res3.body.results[0].kind, 'Recurso');
  restore();
});

test('sem correspondência devolve results vazio', async () => {
  const res = fakeRes();
  await h.handleGlobalSearch({ q: 'nada-disso-existe' }, res);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.results, []);
  restore();
});

test('falha em UM repo não derruba a busca inteira (safe wrapper)', async () => {
  repos.contracts = { findAll: async () => { throw new Error('boom'); } };
  const res = fakeRes();
  await h.handleGlobalSearch({ q: 'usiminas' }, res);
  assert.equal(res.status, 200);
  assert.equal(res.body.results.length, 1);
  assert.equal(res.body.results[0].kind, 'Cliente');
  restore();
});

test('resultados são limitados a 50, mas count reporta o total real', async () => {
  repos.clientes = {
    findAll: async () => Array.from({ length: 60 }, (_, i) => ({ id: 'c' + i, nome: 'Cliente Teste ' + i })),
  };
  const res = fakeRes();
  await h.handleGlobalSearch({ q: 'cliente teste' }, res);
  assert.equal(res.status, 200);
  assert.equal(res.body.results.length, 50);
  assert.equal(res.body.count, 60);
  restore();
});
