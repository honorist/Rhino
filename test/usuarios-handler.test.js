'use strict';
/**
 * Handler RBAC de usuários + níveis de acesso (handlers/usuarios.js) — sem
 * cobertura de camada HTTP antes desta mudança. `repos`/`auth`/`perms`/`db`
 * dublados — nada toca o Postgres. `lib/permissions.js` e `lib/auth.js` já
 * têm suas próprias suítes (test/permissions.test.js, test/auth.test.js);
 * aqui o foco é só a ORQUESTRAÇÃO HTTP (gates 403/404/400, anti-escalada,
 * sanitização de password_hash) — `perms`/`auth` são monkey-patchados.
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const db = require('../db');
const repos = require('../db/repos');
const auth = require('../lib/auth');
const perms = require('../lib/permissions');
const h = require('../handlers/usuarios');

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
  users: repos.users, niveisAcesso: repos.niveisAcesso,
  can: perms.can, canAssignNivel: perms.canAssignNivel, isSuperAdmin: perms.isSuperAdmin,
  findUserByEmail: auth.findUserByEmail, createUser: auth.createUser, hash: auth.hash,
  getOne: db.getOne,
};
let users, niveis;

beforeEach(() => {
  users = [];
  niveis = [];
  repos.users = {
    findAll: async () => users,
    findById: async (id) => users.find((u) => u.id === id) || null,
    updateById: async (id, patch) => {
      const u = users.find((x) => x.id === id);
      if (!u) return null;
      Object.assign(u, patch);
      return u;
    },
    removeById: async (id) => { users = users.filter((u) => u.id !== id); return true; },
  };
  repos.niveisAcesso = {
    findAll: async () => niveis,
    findById: async (id) => niveis.find((n) => n.id === id) || null,
    updateById: async (id, patch) => {
      const n = niveis.find((x) => x.id === id);
      if (!n) return null;
      Object.assign(n, patch);
      return n;
    },
  };
  perms.can = async () => true;
  perms.canAssignNivel = () => true;
  perms.isSuperAdmin = () => true;
  auth.findUserByEmail = async () => null;
  auth.createUser = async ({ email }) => { const id = 'u' + (users.length + 1); users.push({ id, email, passwordHash: 'x' }); return id; };
  auth.hash = async () => 'hashed';
  db.getOne = async () => ({ n: 5 });
});

function restore() {
  Object.assign(repos, { users: orig.users, niveisAcesso: orig.niveisAcesso });
  Object.assign(perms, { can: orig.can, canAssignNivel: orig.canAssignNivel, isSuperAdmin: orig.isSuperAdmin });
  Object.assign(auth, { findUserByEmail: orig.findUserByEmail, createUser: orig.createUser, hash: orig.hash });
  db.getOne = orig.getOne;
}

// ---------------- GET /api/users ----------------

test('GET — sem permissão devolve 403', async () => {
  perms.can = async () => false;
  const res = fakeRes();
  await h.handleGetUsers({ user: { id: 'u1' } }, res);
  assert.equal(res.status, 403);
  restore();
});

test('GET — lista sanitizada (sem passwordHash/password_hash)', async () => {
  users.push({ id: 'u1', email: 'a@x.com', passwordHash: 'segredo', password_hash: 'segredo2' });
  const res = fakeRes();
  await h.handleGetUsers({ user: { id: 'admin1' } }, res);
  assert.equal(res.status, 200);
  assert.equal(res.body.users.length, 1);
  assert.ok(!('passwordHash' in res.body.users[0]));
  assert.ok(!('password_hash' in res.body.users[0]));
  restore();
});

// ---------------- POST /api/users ----------------

test('POST — sem permissão devolve 403', async () => {
  perms.can = async () => false;
  const res = fakeRes();
  await h.handlePostUser({ user: { id: 'u1' } }, { email: 'a@x.com', password: 'senha1234' }, res);
  assert.equal(res.status, 403);
  restore();
});

test('POST — canAssignNivel bloqueia escalada de privilégio (403)', async () => {
  perms.canAssignNivel = () => false;
  const res = fakeRes();
  await h.handlePostUser({ user: { id: 'u1' } }, { email: 'a@x.com', password: 'senha1234', nivelAcessoId: 'admin' }, res);
  assert.equal(res.status, 403);
  assert.equal(users.length, 0);
  restore();
});

test('POST — sem email/senha devolve 400', async () => {
  const res = fakeRes();
  await h.handlePostUser({ user: {} }, {}, res);
  assert.equal(res.status, 400);
  restore();
});

test('POST — senha curta devolve 400', async () => {
  const res = fakeRes();
  await h.handlePostUser({ user: {} }, { email: 'a@x.com', password: '123' }, res);
  assert.equal(res.status, 400);
  restore();
});

test('POST — email já existente devolve 400', async () => {
  auth.findUserByEmail = async () => ({ id: 'existing' });
  const res = fakeRes();
  await h.handlePostUser({ user: {} }, { email: 'a@x.com', password: 'senha1234' }, res);
  assert.equal(res.status, 400);
  restore();
});

test('POST — cria usuário com sucesso, resposta sanitizada', async () => {
  const res = fakeRes();
  await h.handlePostUser({ user: {} }, { email: 'novo@x.com', password: 'senha1234', name: 'Novo' }, res);
  assert.equal(res.status, 200);
  assert.equal(users.length, 1);
  assert.ok(!('passwordHash' in res.body.user));
  restore();
});

// ---------------- PUT /api/users/:id ----------------

test('PUT — sem permissão devolve 403', async () => {
  perms.can = async () => false;
  const res = fakeRes();
  await h.handlePutUser({ user: {} }, 'u1', {}, res);
  assert.equal(res.status, 403);
  restore();
});

test('PUT — usuário inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handlePutUser({ user: {} }, 'naoexiste', {}, res);
  assert.equal(res.status, 404);
  restore();
});

test('PUT — não-super-admin não pode editar usuário privilegiado (403)', async () => {
  users.push({ id: 'u1', nivelAcessoId: null });
  perms.isSuperAdmin = () => false;
  const res = fakeRes();
  await h.handlePutUser({ user: { id: 'u2' } }, 'u1', { name: 'X' }, res);
  assert.equal(res.status, 403);
  restore();
});

test('PUT — canAssignNivel bloqueia mudança pra nível privilegiado (403)', async () => {
  users.push({ id: 'u1', nivelAcessoId: 'op' });
  perms.canAssignNivel = () => false;
  const res = fakeRes();
  await h.handlePutUser({ user: { id: 'u2' } }, 'u1', { nivelAcessoId: 'admin' }, res);
  assert.equal(res.status, 403);
  restore();
});

test('PUT — senha curta devolve 400', async () => {
  users.push({ id: 'u1', nivelAcessoId: 'op' });
  const res = fakeRes();
  await h.handlePutUser({ user: {} }, 'u1', { password: '123' }, res);
  assert.equal(res.status, 400);
  restore();
});

test('PUT — atualiza campos presentes normalmente', async () => {
  users.push({ id: 'u1', nivelAcessoId: 'op', name: 'Original' });
  const res = fakeRes();
  await h.handlePutUser({ user: {} }, 'u1', { name: 'Atualizado' }, res);
  assert.equal(res.status, 200);
  assert.equal(users[0].name, 'Atualizado');
  restore();
});

// ---------------- DELETE /api/users/:id ----------------

test('DELETE — sem permissão devolve 403', async () => {
  perms.can = async () => false;
  const res = fakeRes();
  await h.handleDeleteUser('u1', { user: { id: 'u2' } }, res);
  assert.equal(res.status, 403);
  restore();
});

test('DELETE — não pode deletar o próprio usuário (400)', async () => {
  const res = fakeRes();
  await h.handleDeleteUser('u1', { user: { id: 'u1' } }, res);
  assert.equal(res.status, 400);
  restore();
});

test('DELETE — usuário inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handleDeleteUser('naoexiste', { user: { id: 'u2' } }, res);
  assert.equal(res.status, 404);
  restore();
});

test('DELETE — não-super-admin não pode remover usuário privilegiado (403)', async () => {
  users.push({ id: 'u1', nivelAcessoId: 'admin' });
  perms.isSuperAdmin = () => false;
  const res = fakeRes();
  await h.handleDeleteUser('u1', { user: { id: 'u2' } }, res);
  assert.equal(res.status, 403);
  restore();
});

test('DELETE — não remove o último super admin ativo (400)', async () => {
  users.push({ id: 'u1', nivelAcessoId: null });
  db.getOne = async () => ({ n: 1 });
  const res = fakeRes();
  await h.handleDeleteUser('u1', { user: { id: 'u2' } }, res);
  assert.equal(res.status, 400);
  assert.equal(users.length, 1);
  restore();
});

test('DELETE — remove normalmente quando há mais de um super admin', async () => {
  users.push({ id: 'u1', nivelAcessoId: null });
  db.getOne = async () => ({ n: 2 });
  const res = fakeRes();
  await h.handleDeleteUser('u1', { user: { id: 'u2' } }, res);
  assert.equal(res.status, 200);
  assert.equal(users.length, 0);
  restore();
});

// ---------------- Níveis de acesso ----------------

test('GET níveis — devolve o envelope { niveis }', async () => {
  niveis.push({ id: 'n1', abas: ['#/caixa'] });
  const res = fakeRes();
  await h.handleGetNiveisAcesso(res);
  assert.equal(res.status, 200);
  assert.equal(res.body.niveis.length, 1);
  restore();
});

test('PUT nível — nível inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handlePutNivelAcesso('naoexiste', { abas: [] }, res);
  assert.equal(res.status, 404);
  restore();
});

test('PUT nível — atualiza as abas normalmente', async () => {
  niveis.push({ id: 'n1', abas: [] });
  const res = fakeRes();
  await h.handlePutNivelAcesso('n1', { abas: ['#/caixa', 'edit:#/caixa'] }, res);
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(niveis[0].abas), ['#/caixa', 'edit:#/caixa']);
  restore();
});
