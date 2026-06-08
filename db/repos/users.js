/**
 * @file Repositório de `users` — CRUD básico de usuários do sistema.
 *
 * IMPORTANTE: `password_hash` é gerenciado APENAS via `lib/auth.js`
 * (createUser, consumeResetToken). Nunca chame `updateById` passando senha em
 * texto puro — o endpoint dedicado faz o hash bcrypt corretamente.
 *
 * SEGURANÇA (review M-1): o factory faz `SELECT *`, que traz `password_hash`.
 * As leituras via repo (gestão de usuários, audit before_state) NÃO devem expor
 * o hash — então `findById`/`findAll` o removem aqui. O login usa o
 * `findUserByEmail` próprio de `lib/auth.js`, que precisa do hash p/ o bcrypt.
 */
const { createRepo } = require('./_factory');

const base = createRepo('users', { orderBy: 'created_at DESC' });

/** Retorna uma cópia sem o hash de senha (não muta o original). */
function stripHash(u) {
  if (!u || typeof u !== 'object') return u;
  const safe = { ...u };
  delete safe.passwordHash;
  delete safe.password_hash;
  return safe;
}

module.exports = {
  ...base,
  async findById(id) {
    return stripHash(await base.findById(id));
  },
  async findAll(...args) {
    const rows = await base.findAll(...args);
    return Array.isArray(rows) ? rows.map(stripHash) : rows;
  },
};
