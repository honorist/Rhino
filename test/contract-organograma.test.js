'use strict';
/**
 * Orquestração do handler de organograma (handlers/contract-organograma.js),
 * com `repos` dublado — nada toca o Postgres.
 *  - POST valida hierarquia (encarregado único, líder precisa de área,
 *    profissional precisa de supervisor líder_area) antes de criar;
 *  - PUT faz merge parcial do body sobre o membro atual antes de revalidar;
 *  - DELETE trata encarregado (bloqueado se houver líderes), líder_area
 *    (bloqueado com subordinados em modo strict; reassign/cascade liberam) e
 *    profissional (remoção direta).
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const repos = require('../db/repos');
const h = require('../handlers/contract-organograma');

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

const orig = { contracts: repos.contracts, organograma: repos.organograma };

let organograma; // lista viva do contrato C1
let created, updates, removed;

beforeEach(() => {
  organograma = [
    { id: 'enc1', contractId: 'C1', recursoId: 'r-enc', nivel: 'encarregado', supervisorId: null, area: null },
    { id: 'lid1', contractId: 'C1', recursoId: 'r-lid', nivel: 'lider_area', supervisorId: null, area: 'Elétrica' },
  ];
  created = null;
  updates = [];
  removed = [];

  repos.contracts = {
    findByIdWithChildren: async (id) => (id === 'C1' ? { id: 'C1', organograma } : null),
    getEnvelope: async () => ({ contracts: [] }),
  };
  repos.organograma = {
    create: async (data) => {
      created = data;
      organograma.push(data);
      return data;
    },
    updateById: async (id, patch) => {
      updates.push({ id, patch });
      const m = organograma.find((x) => x.id === id);
      if (m) Object.assign(m, patch);
      return m;
    },
    removeById: async (id) => {
      removed.push(id);
      organograma = organograma.filter((x) => x.id !== id);
      return true;
    },
  };
});

function restore() {
  Object.assign(repos, { contracts: orig.contracts, organograma: orig.organograma });
}

// ---------------- POST ----------------

test('POST — contrato inexistente devolve 404 e não cria', async () => {
  const res = fakeRes();
  await h.handlePostMembroOrganograma('CX', { nivel: 'profissional', recursoId: 'rX' }, res);
  assert.equal(res.status, 404);
  assert.equal(created, null);
  restore();
});

test('POST — nível inválido devolve 400', async () => {
  const res = fakeRes();
  await h.handlePostMembroOrganograma('C1', { nivel: 'gerente', recursoId: 'rX' }, res);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /Nível inválido/);
  restore();
});

test('POST — recurso sem id devolve 400', async () => {
  const res = fakeRes();
  await h.handlePostMembroOrganograma('C1', { nivel: 'profissional', supervisorId: 'lid1' }, res);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /Recurso obrigatório/);
  restore();
});

test('POST — recurso já alocado no organograma devolve 400', async () => {
  const res = fakeRes();
  await h.handlePostMembroOrganograma('C1', { nivel: 'profissional', recursoId: 'r-lid', supervisorId: 'lid1' }, res);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /já faz parte/);
  restore();
});

test('POST — segundo encarregado no mesmo contrato devolve 400', async () => {
  const res = fakeRes();
  await h.handlePostMembroOrganograma('C1', { nivel: 'encarregado', recursoId: 'r-novo' }, res);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /Já existe um encarregado/);
  restore();
});

test('POST — líder de área sem área devolve 400', async () => {
  const res = fakeRes();
  await h.handlePostMembroOrganograma('C1', { nivel: 'lider_area', recursoId: 'r-novo' }, res);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /Área é obrigatória/);
  restore();
});

test('POST — profissional sem supervisor devolve 400', async () => {
  const res = fakeRes();
  await h.handlePostMembroOrganograma('C1', { nivel: 'profissional', recursoId: 'r-novo' }, res);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /precisa ter um supervisor/);
  restore();
});

test('POST — profissional com supervisor que não é líder_area devolve 400', async () => {
  const res = fakeRes();
  await h.handlePostMembroOrganograma('C1', { nivel: 'profissional', recursoId: 'r-novo', supervisorId: 'enc1' }, res);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /deve ser Líder de Área/);
  restore();
});

test('POST — profissional válido é criado com supervisorId preservado', async () => {
  const res = fakeRes();
  await h.handlePostMembroOrganograma('C1', { nivel: 'profissional', recursoId: 'r-novo', supervisorId: 'lid1', cargo: 'Eletricista' }, res);
  assert.equal(res.status, 200);
  assert.equal(created.nivel, 'profissional');
  assert.equal(created.supervisorId, 'lid1');
  assert.equal(created.area, null);
  restore();
});

test('POST — encarregado criado força supervisorId null mesmo se enviado', async () => {
  organograma.length = 0; // sem encarregado ainda
  const res = fakeRes();
  await h.handlePostMembroOrganograma('C1', { nivel: 'encarregado', recursoId: 'r-novo', supervisorId: 'algo' }, res);
  assert.equal(res.status, 200);
  assert.equal(created.supervisorId, null);
  restore();
});

// ---------------- PUT ----------------

test('PUT — contrato inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handlePutMembroOrganograma('CX', 'lid1', { cargo: 'X' }, res);
  assert.equal(res.status, 404);
  restore();
});

test('PUT — membro inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handlePutMembroOrganograma('C1', 'naoexiste', { cargo: 'X' }, res);
  assert.equal(res.status, 404);
  restore();
});

test('PUT — merge parcial preserva campos não enviados e revalida', async () => {
  const res = fakeRes();
  await h.handlePutMembroOrganograma('C1', 'lid1', { cargo: 'Líder Sênior' }, res);
  assert.equal(res.status, 200);
  assert.equal(updates[0].id, 'lid1');
  assert.equal(updates[0].patch.cargo, 'Líder Sênior');
  assert.equal(updates[0].patch.area, 'Elétrica'); // preservado do atual
  restore();
});

test('PUT — mudar líder_area para sem área devolve 400 (revalida com merge)', async () => {
  const res = fakeRes();
  await h.handlePutMembroOrganograma('C1', 'lid1', { area: '' }, res);
  assert.equal(res.status, 400);
  assert.equal(updates.length, 0);
  restore();
});

// ---------------- DELETE ----------------

test('DELETE — contrato inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handleDeleteMembroOrganograma('CX', 'lid1', {}, res, {});
  assert.equal(res.status, 404);
  restore();
});

test('DELETE — membro inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handleDeleteMembroOrganograma('C1', 'naoexiste', {}, res, {});
  assert.equal(res.status, 404);
  restore();
});

test('DELETE — encarregado com líderes no organograma devolve 409 e não remove', async () => {
  const res = fakeRes();
  await h.handleDeleteMembroOrganograma('C1', 'enc1', {}, res, {});
  assert.equal(res.status, 409);
  assert.equal(removed.length, 0);
  restore();
});

test('DELETE — encarregado sem líderes é removido', async () => {
  organograma = organograma.filter((m) => m.nivel !== 'lider_area');
  repos.contracts.findByIdWithChildren = async () => ({ id: 'C1', organograma });
  // getEnvelope já dublado no beforeEach — findByIdWithChildren é substituído
  // isoladamente para refletir a lista filtrada acima.
  const res = fakeRes();
  await h.handleDeleteMembroOrganograma('C1', 'enc1', {}, res, {});
  assert.equal(res.status, 200);
  assert.deepEqual(removed, ['enc1']);
  restore();
});

test('DELETE — líder_area com subordinados em modo strict (default) devolve 409 sem remover', async () => {
  organograma.push({ id: 'prof1', contractId: 'C1', recursoId: 'r-prof', nivel: 'profissional', supervisorId: 'lid1', area: null });
  const res = fakeRes();
  await h.handleDeleteMembroOrganograma('C1', 'lid1', {}, res, {});
  assert.equal(res.status, 409);
  assert.equal(res.body.subordinadosCount, 1);
  assert.equal(removed.length, 0);
  restore();
});

test('DELETE — líder_area modo reassign com destino inválido devolve 400', async () => {
  organograma.push({ id: 'prof1', contractId: 'C1', recursoId: 'r-prof', nivel: 'profissional', supervisorId: 'lid1', area: null });
  const res = fakeRes();
  await h.handleDeleteMembroOrganograma('C1', 'lid1', {}, res, { mode: 'reassign', reassignTo: 'naoexiste' });
  assert.equal(res.status, 400);
  assert.equal(removed.length, 0);
  restore();
});

test('DELETE — líder_area modo reassign move subordinados e remove o líder', async () => {
  organograma.push(
    { id: 'lid2', contractId: 'C1', recursoId: 'r-lid2', nivel: 'lider_area', supervisorId: null, area: 'Civil' },
    { id: 'prof1', contractId: 'C1', recursoId: 'r-prof', nivel: 'profissional', supervisorId: 'lid1', area: null },
  );
  const res = fakeRes();
  await h.handleDeleteMembroOrganograma('C1', 'lid1', {}, res, { mode: 'reassign', reassignTo: 'lid2' });
  assert.equal(res.status, 200);
  assert.deepEqual(updates, [{ id: 'prof1', patch: { supervisorId: 'lid2' } }]);
  assert.deepEqual(removed, ['lid1']);
  restore();
});

test('DELETE — líder_area modo cascade remove subordinados e o líder', async () => {
  organograma.push({ id: 'prof1', contractId: 'C1', recursoId: 'r-prof', nivel: 'profissional', supervisorId: 'lid1', area: null });
  const res = fakeRes();
  await h.handleDeleteMembroOrganograma('C1', 'lid1', {}, res, { mode: 'cascade' });
  assert.equal(res.status, 200);
  assert.deepEqual(removed.sort(), ['lid1', 'prof1']);
  restore();
});

test('DELETE — profissional é removido diretamente', async () => {
  organograma.push({ id: 'prof1', contractId: 'C1', recursoId: 'r-prof', nivel: 'profissional', supervisorId: 'lid1', area: null });
  const res = fakeRes();
  await h.handleDeleteMembroOrganograma('C1', 'prof1', {}, res, {});
  assert.equal(res.status, 200);
  assert.deepEqual(removed, ['prof1']);
  restore();
});
