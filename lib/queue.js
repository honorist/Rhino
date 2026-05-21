/**
 * @file Fila de jobs assíncronos via pg-boss — embutida no processo do servidor.
 *
 * Usa o próprio Postgres (pg-boss cria e mantém o schema `pgboss`) — sem Redis
 * e sem container extra. Serve para tirar do caminho do request trabalho que
 * ninguém está esperando na tela: envio de e-mail, etc.
 *
 * Degradação segura: se a fila não puder iniciar (sem DATABASE_URL ou erro de
 * conexão), `enqueue()` devolve `null` e o chamador faz o trabalho inline.
 */
// pg-boss v12 é ESM — require() devolve o namespace; o construtor é o named export `PgBoss`.
const { PgBoss } = require('pg-boss');

let boss = null;
let starting = null;

/**
 * Inicia (uma vez) o pg-boss. Devolve a instância, ou `null` se indisponível.
 * @returns {Promise<import('pg-boss') | null>}
 */
async function start() {
  if (boss) return boss;
  if (!process.env.DATABASE_URL) return null;
  if (!starting) {
    starting = (async () => {
      const b = new PgBoss(process.env.DATABASE_URL);
      b.on('error', (e) => console.error('[queue] erro:', e && e.message));
      await b.start();
      boss = b;
      console.log('[queue] pg-boss iniciado');
      return b;
    })().catch((e) => {
      console.error('[queue] falha ao iniciar pg-boss:', e && e.message);
      starting = null; // permite nova tentativa numa chamada futura
      return null;
    });
  }
  return starting;
}

/**
 * Registra um worker para uma fila. O `handler` recebe o `data` do job; se
 * lançar, o pg-boss reprocessa o job conforme a política de retry.
 * @param {string} name
 * @param {(data: any) => Promise<void>} handler
 * @returns {Promise<boolean>} true se registrou
 */
async function work(name, handler) {
  const b = await start();
  if (!b) return false;
  try {
    await b.createQueue(name).catch(() => {}); // idempotente — ignora "já existe"
    await b.work(name, async (jobs) => {
      const list = Array.isArray(jobs) ? jobs : [jobs];
      for (const job of list) await handler(job && job.data !== undefined ? job.data : job);
    });
    return true;
  } catch (e) {
    console.error(`[queue] falha ao registrar worker '${name}':`, e && e.message);
    return false;
  }
}

/**
 * Enfileira um job. Devolve o id do job, ou `null` se a fila estiver
 * indisponível (nesse caso o chamador deve fazer o trabalho inline).
 * @param {string} name
 * @param {any} data
 * @returns {Promise<string | null>}
 */
async function enqueue(name, data) {
  const b = await start();
  if (!b) return null;
  try {
    await b.createQueue(name).catch(() => {});
    return await b.send(name, data);
  } catch (e) {
    console.error(`[queue] falha ao enfileirar '${name}':`, e && e.message);
    return null;
  }
}

module.exports = { start, work, enqueue };
