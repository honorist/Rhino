'use strict';
/**
 * @file Monta o payload de backup completo (JSON) a partir de TODOS os repos
 * registrados em `db/repos/index.js` — antes (achado 3.1 da varredura
 * 2026-09-08) `handleBackupDownload`/`_runEmailBackup` em server.js tinham
 * uma lista de 15 tabelas hardcoded e DUPLICADA nos dois lugares, faltando
 * ~metade dos domínios do produto (RDO, propostas, cronograma, cotações,
 * subcontratados, ferramentas, equipamentos, composições, SSMA, punch,
 * treinamentos, EPIs, ponto) — perder o Postgres hoje perdia esses dados,
 * mesmo com o backup "completo" rodando.
 *
 * Cada repo novo em `db/repos/index.js` entra automaticamente aqui — nada a
 * lembrar de atualizar quando um domínio novo nasce.
 */

/** Tabelas transitórias/de segurança fora do backup de dado de negócio. */
const EXCLUDE_TABLES = new Set([
  'sessions',
  'login_attempts',
  'password_reset_tokens',
  'idempotency_keys',
  'portal_sessions',
]);

/**
 * @param {Record<string, object>} repos  `db/repos/index.js` (ou um dublê nos testes).
 * @param {{appVersion?: string}} [opts]
 * @returns {Promise<object>}
 */
async function buildFullBackupPayload(repos, opts = {}) {
  const safe = async (fn) => {
    try {
      return await fn();
    } catch (e) {
      console.warn('[dump] coleta falhou (resultado vazio):', e && e.message);
      return [];
    }
  };

  const payload = {
    _meta: {
      version: opts.appVersion || null,
      generatedAt: new Date().toISOString(),
      format: 'rhino-backup-v2',
    },
  };

  for (const repo of Object.values(repos || {})) {
    if (!repo || !repo.table || EXCLUDE_TABLES.has(repo.table)) continue;
    if (payload[repo.table] !== undefined) continue; // já coletado por outra chave da mesma tabela

    if (repo.table === 'contracts' && typeof repo.findAllWithChildren === 'function') {
      payload.contracts = await safe(() => repo.findAllWithChildren());
      continue;
    }
    // PII cifrada (recursos, candidatos): backup grava cifrado, não decifra.
    const finder = typeof repo.findAllRaw === 'function' ? repo.findAllRaw : repo.findAll;
    if (typeof finder !== 'function') continue;
    payload[repo.table] = await safe(() => finder({}, { limit: null }));
  }

  if (Array.isArray(payload.users)) {
    payload.users = payload.users.map((u) => {
      const { passwordHash, password_hash, resetToken, reset_token, ...rest } = u;
      return rest;
    });
  }

  return payload;
}

module.exports = { buildFullBackupPayload, EXCLUDE_TABLES };
