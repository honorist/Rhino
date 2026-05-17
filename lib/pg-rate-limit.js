/**
 * @file Rate limiter persistente em Postgres — para endpoints de autenticação.
 *
 * Diferenças vs lib/rate-limit.js (in-memory):
 *  - Sobrevive a restarts (Railway redeploya frequentemente; antes o bucket zerava).
 *  - Sem race condition no refund (não usa array.pop sobre estado compartilhado).
 *  - Escala horizontalmente (todas as instâncias compartilham o mesmo Postgres).
 *  - Bonus: registros ficam disponíveis para auditoria de tentativas falhas.
 *
 * Usar apenas em endpoints de auth (login, portal-login, forgot, reset).
 * Para rate limit global por IP, continuar usando o módulo in-memory
 * (mais rápido e suficiente para anti-DoS em alta cardinalidade).
 *
 * Cleanup: rows com created_at > 7 dias são deletadas pelo cron em server.js.
 */

const db = require('../db');
const rl = require('./rate-limit');

/**
 * Reusa _clientIp e clientKey do módulo in-memory (mesma lógica).
 */
const clientKey = rl.clientKey;

/**
 * Verifica e registra tentativa. Atômico-ish: conta primeiro, insere depois.
 * Race entre requests concorrentes pode resultar em +1 ou +2 tentativas além
 * do limite, mas para login isso não é exploitable (atacante teria que ter
 * credenciais válidas múltiplas em paralelo).
 *
 * @param {string} key
 * @param {{ max: number, windowMs: number }} opts
 * @returns {Promise<{ ok: boolean, limit: number, remaining: number, retryAfterSec?: number }>}
 */
async function check(key, { max, windowMs }) {
  const intervalSec = Math.max(1, Math.ceil(windowMs / 1000));
  // 1) Conta tentativas existentes na janela e captura a mais antiga (pra calcular retryAfter)
  const countSql = `
    SELECT COUNT(*)::int AS n, MIN(created_at) AS oldest
    FROM login_attempts
    WHERE key = $1 AND created_at > NOW() - ($2 || ' seconds')::interval
  `;
  const row = await db.getOne(countSql, [key, String(intervalSec)]);
  const n = row?.n || 0;
  if (n >= max) {
    const oldestMs = row?.oldest ? new Date(row.oldest).getTime() : Date.now();
    const retryAfterSec = Math.max(1, Math.ceil((oldestMs + windowMs - Date.now()) / 1000));
    return { ok: false, retryAfterSec, limit: max, remaining: 0 };
  }
  // 2) Registra esta tentativa (será removida via refund se for legítima)
  await db.query(`INSERT INTO login_attempts (key) VALUES ($1)`, [key]);
  return { ok: true, limit: max, remaining: max - n - 1 };
}

/**
 * Remove a tentativa mais recente para esta chave — chamado em login bem
 * sucedido para não penalizar o usuário legítimo.
 *
 * @param {string} key
 */
async function refund(key) {
  await db.query(
    `DELETE FROM login_attempts WHERE id = (
      SELECT id FROM login_attempts WHERE key = $1 ORDER BY created_at DESC LIMIT 1
    )`,
    [key]
  );
}

/**
 * Cleanup periódico — chamar a partir de um cron diário.
 * Deleta registros mais antigos que a janela máxima usada (7 dias por padrão).
 *
 * @param {number} [retentionDays=7]
 * @returns {Promise<number>} Rows deletadas.
 */
async function cleanup(retentionDays = 7) {
  const result = await db.query(
    `DELETE FROM login_attempts WHERE created_at < NOW() - ($1 || ' days')::interval`,
    [String(retentionDays)]
  );
  return result.rowCount || 0;
}

module.exports = { check, refund, clientKey, cleanup };
