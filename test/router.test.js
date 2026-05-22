'use strict';
// node --test test/router.test.js  (sem servidor, sem DB)
//
// Trava o MOTOR de roteamento (lib/router.js) antes de a Fase 2 trocar a
// cadeia de if (pathname === …) do server.js por ele.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRouter, compilePattern } = require('../lib/router');

test('dispatch — casa rota exata e chama o handler', () => {
  const r = createRouter();
  let chamado = false;
  r.get('/api/health', () => { chamado = true; });
  assert.equal(r.dispatch({ method: 'GET', pathname: '/api/health' }), true);
  assert.equal(chamado, true);
});

test('dispatch — método diferente não casa', () => {
  const r = createRouter();
  r.get('/api/health', () => { throw new Error('não deveria chamar'); });
  assert.equal(r.dispatch({ method: 'POST', pathname: '/api/health' }), false);
});

test('dispatch — rota inexistente retorna false', () => {
  const r = createRouter();
  r.get('/api/health', () => {});
  assert.equal(r.dispatch({ method: 'GET', pathname: '/api/nada' }), false);
});

test('dispatch — :param é extraído para ctx.params', () => {
  const r = createRouter();
  let params;
  r.get('/api/contracts/:id', (c) => { params = c.params; });
  r.dispatch({ method: 'GET', pathname: '/api/contracts/abc123' });
  assert.deepEqual(params, ['abc123']);
});

test('dispatch — múltiplos :param na ordem certa', () => {
  const r = createRouter();
  let params;
  r.put('/api/contracts/:cid/rdos/:rid', (c) => { params = c.params; });
  r.dispatch({ method: 'PUT', pathname: '/api/contracts/C1/rdos/R9' });
  assert.deepEqual(params, ['C1', 'R9']);
});

test('dispatch — :param casa só UM segmento (não atravessa "/")', () => {
  const r = createRouter();
  let chamado = false;
  r.get('/api/contracts/:id', () => { chamado = true; });
  assert.equal(r.dispatch({ method: 'GET', pathname: '/api/contracts/a/b' }), false);
  assert.equal(chamado, false);
});

test('dispatch — first-match-wins (ordem de registro)', () => {
  const r = createRouter();
  const ordem = [];
  r.get('/api/x', () => ordem.push('primeira'));
  r.get('/api/x', () => ordem.push('segunda'));
  r.dispatch({ method: 'GET', pathname: '/api/x' });
  assert.deepEqual(ordem, ['primeira']);
});

test('dispatch — handler recebe o ctx original somado de params', () => {
  const r = createRouter();
  let recebido;
  r.post('/api/contracts/:id/saidas', (c) => { recebido = c; });
  r.dispatch({ method: 'POST', pathname: '/api/contracts/C1/saidas', body: { v: 1 }, req: 'REQ' });
  assert.equal(recebido.body.v, 1);
  assert.equal(recebido.req, 'REQ');
  assert.deepEqual(recebido.params, ['C1']);
});

test('compilePattern — metacaractere no caminho literal é escapado', () => {
  const r = createRouter();
  let chamado = false;
  r.get('/api/a.b', () => { chamado = true; });
  assert.equal(r.dispatch({ method: 'GET', pathname: '/api/axb' }), false); // "." literal
  assert.equal(chamado, false);
  assert.equal(r.dispatch({ method: 'GET', pathname: '/api/a.b' }), true);
});

test('dispatch — aceita RegExp como padrão (rotas legadas)', () => {
  const r = createRouter();
  let params;
  r.get(/^\/api\/legacy\/([0-9]+)$/, (c) => { params = c.params; });
  assert.equal(r.dispatch({ method: 'GET', pathname: '/api/legacy/42' }), true);
  assert.deepEqual(params, ['42']);
  assert.equal(r.dispatch({ method: 'GET', pathname: '/api/legacy/abc' }), false);
});

test('add — handler que não é função é rejeitado', () => {
  const r = createRouter();
  assert.throws(() => r.get('/api/x', null), /handler precisa ser função/);
});

test('list — devolve as rotas registradas', () => {
  const r = createRouter();
  r.get('/api/health', () => {});
  r.post('/api/contracts/:id', () => {});
  const l = r.list();
  assert.equal(l.length, 2);
  assert.equal(l[0].method, 'GET');
  assert.equal(l[1].method, 'POST');
});

test('compilePattern — exportada e âncora início/fim', () => {
  const re = compilePattern('/api/x');
  assert.equal(re.test('/api/x'), true);
  assert.equal(re.test('/api/x/extra'), false);
  assert.equal(re.test('prefixo/api/x'), false);
});
