/**
 * @file Repositório de `users` — CRUD básico de usuários do sistema.
 *
 * IMPORTANTE: `password_hash` é gerenciado APENAS via `lib/auth.js`
 * (createUser, consumeResetToken). Nunca chame `updateById` passando senha em
 * texto puro — o endpoint dedicado faz o hash bcrypt corretamente.
 */
const { createRepo } = require('./_factory');

const base = createRepo('users', { orderBy: 'created_at DESC' });

module.exports = { ...base };
