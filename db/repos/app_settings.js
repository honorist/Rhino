/**
 * @file Repositório de `app_settings` — configurações globais key/value.
 *
 * Uso típico:
 *   const apr = await repos.appSettings.get('proposta_apresentacao');
 *   await repos.appSettings.set('proposta_apresentacao', { apresentacao: '...', ... });
 */
const db = require('../index');

async function get(key) {
  const row = await db.getOne(`SELECT value FROM app_settings WHERE key = $1`, [key]);
  return row ? row.value : null;
}

async function set(key, value) {
  await db.query(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, JSON.stringify(value)]
  );
  return value;
}

async function patch(key, patchObj) {
  const cur = await get(key) || {};
  const novo = { ...cur, ...patchObj };
  await set(key, novo);
  return novo;
}

module.exports = { get, set, patch };
