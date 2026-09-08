'use strict';
// node --test test/serve-blob-photo.test.js  (sem servidor, sem DB — db/auth dublados)
//
// Achado 4.1 da varredura 2026-09-08: serveRdoFotoFromDb/serveManutencaoFotoFromDb/
// servePunchFotoFromDb em server.js eram 3 cópias quase idênticas (~40 linhas
// cada). lib/serve-blob-photo.js#servirFotoBlob é a fábrica genérica.

const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../db');
const auth = require('../lib/auth');
const { servirFotoBlob } = require('../lib/serve-blob-photo');

const orig = { getOne: db.getOne, parseCookies: auth.parseCookies, getUserBySession: auth.getUserBySession };
afterEach(() => Object.assign(db, { getOne: orig.getOne }) && Object.assign(auth, { parseCookies: orig.parseCookies, getUserBySession: orig.getUserBySession }));

function fakeRes() {
  const res = { statusCode: null, headers: null, body: null };
  res.writeHead = (s, h) => { res.statusCode = s; res.headers = h; };
  res.end = (b) => { res.body = b; };
  return res;
}

const serveRdoFoto = servirFotoBlob({
  idPrefixRe: /^rdo_[0-9a-z]+$/i,
  fotoPrefixRe: /^foto_[0-9a-z]+$/i,
  table: 'rdo_fotos',
  fkColumn: 'rdo_id',
});

test('401 sem sessão válida — não chega a consultar o banco', async () => {
  auth.parseCookies = () => ({});
  auth.getUserBySession = async () => null;
  let queried = false;
  db.getOne = async () => { queried = true; return null; };

  const res = fakeRes();
  await serveRdoFoto('/data/rdo-fotos/rdo_abc123/foto_xyz789.jpg', {}, res);

  assert.equal(res.statusCode, 401);
  assert.equal(queried, false);
});

test('404 quando o id do pai ou da foto não bate no formato esperado (defesa contra ..)', async () => {
  auth.parseCookies = () => ({ sid: 's1' });
  auth.getUserBySession = async () => ({ id: 'u1' });
  let queried = false;
  db.getOne = async () => { queried = true; return null; };

  const res = fakeRes();
  await serveRdoFoto('/data/rdo-fotos/../../etc/passwd', {}, res);

  assert.equal(res.statusCode, 404);
  assert.equal(queried, false);
});

test('404 quando a foto não existe (ou pertence a outro pai)', async () => {
  auth.parseCookies = () => ({ sid: 's1' });
  auth.getUserBySession = async () => ({ id: 'u1' });
  db.getOne = async () => null;

  const res = fakeRes();
  await serveRdoFoto('/data/rdo-fotos/rdo_abc123/foto_xyz789.jpg', {}, res);

  assert.equal(res.statusCode, 404);
});

test('200 com a imagem quando tudo confere — consulta a tabela/coluna certas', async () => {
  auth.parseCookies = () => ({ sid: 's1' });
  auth.getUserBySession = async () => ({ id: 'u1' });
  let capturedSql, capturedParams;
  db.getOne = async (sql, params) => {
    capturedSql = sql;
    capturedParams = params;
    return { mime: 'image/png', data: Buffer.from('fake-png') };
  };

  const res = fakeRes();
  await serveRdoFoto('/data/rdo-fotos/rdo_abc123/foto_xyz789.jpg', {}, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, Buffer.from('fake-png'));
  assert.equal(res.headers['Content-Type'], 'image/png');
  assert.match(capturedSql, /FROM rdo_fotos WHERE id = \$1 AND rdo_id = \$2/);
  assert.deepEqual(capturedParams, ['foto_xyz789', 'rdo_abc123']);
});

test('outra fábrica (manutenção) usa sua própria tabela/coluna/regex — sem vazar config entre instâncias', async () => {
  const serveManutencaoFoto = servirFotoBlob({
    idPrefixRe: /^man_[0-9a-z]+$/i,
    fotoPrefixRe: /^foto_[0-9a-z]+$/i,
    table: 'manutencao_fotos',
    fkColumn: 'manutencao_id',
  });
  auth.parseCookies = () => ({ sid: 's1' });
  auth.getUserBySession = async () => ({ id: 'u1' });
  let capturedSql;
  db.getOne = async (sql) => { capturedSql = sql; return { mime: 'image/jpeg', data: Buffer.from('x') }; };

  const res = fakeRes();
  await serveManutencaoFoto('/data/manutencao-fotos/man_1/foto_2.jpg', {}, res);

  assert.equal(res.statusCode, 200);
  assert.match(capturedSql, /FROM manutencao_fotos WHERE id = \$1 AND manutencao_id = \$2/);

  // A instância de RDO continua exigindo o prefixo rdo_ — não aceita man_.
  const res2 = fakeRes();
  await serveRdoFoto('/data/rdo-fotos/man_1/foto_2.jpg', {}, res2);
  assert.equal(res2.statusCode, 404);
});

test('erro no banco vira 500, não derruba o processo', async () => {
  auth.parseCookies = () => ({ sid: 's1' });
  auth.getUserBySession = async () => ({ id: 'u1' });
  db.getOne = async () => { throw new Error('conexão caiu'); };

  const res = fakeRes();
  await serveRdoFoto('/data/rdo-fotos/rdo_abc123/foto_xyz789.jpg', {}, res);

  assert.equal(res.statusCode, 500);
});
