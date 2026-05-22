'use strict';
/**
 * @file Geração de IDs únicos curtos — `<prefixo>_<timestamp36><random>`.
 *
 * Extraído de server.js (Fase A): é utilitário puro usado por praticamente
 * todos os handlers, então precisa estar em `lib/` para os módulos
 * `handlers/*.js` poderem fazer `require` direto.
 */
const crypto = require('crypto');

/**
 * @param {string} prefix  Prefixo curto do domínio (ex.: 'cp', 'rdo', 'pses').
 * @returns {string}
 */
function generateId(prefix) {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(4).toString('hex');
  return `${prefix}_${timestamp}${random}`;
}

module.exports = { generateId };
