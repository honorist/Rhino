'use strict';
// node --test test/fluxo-compra.test.js  (sem servidor, sem DB)
//
// Regra: fluxo de Solicitação de Compra — máquina de estados das 5 etapas.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fc = require('../lib/fluxo-compra');

test('ETAPAS — fluxo feliz nas 5 etapas, em ordem', () => {
  assert.deepEqual(fc.ETAPAS,
    ['pendente_avaliacao', 'pendente_aprovacao', 'aprovada', 'comprada', 'recebida']);
});

test('avaliar — só a partir de pendente_avaliacao → pendente_aprovacao', () => {
  assert.equal(fc.podeTransicionar('pendente_avaliacao', 'avaliar'), true);
  assert.equal(fc.proximoStatus('pendente_avaliacao', 'avaliar'), 'pendente_aprovacao');
  assert.equal(fc.podeTransicionar('pendente_aprovacao', 'avaliar'), false);
  assert.equal(fc.podeTransicionar('aprovada', 'avaliar'), false);
});

test('aprovar — só a partir de pendente_aprovacao → aprovada', () => {
  assert.equal(fc.podeTransicionar('pendente_aprovacao', 'aprovar'), true);
  assert.equal(fc.proximoStatus('pendente_aprovacao', 'aprovar'), 'aprovada');
  assert.equal(fc.podeTransicionar('pendente_avaliacao', 'aprovar'), false);
  assert.equal(fc.podeTransicionar('aprovada', 'aprovar'), false);
});

test('rejeitar — só a partir de pendente_aprovacao → rejeitada', () => {
  assert.equal(fc.podeTransicionar('pendente_aprovacao', 'rejeitar'), true);
  assert.equal(fc.proximoStatus('pendente_aprovacao', 'rejeitar'), 'rejeitada');
  assert.equal(fc.podeTransicionar('pendente_avaliacao', 'rejeitar'), false);
});

test('comprar — só a partir de aprovada → comprada', () => {
  assert.equal(fc.podeTransicionar('aprovada', 'comprar'), true);
  assert.equal(fc.proximoStatus('aprovada', 'comprar'), 'comprada');
  assert.equal(fc.podeTransicionar('pendente_aprovacao', 'comprar'), false);
});

test('receber — só a partir de comprada → recebida', () => {
  assert.equal(fc.podeTransicionar('comprada', 'receber'), true);
  assert.equal(fc.proximoStatus('comprada', 'receber'), 'recebida');
  assert.equal(fc.podeTransicionar('aprovada', 'receber'), false);
});

test('cancelar — permitido em qualquer status, exceto aprovada e cancelada', () => {
  for (const s of ['pendente_avaliacao', 'pendente_aprovacao', 'comprada', 'recebida', 'rejeitada']) {
    assert.equal(fc.podeTransicionar(s, 'cancelar'), true, `deveria poder cancelar de ${s}`);
  }
  assert.equal(fc.podeTransicionar('aprovada', 'cancelar'), false);
  assert.equal(fc.podeTransicionar('cancelada', 'cancelar'), false);
});

test('proximoStatus — transição inválida retorna null', () => {
  assert.equal(fc.proximoStatus('aprovada', 'avaliar'), null);
  assert.equal(fc.proximoStatus('recebida', 'comprar'), null);
});

test('podeTransicionar — ação desconhecida retorna false', () => {
  assert.equal(fc.podeTransicionar('pendente_avaliacao', 'inventada'), false);
});

test('isTerminal — recebida, rejeitada e cancelada são terminais', () => {
  assert.equal(fc.isTerminal('recebida'), true);
  assert.equal(fc.isTerminal('rejeitada'), true);
  assert.equal(fc.isTerminal('cancelada'), true);
  assert.equal(fc.isTerminal('aprovada'), false);
  assert.equal(fc.isTerminal('pendente_avaliacao'), false);
});
