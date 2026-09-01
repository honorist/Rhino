'use strict';
/**
 * @file lib/bus.js — publish() só entrega mutação pros clientes com
 * permissão na rota da entidade (item 7 do plano async-wandering-kite).
 * Singleton real (module.exports = new Bus()) — cada teste conecta seus
 * próprios clientes fake e os desconecta no fim pra não vazar entre testes.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const bus = require('../lib/bus');

function fakeConn() {
  const closeCbs = [];
  const written = [];
  const req = { on: (evt, cb) => evt === 'close' && closeCbs.push(cb) };
  const res = {
    writeHead: () => {},
    write: (chunk) => written.push(chunk),
    on: () => {},
    end: () => {},
  };
  return {
    req,
    res,
    written,
    disconnect: () => closeCbs.forEach((cb) => cb()),
  };
}

function mutationsReceived(written) {
  // Cada evento SSE é 2 chamadas de write: "event: X\n" e "data: ...\n\n".
  const out = [];
  for (let i = 0; i < written.length; i++) {
    if (written[i] === 'event: mutation\n') {
      out.push(JSON.parse(written[i + 1].replace(/^data: /, '').trim()));
    }
  }
  return out;
}

test('publish: cliente sem abas restritas (null) recebe qualquer mutação', () => {
  const c = fakeConn();
  bus.attach(c.req, c.res, { userId: 'u1', abas: null });
  bus.publish({ entity: 'caixa', action: 'update', id: 1 });
  c.disconnect();

  const evs = mutationsReceived(c.written);
  assert.strictEqual(evs.length, 1);
  assert.strictEqual(evs[0].entity, 'caixa');
});

test('publish: cliente com abas restritas NÃO recebe mutação de entidade fora da permissão', () => {
  const c = fakeConn();
  bus.attach(c.req, c.res, { userId: 'u2', abas: ['#/contratos'] }); // não tem #/caixa
  bus.publish({ entity: 'caixa', action: 'update', id: 2 });
  c.disconnect();

  assert.strictEqual(mutationsReceived(c.written).length, 0);
});

test('publish: cliente com a aba certa recebe a mutação daquela entidade', () => {
  const c = fakeConn();
  bus.attach(c.req, c.res, { userId: 'u3', abas: ['#/caixa'] });
  bus.publish({ entity: 'caixa', action: 'create', id: 3 });
  c.disconnect();

  const evs = mutationsReceived(c.written);
  assert.strictEqual(evs.length, 1);
  assert.strictEqual(evs[0].id, 3);
});

test('publish: dois clientes com permissões diferentes recebem seletivamente', () => {
  const permitido = fakeConn();
  const negado = fakeConn();
  bus.attach(permitido.req, permitido.res, { userId: 'u4', abas: ['#/recursos'] });
  bus.attach(negado.req, negado.res, { userId: 'u5', abas: ['#/contratos'] });
  bus.publish({ entity: 'recursos', action: 'update', id: 4 });
  permitido.disconnect();
  negado.disconnect();

  assert.strictEqual(mutationsReceived(permitido.written).length, 1);
  assert.strictEqual(mutationsReceived(negado.written).length, 0);
});

test('publish: evento sem entity é ignorado (não lança, não entrega)', () => {
  const c = fakeConn();
  bus.attach(c.req, c.res, { userId: 'u6', abas: null });
  bus.publish({ action: 'update' }); // sem entity
  bus.publish(null);
  c.disconnect();

  assert.strictEqual(mutationsReceived(c.written).length, 0);
});
