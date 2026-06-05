/**
 * @file Modelo unificado de permissões.
 *
 * Convenção:
 *  - `nivelAcessoId === null`    → super admin (bypass total — admin sem perfil)
 *  - `nivelAcessoId === 'admin'` → admin explícito (bypass total)
 *  - Outro id                    → checa o array `abas` do perfil em `niveis_acesso`
 *
 * Mapeamento (resource × action) → string esperada em `abas`:
 *  - view  → '#/<route>'        (ex.: '#/contratos')
 *  - create|update|delete|edit  → 'edit:#/<route>'
 *
 * Recursos administrativos (backup, lgpd, ai_usage, niveis_write, admin_metrics)
 * são restritos a admin/super admin — qualquer outro perfil é negado.
 *
 * Política de gestão de usuários:
 *  - `users:view`    → exige `edit:#/usuarios` no perfil (você só lista se gerencia)
 *  - `users:create|update|delete` → exige `edit:#/usuarios`
 *  - Não-super-admin não pode promover/criar usuário com `nivelAcessoId` nulo ou 'admin'
 *    (proteção contra escalada de privilégio — ver `canAssignNivel`).
 */

const repos = require('../db/repos');

/** Recursos restritos ao super admin / admin. */
const ADMIN_ONLY = new Set([
  'backup',
  'niveis_write',
  'lgpd',
  'ai_usage',
  'admin_metrics',
]);

/** Mapeia um recurso lógico para a rota usada nos `abas` do perfil. */
const RESOURCE_TO_ROUTE = {
  users:               '#/usuarios',
  contratos:           '#/contratos',
  obras:               '#/obras',
  caixa:               '#/caixa',
  notas_fiscais:       '#/notas-fiscais',
  contas_pagar:        '#/contas-pagar',
  clientes:            '#/clientes',
  fornecedores:        '#/fornecedores',
  recursos:            '#/recursos',
  recrutamento:        '#/recrutamento',
  folha_pagamento:     '#/folha-pagamento',
  base:                '#/base',
  socios:              '#/socios',
  investimentos:       '#/investimentos',
  frota:               '#/frota',
  solicitacoes_compra: '#/solicitacoes-compra',
  estoque:             '#/estoque',
  rdos:                '#/rdos',
  auditoria:           '#/auditoria',
  cobranca:            '#/cobranca',
  propostas:           '#/proposta',
  clausulas:           '#/clausulas',
  configuracao:        '#/configuracao',
  sugestoes:           '#/sugestoes',
};

/**
 * Super admin: sem perfil (`null`) ou perfil 'admin'. Bypass de todos os checks.
 * @param {object | null | undefined} user
 * @returns {boolean}
 */
function isSuperAdmin(user) {
  if (!user) return false;
  const id = user.nivelAcessoId ?? user.nivel_acesso_id ?? null;
  return id === null || id === 'admin';
}

/**
 * Carrega o array `abas` do perfil do usuário. Super admin retorna null
 * (sinaliza "sem restrição"). Usuário sem perfil válido retorna [].
 * @param {object} user
 * @returns {Promise<string[] | null>}
 */
async function loadAbas(user) {
  if (!user) return [];
  if (isSuperAdmin(user)) return null;
  const id = user.nivelAcessoId ?? user.nivel_acesso_id;
  try {
    const nivel = await repos.niveisAcesso.findById(id);
    return Array.isArray(nivel?.abas) ? nivel.abas : [];
  } catch {
    return [];
  }
}

/**
 * Avalia se o usuário pode executar uma ação em um recurso.
 *
 * @param {object | null | undefined} user      `req.user`
 * @param {string} resource                     Ex.: 'users', 'contratos'
 * @param {'view'|'create'|'update'|'delete'|'edit'} action
 * @returns {Promise<boolean>}
 */
async function can(user, resource, action) {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  if (ADMIN_ONLY.has(resource)) return false;

  const route = RESOURCE_TO_ROUTE[resource];
  if (!route) return false;

  const abas = await loadAbas(user);
  if (!abas) return true;
  if (abas.length === 0) return false;

  // Política especial: gestão de usuários — view exige permissão de edição
  // (apenas quem gerencia usuários enxerga a listagem).
  if (resource === 'users') {
    return abas.includes('edit:' + route);
  }

  if (action === 'view') return abas.includes(route);
  return abas.includes('edit:' + route);
}

/**
 * Pode atribuir/alterar um usuário para o `nivelAcessoId` informado?
 * Bloqueio anti-escalada: somente super admin pode criar/promover para
 * `null` (super admin) ou `'admin'`.
 *
 * @param {object} actingUser
 * @param {string | null | undefined} targetNivelAcessoId
 * @returns {boolean}
 */
function canAssignNivel(actingUser, targetNivelAcessoId) {
  const target = targetNivelAcessoId ?? null;
  if (target === null || target === 'admin') {
    return isSuperAdmin(actingUser);
  }
  return true;
}

/**
 * Sumário das permissões do usuário — usado pelo frontend pra esconder/mostrar UI.
 *
 * @param {object | null | undefined} user
 * @returns {Promise<{ superAdmin: boolean, abas: string[] | null } | null>}
 */
async function summary(user) {
  if (!user) return null;
  if (isSuperAdmin(user)) return { superAdmin: true, abas: null };
  const abas = await loadAbas(user);
  return { superAdmin: false, abas: abas || [] };
}

module.exports = {
  can,
  canAssignNivel,
  summary,
  isSuperAdmin,
  loadAbas,
  ADMIN_ONLY,
  RESOURCE_TO_ROUTE,
};
