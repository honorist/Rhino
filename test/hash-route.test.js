'use strict';
/**
 * @file js/lib/hash-route.js — split/base de hash com querystring, usado
 * pelo router (matchRoute) e pelo gate de permissão (podeAcessar/podeEditar).
 * Sem isto, um link de drill-down (#/recursos?docs=vencidos) nunca batia a
 * rota nem a permissão — caía sempre em "acesso negado" / primeiraAba().
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const assert = require('node:assert');

function load() {
  const code = fs.readFileSync(path.join(__dirname, '../js/lib/hash-route.js'), 'utf8');
  const sandbox = { window: {}, URLSearchParams };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox.window;
}

const { splitHashQuery, baseHashPath } = load();

// Nota: objetos vêm do realm do vm → comparar propriedades, não deepStrictEqual
// (prototype diferente do Object do realm principal faz deepStrictEqual falhar
// mesmo com conteúdo idêntico).
test('splitHashQuery: sem querystring devolve path intacto e query vazia', () => {
  const r = splitHashQuery('#/recursos');
  assert.strictEqual(r.path, '#/recursos');
  assert.strictEqual(Object.keys(r.query).length, 0);
});

test('splitHashQuery: separa path e query', () => {
  const r = splitHashQuery('#/manutencoes?filtro=atrasadas');
  assert.strictEqual(r.path, '#/manutencoes');
  assert.strictEqual(r.query.filtro, 'atrasadas');
});

test('splitHashQuery: múltiplos params', () => {
  const { path, query } = splitHashQuery('#/recrutamento?filtro=parados&x=1');
  assert.strictEqual(path, '#/recrutamento');
  assert.strictEqual(query.filtro, 'parados');
  assert.strictEqual(query.x, '1');
});

test('splitHashQuery: hash vazio/undefined não lança', () => {
  assert.strictEqual(splitHashQuery('').path, '');
  assert.strictEqual(splitHashQuery(undefined).path, '');
});

test('baseHashPath: rota simples com querystring', () => {
  assert.strictEqual(baseHashPath('#/recursos?docs=vencidos'), '#/recursos');
});

test('baseHashPath: rota de detalhe (com id) usa a permissão da rota pai', () => {
  assert.strictEqual(baseHashPath('#/contratos/ctr_123'), '#/contratos');
});

test('baseHashPath: rota de detalhe COM querystring também reduz à rota pai', () => {
  assert.strictEqual(baseHashPath('#/contratos/ctr_123?tab=evm'), '#/contratos');
});

test('baseHashPath: sem query nem sub-rota devolve o próprio path', () => {
  assert.strictEqual(baseHashPath('#/dashboard'), '#/dashboard');
});
