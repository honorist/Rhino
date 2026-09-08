'use strict';
/**
 * Handler de Clientes (handlers/clientes.js), com `repos` dublado — nada
 * toca o Postgres. Foco na propagação de endereço/coords pra contratos
 * vinculados (PUT) e na ligação com lib/observability.js quando essa
 * propagação falha (antes só virava console.error, invisível).
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const repos = require('../db/repos');
const observability = require('../lib/observability');
const h = require('../handlers/clientes');

function fakeRes() {
  const res = {
    status: null,
    body: null,
    writeHead(s) { res.status = s; },
    end(payload) { res.body = payload ? JSON.parse(payload) : null; },
  };
  return res;
}

const orig = { clientes: repos.clientes, contracts: repos.contracts };
let clienteRow, contratos, captured;

beforeEach(() => {
  clienteRow = { id: 'cli1', nome: 'Acme', lat: '', lng: '', endereco: '' };
  contratos = [{ id: 'ctr1', clientId: 'cli1', lat: '', lng: '', endereco: '' }];
  captured = [];

  repos.clientes = {
    findAll: async () => [clienteRow],
    updateById: async (id, patch) => {
      if (id !== 'cli1') return null;
      Object.assign(clienteRow, patch);
      return clienteRow;
    },
    removeById: async () => true,
  };
  repos.contracts = {
    findAll: async ({ clientId }) => contratos.filter((c) => c.clientId === clientId),
    updateById: async (ctId, patch) => {
      const ct = contratos.find((c) => c.id === ctId);
      if (!ct) throw new Error('falha simulada ao atualizar contrato');
      Object.assign(ct, patch);
      return ct;
    },
  };
  observability.captureError = (err, ctx) => { captured.push({ err, ctx }); };
});

function restore() { Object.assign(repos, { clientes: orig.clientes, contracts: orig.contracts }); }

test('PUT — cliente inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handlePutCliente('naoexiste', { nome: 'X' }, res);
  assert.equal(res.status, 404);
  restore();
});

test('PUT — sem lat/lng não tenta propagar pros contratos', async () => {
  const res = fakeRes();
  await h.handlePutCliente('cli1', { nome: 'Acme Ltda' }, res);
  assert.equal(res.status, 200);
  assert.equal(contratos[0].lat, '');
  assert.equal(captured.length, 0);
  restore();
});

test('PUT — com lat/lng propaga pros contratos sem coordenadas', async () => {
  const res = fakeRes();
  await h.handlePutCliente('cli1', { lat: '-20.5', lng: '-51.4', endereco: 'Rua X' }, res);
  assert.equal(res.status, 200);
  assert.equal(contratos[0].lat, '-20.5');
  assert.equal(contratos[0].endereco, 'Rua X');
  assert.equal(captured.length, 0);
  restore();
});

test('PUT — contrato que já tem coordenada própria não é sobrescrito', async () => {
  contratos[0].lat = '-10'; contratos[0].lng = '-10'; contratos[0].endereco = 'Já tinha';
  const res = fakeRes();
  await h.handlePutCliente('cli1', { lat: '-20.5', lng: '-51.4', endereco: 'Rua X' }, res);
  assert.equal(contratos[0].lat, '-10');
  assert.equal(contratos[0].endereco, 'Já tinha');
  restore();
});

test('PUT — falha ao propagar endereço é reportada pra observability, sem quebrar a resposta', async () => {
  const origUpdateById = repos.contracts.updateById;
  repos.contracts.updateById = async () => { throw new Error('falha simulada ao atualizar contrato'); };
  const res = fakeRes();
  await h.handlePutCliente('cli1', { lat: '-20.5', lng: '-51.4' }, res);
  assert.equal(res.status, 200, 'a atualização do cliente ainda funciona — só o alerta é novo');
  assert.equal(captured.length, 1);
  assert.match(captured[0].err.message, /falha simulada/);
  assert.equal(captured[0].ctx.clienteId, 'cli1');
  repos.contracts.updateById = origUpdateById;
  restore();
});
