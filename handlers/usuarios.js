'use strict';
/**
 * @file RBAC — gestão de usuários (CRUD admin, com anti-escalada de privilégio)
 * e níveis de acesso (perfis com array 'abas'). Extraído do server.js
 * (desmembramento), sem alteração de lógica.
 *
 * Todo gate passa por lib/permissions (perms.can / canAssignNivel /
 * isSuperAdmin). sanitizeUser remove o password_hash antes de responder. Os
 * níveis usam os envelopes de coleção (lib/collections).
 */
const db = require('../db');
const repos = require('../db/repos');
const auth = require('../lib/auth');
const perms = require('../lib/permissions');
const { readCollection, writeCollection } = require('../lib/collections');
const { sendJson, sendError } = require('../lib/http-respond');

// ============ Users CRUD (admin) ============
function sanitizeUser(u) {
  // Nunca devolver password_hash pro frontend.
  // Defensivo contra ambas as formas (camelCase pós-rowToCamel e snake_case bruto)
  // pra evitar vazamento se algum row escapar do conversor.
  if (!u) return null;
  const { passwordHash, password_hash, ...rest } = u;
  return rest;
}

async function handleGetUsers(req, res) {
  if (!(await perms.can(req.user, 'users', 'view'))) {
    return sendError(res, 403, 'Sem permissão para listar usuários');
  }
  try {
    const rows = await repos.users.findAll();
    sendJson(res, { users: rows.map(sanitizeUser) });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handlePostUser(req, body, res) {
  if (!(await perms.can(req.user, 'users', 'create'))) {
    return sendError(res, 403, 'Sem permissão para criar usuários');
  }
  if (!perms.canAssignNivel(req.user, body.nivelAcessoId)) {
    return sendError(res, 403, 'Você não pode criar usuários com esse nível de acesso');
  }
  try {
    const email = (body.email || '').trim();
    const password = body.password || '';
    if (!email || !password) return sendError(res, 400, 'Email e senha são obrigatórios');
    if (password.length < 8) return sendError(res, 400, 'Senha precisa ter no mínimo 8 caracteres');

    const exists = await auth.findUserByEmail(email);
    if (exists) return sendError(res, 400, 'Já existe um usuário com este email');

    const id = await auth.createUser({
      email,
      password,
      name: body.name || null,
      nivelAcessoId: body.nivelAcessoId || null,
      socioId: body.socioId || null,
    });
    const created = await repos.users.findById(id);
    sendJson(res, {
      users: (await repos.users.findAll()).map(sanitizeUser),
      user: sanitizeUser(created),
    });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePutUser(req, id, body, res) {
  if (!(await perms.can(req.user, 'users', 'update'))) {
    return sendError(res, 403, 'Sem permissão para editar usuários');
  }
  try {
    // Anti-escalada: não-super-admin não modifica usuário privilegiado (admin / super admin)
    const target = await repos.users.findById(id);
    if (!target) return sendError(res, 404, 'Usuário não encontrado');
    const targetNivel = target.nivelAcessoId ?? null;
    const targetIsPrivileged = targetNivel === null || targetNivel === 'admin';
    if (targetIsPrivileged && !perms.isSuperAdmin(req.user)) {
      return sendError(res, 403, 'Você não pode editar um usuário administrador');
    }
    if (body.nivelAcessoId !== undefined && !perms.canAssignNivel(req.user, body.nivelAcessoId)) {
      return sendError(res, 403, 'Você não pode atribuir esse nível de acesso');
    }

    const allowed = {};
    if (body.name !== undefined) allowed.name = body.name;
    if (body.email !== undefined) allowed.email = String(body.email).trim().toLowerCase();
    if (body.nivelAcessoId !== undefined) allowed.nivelAcessoId = body.nivelAcessoId || null;
    if (body.socioId !== undefined) allowed.socioId = body.socioId || null;
    if (body.isActive !== undefined) allowed.isActive = !!body.isActive;
    if (body.password) {
      if (String(body.password).length < 8)
        return sendError(res, 400, 'Senha precisa ter no mínimo 8 caracteres');
      allowed.passwordHash = await auth.hash(body.password);
    }
    allowed.updatedAt = new Date().toISOString();

    const result = await repos.users.updateById(id, allowed);
    if (!result) return sendError(res, 404, 'Usuário não encontrado');
    sendJson(res, { users: (await repos.users.findAll()).map(sanitizeUser) });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDeleteUser(id, req, res) {
  if (!(await perms.can(req.user, 'users', 'delete'))) {
    return sendError(res, 403, 'Sem permissão para remover usuários');
  }
  try {
    if (req.user && req.user.id === id) {
      return sendError(res, 400, 'Você não pode deletar seu próprio usuário');
    }
    const target = await repos.users.findById(id);
    if (!target) return sendError(res, 404, 'Usuário não encontrado');

    const targetNivel = target.nivelAcessoId ?? null;
    const targetIsPrivileged = targetNivel === null || targetNivel === 'admin';
    if (targetIsPrivileged && !perms.isSuperAdmin(req.user)) {
      return sendError(res, 403, 'Você não pode remover um usuário administrador');
    }

    if (targetNivel === null) {
      const superAdmins = await db.getOne(
        `SELECT COUNT(*)::int AS n FROM users WHERE nivel_acesso_id IS NULL AND is_active = TRUE`
      );
      if (superAdmins && superAdmins.n <= 1) {
        return sendError(res, 400, 'Não é possível remover o último super admin');
      }
    }
    await repos.users.removeById(id);
    sendJson(res, { users: (await repos.users.findAll()).map(sanitizeUser) });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// ============ Níveis de acesso (perfis RBAC) ============
async function handleGetNiveisAcesso(res) {
  try {
    const data = await readCollection('niveis_acesso.json', 'niveisAcesso', 'niveis');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    console.error('[niveis-acesso] erro ao carregar:', e && e.message);
    sendError(res, 500, 'Erro ao carregar níveis de acesso');
  }
}

async function handlePutNivelAcesso(id, body, res) {
  try {
    const abas = JSON.stringify(body.abas || []);
    const { envelope, result } = await writeCollection('niveisAcesso', 'niveis', (repo) =>
      repo.updateById(id, { abas })
    );
    if (!result) return sendError(res, 404, 'Nível não encontrado');
    sendJson(res, envelope);
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

module.exports = {
  handleGetUsers,
  handlePostUser,
  handlePutUser,
  handleDeleteUser,
  handleGetNiveisAcesso,
  handlePutNivelAcesso,
};
