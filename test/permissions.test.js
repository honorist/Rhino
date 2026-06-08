/**
 * @file Testes unitários do módulo lib/permissions.js
 *
 * Não exigem DB: o repo `niveisAcesso.findById` é stubbed via require-cache
 * antes de carregar o módulo.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const _path = require('path');

// Stub do repos antes de carregar permissions.js
const reposPath = require.resolve('../db/repos');
require.cache[reposPath] = {
  id: reposPath,
  filename: reposPath,
  loaded: true,
  exports: {
    niveisAcesso: {
      findById: async (id) => {
        const fixtures = {
          admin:      { id: 'admin',      abas: ['#/contratos', 'edit:#/contratos', '#/usuarios', 'edit:#/usuarios'] },
          gerente:    { id: 'gerente',    abas: ['#/contratos', '#/obras', 'edit:#/obras', '#/usuarios', 'edit:#/usuarios'] },
          financeiro: { id: 'financeiro', abas: ['#/caixa', '#/notas-fiscais', 'edit:#/caixa'] },
          operador:   { id: 'operador',   abas: ['#/contratos', '#/obras'] },
          vazio:      { id: 'vazio',      abas: [] },
        };
        return fixtures[id] || null;
      },
    },
  },
};

const perms = require('../lib/permissions');

const superAdmin     = { id: 'u1', nivelAcessoId: null };
const adminProfile   = { id: 'u2', nivelAcessoId: 'admin' };
const gerente        = { id: 'u3', nivelAcessoId: 'gerente' };
const financeiro     = { id: 'u4', nivelAcessoId: 'financeiro' };
const operador       = { id: 'u5', nivelAcessoId: 'operador' };
const vazio          = { id: 'u6', nivelAcessoId: 'vazio' };
const inexistente    = { id: 'u7', nivelAcessoId: 'nao-existe' };

test('isSuperAdmin — nivelAcessoId null é super admin', () => {
  assert.equal(perms.isSuperAdmin(superAdmin), true);
});

test('isSuperAdmin — perfil "admin" também é super admin (bypass)', () => {
  assert.equal(perms.isSuperAdmin(adminProfile), true);
});

test('isSuperAdmin — gerente não é super admin', () => {
  assert.equal(perms.isSuperAdmin(gerente), false);
});

test('isSuperAdmin — null/undefined user retorna false', () => {
  assert.equal(perms.isSuperAdmin(null), false);
  assert.equal(perms.isSuperAdmin(undefined), false);
});

test('can — super admin tem tudo liberado', async () => {
  assert.equal(await perms.can(superAdmin, 'users', 'create'), true);
  assert.equal(await perms.can(superAdmin, 'backup', 'view'), true);
  assert.equal(await perms.can(superAdmin, 'qualquer-recurso-nao-mapeado', 'edit'), true);
});

test('can — admin profile tem tudo liberado', async () => {
  assert.equal(await perms.can(adminProfile, 'users', 'create'), true);
  assert.equal(await perms.can(adminProfile, 'backup', 'view'), true);
});

test('can — gerente com edit:#/usuarios pode gerenciar usuários', async () => {
  assert.equal(await perms.can(gerente, 'users', 'view'),   true);
  assert.equal(await perms.can(gerente, 'users', 'create'), true);
  assert.equal(await perms.can(gerente, 'users', 'update'), true);
  assert.equal(await perms.can(gerente, 'users', 'delete'), true);
});

test('can — financeiro sem edit:#/usuarios NÃO pode gerenciar usuários', async () => {
  assert.equal(await perms.can(financeiro, 'users', 'view'),   false);
  assert.equal(await perms.can(financeiro, 'users', 'create'), false);
  assert.equal(await perms.can(financeiro, 'users', 'update'), false);
});

test('can — operador (sem #/usuarios) não pode ver usuários', async () => {
  assert.equal(await perms.can(operador, 'users', 'view'), false);
});

test('can — perfil vazio é negado em tudo', async () => {
  assert.equal(await perms.can(vazio, 'users', 'view'),    false);
  assert.equal(await perms.can(vazio, 'contratos', 'view'), false);
});

test('can — perfil inexistente é negado', async () => {
  assert.equal(await perms.can(inexistente, 'users', 'view'), false);
});

test('can — view de contratos: gerente sim, financeiro não', async () => {
  assert.equal(await perms.can(gerente,    'contratos', 'view'), true);
  assert.equal(await perms.can(financeiro, 'contratos', 'view'), false);
});

test('can — edit de obras: gerente sim (tem edit:), operador não', async () => {
  assert.equal(await perms.can(gerente,  'obras', 'update'), true);
  assert.equal(await perms.can(operador, 'obras', 'update'), false);
  assert.equal(await perms.can(operador, 'obras', 'view'),   true);
});

test('can — recurso admin-only nega não-admin', async () => {
  assert.equal(await perms.can(gerente,    'backup', 'view'), false);
  assert.equal(await perms.can(financeiro, 'lgpd',   'view'), false);
});

test('can — recurso desconhecido retorna false', async () => {
  assert.equal(await perms.can(gerente, 'recurso-nao-mapeado', 'view'), false);
});

test('canAssignNivel — super admin pode atribuir qualquer nível', () => {
  assert.equal(perms.canAssignNivel(superAdmin, null),         true);
  assert.equal(perms.canAssignNivel(superAdmin, 'admin'),      true);
  assert.equal(perms.canAssignNivel(superAdmin, 'gerente'),    true);
  assert.equal(perms.canAssignNivel(superAdmin, 'financeiro'), true);
});

test('canAssignNivel — gerente NÃO pode promover para super admin ou admin', () => {
  assert.equal(perms.canAssignNivel(gerente, null),       false);
  assert.equal(perms.canAssignNivel(gerente, 'admin'),    false);
});

test('canAssignNivel — gerente pode atribuir níveis comuns', () => {
  assert.equal(perms.canAssignNivel(gerente, 'gerente'),    true);
  assert.equal(perms.canAssignNivel(gerente, 'financeiro'), true);
  assert.equal(perms.canAssignNivel(gerente, 'operador'),   true);
});

test('summary — super admin', async () => {
  const s = await perms.summary(superAdmin);
  assert.deepEqual(s, { superAdmin: true, abas: null });
});

test('summary — gerente expõe as abas', async () => {
  const s = await perms.summary(gerente);
  assert.equal(s.superAdmin, false);
  assert.ok(s.abas.includes('edit:#/usuarios'));
});

test('summary — usuário sem perfil válido retorna abas vazias', async () => {
  const s = await perms.summary(inexistente);
  assert.deepEqual(s, { superAdmin: false, abas: [] });
});
