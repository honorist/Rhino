'use strict';
/**
 * @file handlers/propostas.js — sanitização dos campos de texto rico
 * (objetivo, saudação, observações, itens de escopo/obrigações) na escrita
 * (POST/PUT), com `repos`/`db` dublados — nada toca o Postgres.
 *
 * `titulo`/`clienteEmpresa`/itens `.titulo` NÃO são texto rico — continuam
 * passando intactos (ficam texto puro, escapados na leitura por
 * lib/proposta-html.js, fora do escopo desta mudança).
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const db = require('../db');
const repos = require('../db/repos');
const observability = require('../lib/observability');
const h = require('../handlers/propostas');

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
  propostas: repos.propostas,
  clientes: repos.clientes,
  contracts: repos.contracts,
};
let updatedPatch, createdPayload;

beforeEach(() => {
  updatedPatch = null;
  createdPayload = null;
  repos.propostas = {
    updateById: async (id, patch) => { updatedPatch = patch; return { id, contratoId: null }; },
    findByIdWithChildren: async (id) => ({ id, objetivo: '', escopo: [] }),
    createWithContract: async (body) => { createdPayload = body; return { proposta: { id: 'prop1' }, contract: { id: 'ctr1' } }; },
    getEnvelope: async () => ({ propostas: [] }),
  };
  repos.clientes = { findById: async () => null };
  repos.contracts = { updateById: async () => {} };
});

function restore() {
  Object.assign(repos, orig);
}

const XSS = '<script>alert(1)</script>';

// ---------------- PUT ----------------

test('PUT: objetivo/saudacao/observacoes com <script> saem sanitizados antes de ir pro repo', async () => {
  const res = fakeRes();
  await h.handlePutProposta('prop1', {
    objetivo: `<p>ok</p>${XSS}`,
    saudacao: `<strong>oi</strong>${XSS}`,
    observacoes: `<em>nota</em>${XSS}`,
  }, res);
  assert.equal(res.status, 200);
  assert.ok(!updatedPatch.objetivo.includes('<script'));
  assert.ok(updatedPatch.objetivo.includes('<p>ok</p>'));
  assert.ok(!updatedPatch.saudacao.includes('<script'));
  assert.ok(updatedPatch.saudacao.includes('<strong>oi</strong>'));
  assert.ok(!updatedPatch.observacoes.includes('<script'));
  restore();
});

test('PUT: itens de escopo/obrigações têm .texto sanitizado, .titulo/.incluso preservados intactos', async () => {
  const res = fakeRes();
  await h.handlePutProposta('prop1', {
    escopo: [{ id: 'e1', texto: `<p>bom</p>${XSS}`, incluso: true }],
    obrigacoesContratada: [{ id: 'o1', titulo: `<b>Cabecalho</b>`, texto: `<u>ok</u>${XSS}` }],
    obrigacoesContratante: [],
  }, res);
  assert.equal(res.status, 200);
  const escopo = JSON.parse(updatedPatch.escopo);
  assert.ok(!escopo[0].texto.includes('<script'));
  assert.ok(escopo[0].texto.includes('<p>bom</p>'));
  assert.equal(escopo[0].incluso, true);
  const obg = JSON.parse(updatedPatch.obrigacoesContratada);
  assert.ok(!obg[0].texto.includes('<script'));
  assert.ok(obg[0].texto.includes('<u>ok</u>'));
  // titulo do item NÃO é sanitizado como rich text (é <input> de texto puro)
  assert.equal(obg[0].titulo, '<b>Cabecalho</b>');
  restore();
});

test('PUT: campos que continuam texto puro (titulo, clienteEmpresa) não são tocados pelo sanitizador', async () => {
  const res = fakeRes();
  await h.handlePutProposta('prop1', {
    titulo: `Proposta ${XSS}`,
    clienteEmpresa: `Acme ${XSS}`,
  }, res);
  assert.equal(res.status, 200);
  // continuam intactos aqui — a defesa desses campos é escapar na leitura (proposta-html.js), não sanitizar na escrita
  assert.equal(updatedPatch.titulo, `Proposta ${XSS}`);
  assert.equal(updatedPatch.clienteEmpresa, `Acme ${XSS}`);
  restore();
});

test('PUT: campo ausente no body não aparece no patch (allowlist parcial continua funcionando)', async () => {
  const res = fakeRes();
  await h.handlePutProposta('prop1', { titulo: 'Só isso' }, res);
  assert.equal(res.status, 200);
  assert.ok(!('objetivo' in updatedPatch));
  assert.ok(!('escopo' in updatedPatch));
  restore();
});

// ---------------- POST ----------------

test('POST: objetivo/saudacao/observacoes com <script> saem sanitizados antes de criar', async () => {
  const res = fakeRes();
  await h.handlePostProposta({
    titulo: 'Nova proposta',
    clienteEmpresa: 'Acme',
    objetivo: `<p>ok</p>${XSS}`,
    saudacao: `<strong>oi</strong>${XSS}`,
    observacoes: `<em>nota</em>${XSS}`,
  }, res);
  assert.equal(res.status, 200);
  assert.ok(!createdPayload.objetivo.includes('<script'));
  assert.ok(createdPayload.objetivo.includes('<p>ok</p>'));
  assert.ok(!createdPayload.saudacao.includes('<script'));
  assert.ok(!createdPayload.observacoes.includes('<script'));
  restore();
});

test('POST: itens de escopo/obrigações têm .texto sanitizado na criação', async () => {
  const res = fakeRes();
  await h.handlePostProposta({
    titulo: 'Nova proposta',
    clienteEmpresa: 'Acme',
    escopo: [{ id: 'e1', texto: `<p>bom</p>${XSS}` }],
  }, res);
  assert.equal(res.status, 200);
  assert.ok(!createdPayload.escopo[0].texto.includes('<script'));
  assert.ok(createdPayload.escopo[0].texto.includes('<p>bom</p>'));
  restore();
});

// ---------------- observability (sincronização silenciosa com contrato) ----------------

test('PUT: falha ao sincronizar valorTotal com o contrato vinculado é reportada pra observability', async () => {
  repos.propostas.updateById = async (id, patch) => { updatedPatch = patch; return { id, contratoId: 'ctr1' }; };
  repos.contracts.updateById = async () => { throw new Error('falha simulada ao sincronizar contrato'); };
  const captured = [];
  const origCaptureError = observability.captureError;
  observability.captureError = (err, ctx) => { captured.push({ err, ctx }); };

  const res = fakeRes();
  await h.handlePutProposta('prop1', { valorTotal: 5000 }, res);

  assert.equal(res.status, 200, 'a proposta ainda é salva com sucesso — só o alerta é novo');
  assert.equal(captured.length, 1);
  assert.match(captured[0].err.message, /sincronizar contrato/);
  assert.equal(captured[0].ctx.contratoId, 'ctr1');

  observability.captureError = origCaptureError;
  restore();
});

test('DELETE: falha ao desvincular o contrato é reportada pra observability, sem impedir a exclusão', async () => {
  repos.propostas.findById = async (id) => (id === 'prop1' ? { id, contratoId: 'ctr1' } : null);
  let removed = false;
  repos.propostas.removeById = async () => { removed = true; };
  const origDbQuery = db.query;
  db.query = async () => { throw new Error('falha simulada ao desvincular'); };
  const captured = [];
  const origCaptureError = observability.captureError;
  observability.captureError = (err, ctx) => { captured.push({ err, ctx }); };

  const res = fakeRes();
  await h.handleDeleteProposta('prop1', res);

  assert.equal(res.status, 200);
  assert.equal(removed, true, 'a proposta ainda é removida — só o alerta é novo');
  assert.equal(captured.length, 1);
  assert.match(captured[0].err.message, /desvincular/);
  assert.equal(captured[0].ctx.contratoId, 'ctr1');

  db.query = origDbQuery;
  observability.captureError = origCaptureError;
  restore();
});

// ---------------- validação de valorTotal (não zerar em silêncio) ----------------

test('PUT: valorTotal inválido devolve 400 em vez de zerar em silêncio', async () => {
  const res = fakeRes();
  await h.handlePutProposta('prop1', { valorTotal: 'não é número' }, res);
  assert.equal(res.status, 400);
  assert.equal(updatedPatch, null, 'não deve ter chegado a chamar updateById com valor errado');
  restore();
});

test('PUT: valorTotal negativo devolve 400', async () => {
  const res = fakeRes();
  await h.handlePutProposta('prop1', { valorTotal: -100 }, res);
  assert.equal(res.status, 400);
  restore();
});

test('PUT: valorTotal válido continua funcionando normalmente', async () => {
  const res = fakeRes();
  await h.handlePutProposta('prop1', { valorTotal: 15000.5 }, res);
  assert.equal(res.status, 200);
  assert.equal(updatedPatch.valorTotal, 15000.5);
  restore();
});
