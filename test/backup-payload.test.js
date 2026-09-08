'use strict';
// node --test test/backup-payload.test.js  (sem servidor, sem DB — repos dublados)
//
// Achado 3.1 da varredura 2026-09-08: handleBackupDownload/_runEmailBackup
// tinham uma lista fixa de 15 tabelas, duplicada em dois lugares, faltando
// ~metade dos domínios do produto (RDO, propostas, cronograma, cotações,
// subcontratados, ferramentas, equipamentos, composições, SSMA, punch,
// treinamentos, EPIs, ponto). Agora deriva de TODOS os repos de db/repos/index.js.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildFullBackupPayload, EXCLUDE_TABLES } = require('../lib/backup-payload');

function repo(table, rows, extra = {}) {
  return { table, findAll: async () => rows, ...extra };
}

test('inclui um domínio novo (ex.: pontos) automaticamente — sem lista fixa', async () => {
  const repos = { pontos: repo('pontos', [{ id: 'p1' }]) };
  const payload = await buildFullBackupPayload(repos);
  assert.deepEqual(payload.pontos, [{ id: 'p1' }]);
});

test('exclui tabelas transitórias/de segurança (sessions, login_attempts, ...)', async () => {
  const repos = {
    sessions: repo('sessions', [{ id: 's1' }]),
    loginAttempts: repo('login_attempts', [{ id: 'l1' }]),
    contratos: repo('contracts', [{ id: 'c1' }]),
  };
  const payload = await buildFullBackupPayload(repos);
  assert.equal(payload.sessions, undefined);
  assert.equal(payload.login_attempts, undefined);
  for (const t of EXCLUDE_TABLES) assert.ok(!(t in payload), `${t} não deveria estar no backup`);
});

test('contracts usa findAllWithChildren quando disponível (não o findAll raso)', async () => {
  let calledChildren = false, calledFindAll = false;
  const repos = {
    contracts: repo('contracts', [], {
      findAll: async () => { calledFindAll = true; return []; },
      findAllWithChildren: async () => { calledChildren = true; return [{ id: 'c1', saidas: [] }]; },
    }),
  };
  const payload = await buildFullBackupPayload(repos);
  assert.equal(calledChildren, true);
  assert.equal(calledFindAll, false);
  assert.deepEqual(payload.contracts, [{ id: 'c1', saidas: [] }]);
});

test('prefere findAllRaw quando existe (PII cifrada — não decifra no backup)', async () => {
  let calledRaw = false, calledDecrypted = false;
  const repos = {
    recursos: repo('recursos', [], {
      findAll: async () => { calledDecrypted = true; return [{ cpf: '000.000.000-00' }]; },
      findAllRaw: async () => { calledRaw = true; return [{ cpf: 'enc:1:xxxx' }]; },
    }),
  };
  const payload = await buildFullBackupPayload(repos);
  assert.equal(calledRaw, true);
  assert.equal(calledDecrypted, false);
  assert.deepEqual(payload.recursos, [{ cpf: 'enc:1:xxxx' }]);
});

test('remove hash de senha e token de reset de users', async () => {
  const repos = {
    users: repo('users', [{ id: 'u1', email: 'a@b.com', passwordHash: 'x', resetToken: 'y' }]),
  };
  const payload = await buildFullBackupPayload(repos);
  assert.deepEqual(payload.users, [{ id: 'u1', email: 'a@b.com' }]);
});

test('repo cujo findAll lança não derruba o backup inteiro — vira []', async () => {
  const repos = {
    quebrado: { table: 'quebrado', findAll: async () => { throw new Error('boom'); } },
    ok: repo('ok', [{ id: '1' }]),
  };
  const payload = await buildFullBackupPayload(repos);
  assert.deepEqual(payload.quebrado, []);
  assert.deepEqual(payload.ok, [{ id: '1' }]);
});

test('duas chaves de repo apontando pra mesma tabela não duplicam a coleta', async () => {
  let chamadas = 0;
  const mesmoRepo = { table: 'x', findAll: async () => { chamadas++; return [{ id: '1' }]; } };
  const payload = await buildFullBackupPayload({ a: mesmoRepo, b: mesmoRepo });
  assert.equal(chamadas, 1);
  assert.deepEqual(payload.x, [{ id: '1' }]);
});

test('ignora entradas sem .table ou sem .findAll (defensivo)', async () => {
  const repos = { estranho: {}, semFindAll: { table: 'y' }, ok: repo('ok', []) };
  const payload = await buildFullBackupPayload(repos);
  assert.equal(payload.y, undefined);
  assert.deepEqual(payload.ok, []);
});

test('_meta traz version e format', async () => {
  const payload = await buildFullBackupPayload({}, { appVersion: '1.27.0' });
  assert.equal(payload._meta.version, '1.27.0');
  assert.equal(payload._meta.format, 'rhino-backup-v2');
  assert.ok(payload._meta.generatedAt);
});
