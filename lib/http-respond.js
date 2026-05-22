'use strict';
/**
 * @file Respostas HTTP padronizadas — sendJson / sendError.
 *
 * Extraído de server.js sem nenhuma mudança de comportamento (Fase 1 do
 * desmembramento). Funções puras: dependem só de `res`, `console` e `JSON`.
 */

/**
 * Responde com JSON.
 * @param {http.ServerResponse} res
 * @param {*} body              Objeto serializável.
 * @param {number} [status=200]
 */
function sendJson(res, body, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

/**
 * Responde com erro JSON. Em 5xx, loga no servidor e oculta o detalhe do
 * cliente (vaza só um timestamp para correlação).
 * @param {http.ServerResponse} res
 * @param {number} status
 * @param {string} message
 */
function sendError(res, status, message) {
  let payload;
  if (status >= 500) {
    const ts = new Date().toISOString();
    console.error(`[5xx ${ts}] ${status}: ${message}`);
    payload = { error: 'Erro interno do servidor', ts };
  } else {
    payload = { error: message };
  }
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

module.exports = { sendJson, sendError };
