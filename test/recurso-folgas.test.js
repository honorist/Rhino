'use strict';
/**
 * Handler de Folgas e Passagens de Recursos (handlers/recurso-folgas.js), com
 * `repos` dublado — nada toca o Postgres.
 *  - addFolga anexa ao JSONB `folgas` do recurso com os sub-objetos de
 *    passagem (ida/volta) já com os defaults zerados;
 *  - comprarPassagem cria OU uma Conta a Pagar OU um lançamento de Caixa
 *    (conforme `tipoLancamento`), e SÓ ENTÃO marca a passagem na folga —
 *    se a atualização do recurso falhar, desfaz o lançamento financeiro já
 *    criado (compensação, evita órfão financeiro sem folga vinculada);
 *  - contractIdPagador só é gravado quando financiadoPor === 'contrato'.
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const repos = require('../db/repos');
const h = require('../handlers/recurso-folgas');

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
  recursos: repos.recursos, contracts: repos.contracts,
  contasPagar: repos.contasPagar, caixa: repos.caixa,
};

let recurso, updates, cpCreated, cpRemoved, caixaCreated, caixaRemoved;

beforeEach(() => {
  updates = [];
  cpCreated = null; cpRemoved = [];
  caixaCreated = null; caixaRemoved = [];
  recurso = {
    id: 'rec1', nome: 'Fulano',
    alocacaoAtual: { contractId: 'ctr1' },
    folgas: [{
      id: 'fol1', dataInicio: '2026-10-01', dataFim: '2026-10-07',
      passagemIda: { comprada: false }, passagemVolta: { comprada: false },
    }],
  };
  repos.recursos = {
    findById: async (id) => (id === 'rec1' ? recurso : null),
    updateById: async (id, patch) => { updates.push({ id, patch }); return { id, ...patch }; },
    findAll: async () => [recurso],
  };
  repos.contracts = { findById: async (id) => (id === 'ctr1' ? { id: 'ctr1', name: 'Obra X' } : null) };
  repos.contasPagar = {
    create: async (c) => { cpCreated = c; return c; },
    removeById: async (id) => { cpRemoved.push(id); return true; },
    findAll: async () => [],
  };
  repos.caixa = {
    create: async (c) => { caixaCreated = c; return c; },
    removeById: async (id) => { caixaRemoved.push(id); return true; },
    findAll: async () => [],
  };
});

function restore() {
  Object.assign(repos, orig);
}

// ---------------- addFolga ----------------

test('addFolga — recurso inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handleAddFolga('recX', { dataInicio: '2026-10-01' }, res);
  assert.equal(res.status, 404);
  restore();
});

test('addFolga — anexa ao JSONB com passagens zeradas por default', async () => {
  const res = fakeRes();
  await h.handleAddFolga('rec1', { dataInicio: '2026-11-01', dataFim: '2026-11-07', observacoes: 'x' }, res);
  assert.equal(res.status, 200);
  const folgas = JSON.parse(updates[0].patch.folgas);
  assert.equal(folgas.length, 2); // a existente + a nova
  const nova = folgas[1];
  assert.equal(nova.dataInicio, '2026-11-01');
  assert.equal(nova.passagemIda.comprada, false);
  assert.equal(nova.passagemVolta.comprada, false);
  restore();
});

// ---------------- deleteFolga ----------------

test('deleteFolga — recurso inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handleDeleteFolga('recX', 'fol1', res);
  assert.equal(res.status, 404);
  restore();
});

test('deleteFolga — remove só a folga com o id informado', async () => {
  recurso.folgas.push({ id: 'fol2', dataInicio: '2026-12-01' });
  const res = fakeRes();
  await h.handleDeleteFolga('rec1', 'fol1', res);
  assert.equal(res.status, 200);
  const folgas = JSON.parse(updates[0].patch.folgas);
  assert.deepEqual(folgas.map((f) => f.id), ['fol2']);
  restore();
});

// ---------------- comprarPassagem ----------------

test('comprarPassagem — recurso inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handleComprarPassagem('recX', 'fol1', { tipo: 'ida', valor: '100' }, res);
  assert.equal(res.status, 404);
  restore();
});

test('comprarPassagem — folga inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handleComprarPassagem('rec1', 'folX', { tipo: 'ida', valor: '100' }, res);
  assert.equal(res.status, 404);
  restore();
});

test('comprarPassagem — tipoLancamento=caixa cria entrada de caixa e marca a passagem', async () => {
  const res = fakeRes();
  await h.handleComprarPassagem('rec1', 'fol1', {
    tipo: 'ida', valor: '350.50', tipoLancamento: 'caixa', financiadoPor: 'empresa',
  }, res);
  assert.equal(res.status, 200);
  assert.ok(caixaCreated);
  assert.equal(caixaCreated.type, 'saida');
  assert.equal(caixaCreated.value, 350.5);
  assert.equal(caixaCreated.contractId, null); // financiadoPor != 'contrato'
  assert.equal(cpCreated, null);
  const folgas = JSON.parse(updates[0].patch.folgas);
  assert.equal(folgas[0].passagemIda.comprada, true);
  assert.equal(folgas[0].passagemIda.caixaEntryId, caixaCreated.id);
  restore();
});

test('comprarPassagem — tipoLancamento=conta_pagar cria CP com vencimento = início da folga', async () => {
  const res = fakeRes();
  await h.handleComprarPassagem('rec1', 'fol1', {
    tipo: 'volta', valor: '200', tipoLancamento: 'conta_pagar', financiadoPor: 'contrato', contractIdPagador: 'ctr1',
  }, res);
  assert.equal(res.status, 200);
  assert.ok(cpCreated);
  assert.equal(cpCreated.valor, 200);
  assert.equal(cpCreated.dataVencimento, '2026-10-01');
  assert.equal(cpCreated.contractId, 'ctr1'); // financiadoPor === 'contrato'
  assert.equal(caixaCreated, null);
  const folgas = JSON.parse(updates[0].patch.folgas);
  assert.equal(folgas[0].passagemVolta.comprada, true);
  assert.equal(folgas[0].passagemVolta.contaPagarId, cpCreated.id);
  restore();
});

test('comprarPassagem — financiadoPor != "contrato" não grava contractId mesmo com contractIdPagador enviado', async () => {
  const res = fakeRes();
  await h.handleComprarPassagem('rec1', 'fol1', {
    tipo: 'ida', valor: '100', tipoLancamento: 'conta_pagar', financiadoPor: 'empresa', contractIdPagador: 'ctr1',
  }, res);
  assert.equal(cpCreated.contractId, null);
  restore();
});

test('comprarPassagem — compensa (remove) o lançamento financeiro se updateById falhar', async () => {
  repos.recursos.updateById = async () => { throw new Error('falha simulada de escrita'); };
  const res = fakeRes();
  await h.handleComprarPassagem('rec1', 'fol1', {
    tipo: 'ida', valor: '100', tipoLancamento: 'caixa', financiadoPor: 'empresa',
  }, res);
  assert.equal(res.status, 400);
  assert.ok(caixaCreated, 'o lançamento foi criado antes da falha');
  assert.deepEqual(caixaRemoved, [caixaCreated.id], 'deve compensar removendo o lançamento órfão');
  restore();
});

test('comprarPassagem — compensa a Conta a Pagar se updateById falhar', async () => {
  repos.recursos.updateById = async () => { throw new Error('falha simulada de escrita'); };
  const res = fakeRes();
  await h.handleComprarPassagem('rec1', 'fol1', {
    tipo: 'volta', valor: '100', tipoLancamento: 'conta_pagar', financiadoPor: 'empresa',
  }, res);
  assert.equal(res.status, 400);
  assert.ok(cpCreated);
  assert.deepEqual(cpRemoved, [cpCreated.id]);
  restore();
});
