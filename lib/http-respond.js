'use strict';
/**
 * @file Respostas HTTP padronizadas — sendJson / sendError.
 *
 * Funções puras: dependem só de `res`, `console` e `JSON`.
 *
 * O reporter de erro é INJETADO (`setErrorReporter`) em vez de importado: assim
 * este módulo continua sem dependência — quem liga a observabilidade é o
 * server.js no boot. Sem injeção, o comportamento é exatamente o de antes.
 */

/** @type {((status: number, message: string) => void) | null} */
let errorReporter = null;

/**
 * Liga um reporter para os 5xx (ver lib/observability.js). Chamado uma vez no boot.
 * @param {(status: number, message: string) => void} fn
 */
function setErrorReporter(fn) {
  errorReporter = typeof fn === 'function' ? fn : null;
}

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

// Fragmentos típicos de erro CRU do Postgres (inglês) — vazam nome de tabela/coluna/constraint.
// As mensagens de validação do app são em português, então não casam (sem falso-positivo).
const PG_LEAK =
  /(violates [\w\s-]*constraint|duplicate key value|null value in column|(column|relation) "[^"]*" does not exist|invalid input syntax for|value too long for type|numeric field overflow)/i;

/**
 * Em 4xx, troca uma mensagem que parece erro cru do Postgres por uma genérica
 * (e loga a original no servidor). Mensagens normais passam intactas.
 * @param {number} status
 * @param {string} message
 * @returns {string}
 */
function redactPgLeak(status, message) {
  if (typeof message !== 'string' || !PG_LEAK.test(message)) return message;
  console.error(`[4xx-pg ${new Date().toISOString()}] ${status}: ${message}`); // detalhe só no servidor
  if (/duplicate key value/i.test(message)) return 'Registro já existe (valor duplicado).';
  if (/foreign key|violates foreign/i.test(message)) return 'Referência inválida: registro relacionado não encontrado.';
  if (/null value in column|not-null/i.test(message)) return 'Campo obrigatório ausente.';
  return 'Não foi possível processar a requisição (dados inválidos).';
}

/**
 * Responde com erro JSON. Em 5xx, loga no servidor e oculta o detalhe do
 * cliente (vaza só um timestamp). Em 4xx, redige erros crus do Postgres.
 * @param {http.ServerResponse} res
 * @param {number} status
 * @param {string} message
 */
function sendError(res, status, message) {
  let payload;
  if (status >= 500) {
    const ts = new Date().toISOString();
    console.error(`[5xx ${ts}] ${status}: ${message}`);
    // Reportar não pode derrubar a resposta do usuário.
    if (errorReporter) {
      try {
        errorReporter(status, message);
      } catch (e) {
        console.error('[http-respond] errorReporter falhou:', e && e.message);
      }
    }
    payload = { error: 'Erro interno do servidor', ts };
  } else {
    payload = { error: redactPgLeak(status, message) };
  }
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

module.exports = { sendJson, sendError, setErrorReporter };
