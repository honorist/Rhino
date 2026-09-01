'use strict';
/**
 * Handler do canal de Sugestões (handlers/sugestoes.js), com `db`/`repos`/
 * `perms` dublados — nada toca o Postgres, upload de anexo simulado via
 * test/helpers/multipart.js.
 *  - criar: exige título/descrição, sempre começa 'pendente' com histórico
 *    de 1 entrada; notificar gestores nunca deve travar a resposta principal
 *    mesmo se a query de gestores falhar (try/catch isolado);
 *  - listar: gerente vê tudo (com filtro de status opcional); não-gerente
 *    só vê as próprias + o backlog aprovado (query SQL restrita);
 *  - mudarStatus: só gerente; status fora da allowlist → 400; descarte exige
 *    justificativa; grava histórico append-only;
 *  - excluir: só gerente, 404 se a sugestão não existir;
 *  - anexo: 1 foto por sugestão, substitui a anterior (DELETE + INSERT).
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const db = require('../db');
const repos = require('../db/repos');
const perms = require('../lib/permissions');
const h = require('../handlers/sugestoes');
const { fakeMultipartReq, PNG_BYTES, INVALID_IMAGE_BYTES } = require('./helpers/multipart');

function fakeRes() {
  const res = {
    status: null,
    body: null,
    headers: null,
    writeHead(s, hd) { res.status = s; res.headers = hd; },
    end(payload) { res.body = Buffer.isBuffer(payload) ? payload : (payload ? JSON.parse(payload) : null); },
  };
  return res;
}

const orig = { getMany: db.getMany, getOne: db.getOne, query: db.query, sugestoes: repos.sugestoes, notificacoes: repos.notificacoes, can: perms.can };
let sugestoesStore, notifCreates, dbQueries, podeGerirValue;

beforeEach(() => {
  notifCreates = [];
  dbQueries = [];
  podeGerirValue = true;
  sugestoesStore = {
    sug1: { id: 'sug1', autorId: 'u1', titulo: 'Melhorar RDO', status: 'pendente', historico: [{ de: null, para: 'pendente' }], justificativaDescarte: null },
  };
  db.getMany = async () => [];
  db.getOne = async () => null;
  db.query = async (sql, params) => { dbQueries.push({ sql, params }); return { rows: [] }; };
  repos.sugestoes = {
    create: async (data) => { sugestoesStore[data.id] = data; return data; },
    findAll: async (f) => Object.values(sugestoesStore).filter((s) => !f || !f.status || s.status === f.status),
    findById: async (id) => sugestoesStore[id] || null,
    updateById: async (id, patch) => { Object.assign(sugestoesStore[id], patch); return sugestoesStore[id]; },
    removeById: async (id) => { delete sugestoesStore[id]; return true; },
  };
  repos.notificacoes = { create: async (n) => { notifCreates.push(n); return n; } };
  perms.can = async () => podeGerirValue;
});

function restore() {
  Object.assign(db, { getMany: orig.getMany, getOne: orig.getOne, query: orig.query });
  Object.assign(repos, { sugestoes: orig.sugestoes, notificacoes: orig.notificacoes });
  Object.assign(perms, { can: orig.can });
}

function waitEnd(req) {
  return new Promise((resolve) => req.once('end', () => setImmediate(resolve)));
}

// ---------------- criar ----------------

test('criar — sem usuário autenticado devolve 401', async () => {
  const res = fakeRes();
  await h.criar({ user: null }, { titulo: 'X', descricao: 'Y' }, res);
  assert.equal(res.status, 401);
  restore();
});

test('criar — sem título devolve 400', async () => {
  const res = fakeRes();
  await h.criar({ user: { id: 'u1' } }, { descricao: 'Y' }, res);
  assert.equal(res.status, 400);
  restore();
});

test('criar — sem descrição devolve 400', async () => {
  const res = fakeRes();
  await h.criar({ user: { id: 'u1' } }, { titulo: 'X' }, res);
  assert.equal(res.status, 400);
  restore();
});

test('criar — erro ao gravar a sugestão devolve 400', async () => {
  repos.sugestoes.create = async () => { throw new Error('falha simulada de escrita'); };
  const res = fakeRes();
  await h.criar({ user: { id: 'u1' } }, { titulo: 'X', descricao: 'Y' }, res);
  assert.equal(res.status, 400);
  restore();
});

test('listar — erro de query devolve 500', async () => {
  repos.sugestoes.findAll = async () => { throw new Error('falha simulada de query'); };
  const res = fakeRes();
  await h.listar({ user: { id: 'u1' }, query: {} }, res);
  assert.equal(res.status, 500);
  restore();
});

test('mudarStatus — erro ao gravar devolve 400', async () => {
  repos.sugestoes.updateById = async () => { throw new Error('falha simulada de escrita'); };
  const res = fakeRes();
  await h.mudarStatus({ user: { id: 'gestor1' } }, { status: 'em_analise' }, res, 'sug1');
  assert.equal(res.status, 400);
  restore();
});

test('excluir — erro ao remover devolve 400', async () => {
  repos.sugestoes.removeById = async () => { throw new Error('falha simulada de escrita'); };
  const res = fakeRes();
  await h.excluir({ user: { id: 'gestor1' } }, res, 'sug1');
  assert.equal(res.status, 400);
  restore();
});

test('criar — sucesso começa "pendente" com histórico de 1 entrada', async () => {
  const res = fakeRes();
  await h.criar({ user: { id: 'u1', name: 'Fulano' } }, { titulo: 'Nova ideia', descricao: 'Detalhe' }, res);
  assert.equal(res.status, 200);
  assert.ok(res.body.id);
  const criada = sugestoesStore[res.body.id];
  assert.equal(criada.status, 'pendente');
  const historico = JSON.parse(criada.historico);
  assert.equal(historico.length, 1);
  assert.equal(historico[0].para, 'pendente');
  restore();
});

test('criar — falha ao notificar gestores não bloqueia a resposta principal', async () => {
  db.getMany = async () => { throw new Error('falha simulada de query'); };
  const res = fakeRes();
  await h.criar({ user: { id: 'u1', name: 'Fulano' } }, { titulo: 'X', descricao: 'Y' }, res);
  assert.equal(res.status, 200);
  restore();
});

// ---------------- listar ----------------

test('listar — sem usuário autenticado devolve 401', async () => {
  const res = fakeRes();
  await h.listar({ user: null }, res);
  assert.equal(res.status, 401);
  restore();
});

test('listar — gerente vê todas (findAll sem filtro por default)', async () => {
  sugestoesStore.sug2 = { id: 'sug2', autorId: 'u2', status: 'aprovada' };
  const res = fakeRes();
  await h.listar({ user: { id: 'u1' }, query: {} }, res);
  assert.equal(res.status, 200);
  assert.equal(res.body.podeGerir, true);
  assert.equal(res.body.sugestoes.length, 2);
  restore();
});

test('listar — gerente com filtro de status válido restringe o findAll', async () => {
  sugestoesStore.sug2 = { id: 'sug2', autorId: 'u2', status: 'aprovada' };
  const res = fakeRes();
  await h.listar({ user: { id: 'u1' }, query: { status: 'aprovada' } }, res);
  assert.equal(res.body.sugestoes.length, 1);
  assert.equal(res.body.sugestoes[0].id, 'sug2');
  restore();
});

test('listar — não-gerente usa query restrita (própria + backlog aprovado)', async () => {
  podeGerirValue = false;
  let capturedParams;
  db.getMany = async (sql, params) => { capturedParams = params; return [{ id: 'sug1' }]; };
  const res = fakeRes();
  await h.listar({ user: { id: 'u1' }, query: {} }, res);
  assert.equal(res.status, 200);
  assert.equal(res.body.podeGerir, false);
  assert.deepEqual(capturedParams, ['u1']);
  restore();
});

// ---------------- mudarStatus ----------------

test('mudarStatus — sem usuário autenticado devolve 401', async () => {
  const res = fakeRes();
  await h.mudarStatus({ user: null }, { status: 'aprovada' }, res, 'sug1');
  assert.equal(res.status, 401);
  restore();
});

test('mudarStatus — não-gerente devolve 403', async () => {
  podeGerirValue = false;
  const res = fakeRes();
  await h.mudarStatus({ user: { id: 'u2' } }, { status: 'aprovada' }, res, 'sug1');
  assert.equal(res.status, 403);
  restore();
});

test('mudarStatus — status fora da allowlist devolve 400', async () => {
  const res = fakeRes();
  await h.mudarStatus({ user: { id: 'gestor1' } }, { status: 'invalido' }, res, 'sug1');
  assert.equal(res.status, 400);
  restore();
});

test('mudarStatus — sugestão inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.mudarStatus({ user: { id: 'gestor1' } }, { status: 'aprovada' }, res, 'sugX');
  assert.equal(res.status, 404);
  restore();
});

test('mudarStatus — descartar sem justificativa devolve 400', async () => {
  const res = fakeRes();
  await h.mudarStatus({ user: { id: 'gestor1' } }, { status: 'descartada' }, res, 'sug1');
  assert.equal(res.status, 400);
  assert.match(res.body.error, /Justificativa/);
  assert.equal(sugestoesStore.sug1.status, 'pendente'); // não mudou
  restore();
});

test('mudarStatus — sucesso avança status e append no histórico (não sobrescreve)', async () => {
  const res = fakeRes();
  await h.mudarStatus({ user: { id: 'gestor1', name: 'Gestor X' } }, { status: 'em_analise', comentario: 'Vou avaliar' }, res, 'sug1');
  assert.equal(res.status, 200);
  assert.equal(sugestoesStore.sug1.status, 'em_analise');
  const historico = JSON.parse(sugestoesStore.sug1.historico);
  assert.equal(historico.length, 2); // a original (1) + a nova transição
  assert.equal(historico[1].de, 'pendente');
  assert.equal(historico[1].para, 'em_analise');
  assert.equal(historico[1].por, 'gestor1');
  restore();
});

test('mudarStatus — descartar com justificativa grava justificativaDescarte e notifica o autor', async () => {
  const res = fakeRes();
  await h.mudarStatus({ user: { id: 'gestor1', name: 'Gestor X' } }, { status: 'descartada', justificativa: 'Fora de escopo' }, res, 'sug1');
  assert.equal(res.status, 200);
  assert.equal(sugestoesStore.sug1.justificativaDescarte, 'Fora de escopo');
  assert.equal(notifCreates.length, 1);
  assert.equal(notifCreates[0].destinatario, 'u1'); // autorId da sugestão
  restore();
});

// ---------------- excluir ----------------

test('excluir — não-gerente devolve 403', async () => {
  podeGerirValue = false;
  const res = fakeRes();
  await h.excluir({ user: { id: 'u2' } }, res, 'sug1');
  assert.equal(res.status, 403);
  restore();
});

test('excluir — sugestão inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.excluir({ user: { id: 'gestor1' } }, res, 'sugX');
  assert.equal(res.status, 404);
  restore();
});

test('excluir — sucesso remove a sugestão', async () => {
  const res = fakeRes();
  await h.excluir({ user: { id: 'gestor1' } }, res, 'sug1');
  assert.equal(res.status, 200);
  assert.equal(sugestoesStore.sug1, undefined);
  restore();
});

// ---------------- uploadAnexo / getAnexo ----------------

test('uploadAnexo — sugestão inexistente devolve 404', async () => {
  const res = fakeRes();
  const req = fakeMultipartReq([{ name: 'foto', filename: 'x.png', contentType: 'image/png', data: PNG_BYTES }]);
  h.uploadAnexo('sugX', req, res);
  await waitEnd(req);
  assert.equal(res.status, 404);
  restore();
});

test('uploadAnexo — magic-bytes inválidos devolve 400', async () => {
  const res = fakeRes();
  const req = fakeMultipartReq([{ name: 'foto', filename: 'x.png', contentType: 'image/png', data: INVALID_IMAGE_BYTES }]);
  h.uploadAnexo('sug1', req, res);
  await waitEnd(req);
  assert.equal(res.status, 400);
  restore();
});

test('uploadAnexo — sucesso substitui o anexo anterior (DELETE antes do INSERT) e marca temAnexo', async () => {
  const res = fakeRes();
  const req = fakeMultipartReq([{ name: 'foto', filename: 'x.png', contentType: 'image/png', data: PNG_BYTES }]);
  h.uploadAnexo('sug1', req, res);
  await waitEnd(req);
  assert.equal(res.status, 200);
  assert.equal(dbQueries.length, 2);
  assert.match(dbQueries[0].sql, /DELETE FROM sugestao_anexos/);
  assert.match(dbQueries[1].sql, /INSERT INTO sugestao_anexos/);
  assert.equal(sugestoesStore.sug1.temAnexo, true);
  restore();
});

test('getAnexo — sem anexo devolve 404', async () => {
  const res = fakeRes();
  await h.getAnexo('sug1', res);
  assert.equal(res.status, 404);
  restore();
});

test('getAnexo — devolve o binário mais recente', async () => {
  db.getOne = async () => ({ nome: 'x.png', mimeType: 'image/png', data: PNG_BYTES });
  const res = fakeRes();
  await h.getAnexo('sug1', res);
  assert.equal(res.status, 200);
  assert.equal(res.headers['Content-Type'], 'image/png');
  assert.deepEqual(res.body, PNG_BYTES);
  restore();
});
