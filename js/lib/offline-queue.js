/* Rhino — Regras PURAS da fila offline (RDO offline-first).
 *
 * Este arquivo NÃO toca IndexedDB, NÃO faz fetch e NÃO mexe no DOM.
 * Só decide: "esta requisição deve ser enfileirada?", "este erro deve reenviar,
 * descartar ou notificar?" e "quanto esperar antes do próximo envio?".
 *
 * Motivo: essas são regras de NEGÓCIO (o encarregado não pode perder o RDO
 * preenchido na obra, e um lançamento não pode duplicar num retry de rede),
 * então precisam de teste — ver test/offline-queue.test.js.
 *
 * Carregado tanto na página (window.RhinoOfflineQueue) quanto potencialmente no
 * Service Worker (self.RhinoOfflineQueue via importScripts).
 */
(function (root) {
  'use strict';

  // ── Constantes de política ────────────────────────────────────────────────
  const MUTATION_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

  /** Tentativas totais antes de desistir (a 1ª é o envio original). */
  const MAX_ATTEMPTS = 5;
  /** Espera base do backoff exponencial. */
  const BASE_DELAY_MS = 2000;
  /** Teto do backoff — obra com sinal ruim não pode ficar esperando 1h. */
  const MAX_DELAY_MS = 5 * 60 * 1000;

  /**
   * 4xx que, apesar de 4xx, são transitórios de rede/infra e MERECEM retry.
   * 408 Request Timeout · 425 Too Early · 429 Too Many Requests
   */
  const RETRYABLE_4XX = [408, 425, 429];

  /**
   * Rotas que NUNCA entram na fila. Autenticação offline não faz sentido
   * (o servidor precisa validar a senha na hora) e enfileirar login/logout
   * criaria um replay de credencial horas depois.
   */
  const NEVER_QUEUE = [/^\/api\/auth(\/|$)/i, /^\/api\/login/i, /^\/api\/logout/i];

  // ── Helpers de URL/método ────────────────────────────────────────────────

  function normalizeMethod(method) {
    return String(method == null ? 'GET' : method).toUpperCase();
  }

  function isMutationMethod(method) {
    return MUTATION_METHODS.indexOf(normalizeMethod(method)) !== -1;
  }

  /**
   * Base sentinela usada para resolver URLs relativas sem depender de
   * `location` (mantém a função pura e testável fora do browser).
   */
  const SELF_ORIGIN = 'http://rhino.local';

  function parseUrl(url) {
    if (typeof url !== 'string' || url === '') return null;
    try {
      return new URL(url, SELF_ORIGIN);
    } catch {
      return null;
    }
  }

  /** Extrai só o pathname. Entrada inválida devolve string vazia. */
  function pathOf(url) {
    const u = parseUrl(url);
    return u ? u.pathname : '';
  }

  /**
   * Só mutação de API do PRÓPRIO app entra na fila. Estático, GET, rota de
   * terceiro (CDN, integração externa) e autenticação ficam de fora.
   *
   * `origin` é injetado (quem chama passa location.origin); sem ele, só URLs
   * relativas passam — nunca enfileiramos às cegas uma URL absoluta de fora.
   */
  function isQueueableUrl(url, origin) {
    const u = parseUrl(url);
    if (!u) return false;
    if (u.origin !== SELF_ORIGIN && u.origin !== origin) return false;
    const p = u.pathname;
    if (!p.startsWith('/api/')) return false;
    for (const re of NEVER_QUEUE) if (re.test(p)) return false;
    return true;
  }

  /**
   * BR-OQ-001/002 — decide se a requisição vira item de fila.
   *
   * @param {object} req
   * @param {string} req.method
   * @param {string} req.url
   * @param {boolean} req.online        navigator.onLine no momento
   * @param {boolean} req.networkError  o fetch já falhou por rede?
   * @param {string} [req.origin]       location.origin do app
   * @returns {boolean}
   */
  function shouldQueue(req) {
    const o = req || {};
    if (!isMutationMethod(o.method)) return false;
    if (!isQueueableUrl(o.url, o.origin)) return false;
    // Online e sem falha de rede = caminho normal, NÃO mexemos nele.
    if (o.online && !o.networkError) return false;
    return true;
  }

  // ── Classificação do resultado de um envio ───────────────────────────────

  /**
   * BR-OQ-003..007 — o coração da fila: o que fazer com o resultado de uma
   * tentativa de envio.
   *
   * - 2xx/3xx ...................... 'ok'    → sai da fila, sucesso
   * - falha de rede ................ 'retry' → volta pra fila com backoff
   * - 5xx .......................... 'retry' → servidor caiu, não é culpa do dado
   * - 408/425/429 .................. 'retry' → transitório, apesar de 4xx
   * - 401/403 ...................... 'drop'  → sessão/permissão: retry não resolve
   * - demais 4xx ................... 'drop'  → regra de negócio recusou o dado
   * - tentativas esgotadas ......... 'drop'  → notifica em vez de tentar pra sempre
   *
   * @returns {{action:'ok'|'retry'|'drop', reason:string, notify:boolean, message:string}}
   */
  function classifyOutcome(outcome) {
    const o = outcome || {};
    const maxAttempts =
      Number.isFinite(o.maxAttempts) && o.maxAttempts > 0 ? o.maxAttempts : MAX_ATTEMPTS;
    const attempts = Number.isFinite(o.attempts) && o.attempts > 0 ? o.attempts : 1;
    const status = Number.isFinite(o.status) ? o.status : null;
    // Sem status utilizável = não houve resposta HTTP = falha de rede.
    const networkError = !!o.networkError || status === null;

    const exhausted = (reason, message) =>
      attempts >= maxAttempts
        ? {
            action: 'drop',
            reason: 'esgotado',
            notify: true,
            message:
              'Não foi possível enviar após ' +
              maxAttempts +
              ' tentativas. Registro mantido no dispositivo.',
          }
        : { action: 'retry', reason, notify: false, message };

    if (networkError) {
      return exhausted('rede', 'Sem sinal — será reenviado automaticamente.');
    }

    if (status >= 200 && status < 400) {
      return { action: 'ok', reason: 'sucesso', notify: false, message: 'Enviado.' };
    }

    if (status >= 500) {
      return exhausted('servidor', 'Servidor indisponível — será reenviado automaticamente.');
    }

    if (RETRYABLE_4XX.indexOf(status) !== -1) {
      return exhausted('transitorio', 'Servidor ocupado — será reenviado automaticamente.');
    }

    if (status === 401 || status === 403) {
      return {
        action: 'drop',
        reason: 'auth',
        notify: true,
        message: 'Sessão expirada ou sem permissão. Faça login novamente e refaça o lançamento.',
      };
    }

    // Qualquer outro 4xx é o servidor dizendo "esse dado está errado".
    // Reenviar não vai resolver — some da fila e vira notificação.
    return {
      action: 'drop',
      reason: 'regra',
      notify: true,
      message: 'O servidor recusou o registro. Corrija e lance novamente.',
    };
  }

  // ── Backoff ──────────────────────────────────────────────────────────────

  /**
   * BR-OQ-008 — backoff exponencial com teto e jitter determinístico.
   *
   * `jitter` é INJETADO (0..1) em vez de sorteado aqui: mantém a função pura e
   * testável. Quem chama passa Math.random().
   *
   * @param {number} attempts tentativas já feitas (1 = primeira falha)
   * @param {{base?:number, max?:number, jitter?:number}} [opts]
   * @returns {number} milissegundos de espera
   */
  function backoffDelay(attempts, opts) {
    const o = opts || {};
    const base = Number.isFinite(o.base) && o.base > 0 ? o.base : BASE_DELAY_MS;
    const max = Number.isFinite(o.max) && o.max > 0 ? o.max : MAX_DELAY_MS;
    const jitter = Number.isFinite(o.jitter) ? Math.min(1, Math.max(0, o.jitter)) : 0;
    const n = Number.isFinite(attempts) && attempts > 0 ? Math.floor(attempts) : 1;

    // 2^(n-1) satura rápido; limita o expoente para não virar Infinity.
    const growth = Math.pow(2, Math.min(n - 1, 20));
    const capped = Math.min(base * growth, max);
    // Jitter de até +25% evita que 10 celulares reconectem e batam juntos.
    return Math.min(Math.round(capped * (1 + 0.25 * jitter)), max);
  }

  /** Momento em que o item pode ser tentado de novo. */
  function nextAttemptAt(attempts, now, opts) {
    const t = Number.isFinite(now) ? now : 0;
    return t + backoffDelay(attempts, opts);
  }

  /** Item já pode ser reenviado? Item sem `nextAttemptAt` é sempre elegível. */
  function isDue(item, now) {
    const t = Number.isFinite(now) ? now : 0;
    const due = item && Number.isFinite(item.nextAttemptAt) ? item.nextAttemptAt : 0;
    return due <= t;
  }

  // ── Ordem ────────────────────────────────────────────────────────────────

  /**
   * BR-OQ-009 — ordem de enfileiramento é ordem de envio. Um RDO criado antes
   * de sua foto tem que chegar antes, senão o servidor rejeita a foto órfã.
   * `seq` (autoincrement do IndexedDB) é a fonte da verdade; `ts` só desempata
   * quando não há seq.
   */
  function sortQueue(items) {
    const arr = Array.isArray(items) ? items.slice() : [];
    return arr.sort((a, b) => {
      const sa = Number.isFinite(a && a.seq) ? a.seq : Number.MAX_SAFE_INTEGER;
      const sb = Number.isFinite(b && b.seq) ? b.seq : Number.MAX_SAFE_INTEGER;
      if (sa !== sb) return sa - sb;
      const ta = Number.isFinite(a && a.ts) ? a.ts : 0;
      const tb = Number.isFinite(b && b.ts) ? b.ts : 0;
      return ta - tb;
    });
  }

  // ── Idempotência ─────────────────────────────────────────────────────────

  /**
   * BR-OQ-010 — a chave é gerada UMA vez, no primeiro envio, e viaja com o item
   * em todas as retentativas. É isso que faz o servidor (withIdempotency em
   * server.js) devolver a resposta original em vez de duplicar o lançamento
   * quando a requisição chegou mas a resposta se perdeu.
   *
   * `rand` é injetado para manter a função testável.
   */
  function newIdempotencyKey(rand) {
    const r = typeof rand === 'function' ? rand : Math.random;
    let out = '';
    for (let i = 0; i < 4; i++) {
      const bloco = Math.floor(((Math.abs(Number(r())) || 0) % 1) * 0x100000000);
      out += bloco.toString(16).padStart(8, '0');
    }
    return out;
  }

  /**
   * A chave só é anexada quando o corpo é serializável de forma estável
   * (string/JSON) ou inexistente. O servidor faz hash do corpo para detectar
   * "mesma chave, corpo diferente" (422); com multipart o hash não é estável,
   * então nesses casos não mandamos a chave.
   */
  function shouldAttachIdempotencyKey(req) {
    const o = req || {};
    if (!isMutationMethod(o.method)) return false;
    if (!isQueueableUrl(o.url, o.origin)) return false;
    return o.bodyKind !== 'formdata' && o.bodyKind !== 'binary';
  }

  // ── Resumo para a UI ─────────────────────────────────────────────────────

  function queueSummary(items) {
    const arr = Array.isArray(items) ? items : [];
    let comErro = 0;
    for (const it of arr) if (it && it.ultimoErro) comErro++;
    return { total: arr.length, comErro, pendentes: arr.length - comErro };
  }

  /** Texto pt-BR do badge de pendências. Vazio = nada a mostrar. */
  function describeQueue(total) {
    const n = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
    if (n === 0) return '';
    if (n === 1) return '1 registro aguardando envio';
    return n + ' registros aguardando envio';
  }

  const api = {
    MUTATION_METHODS,
    MAX_ATTEMPTS,
    BASE_DELAY_MS,
    MAX_DELAY_MS,
    RETRYABLE_4XX,
    normalizeMethod,
    isMutationMethod,
    pathOf,
    isQueueableUrl,
    shouldQueue,
    classifyOutcome,
    backoffDelay,
    nextAttemptAt,
    isDue,
    sortQueue,
    newIdempotencyKey,
    shouldAttachIdempotencyKey,
    queueSummary,
    describeQueue,
  };

  root.RhinoOfflineQueue = api;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : globalThis);
