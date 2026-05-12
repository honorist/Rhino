/**
 * @file Event bus para Server-Sent Events (SSE).
 *
 * Mantém lista de clientes HTTP conectados via `GET /api/stream` e publica
 * eventos JSON-serializados em tempo real (presença, mutações nos dados).
 * Cada cliente recebe um heartbeat a cada 25s para atravessar timeouts de
 * proxies (Cloudflare, Caddy, nginx — todos default 30-60s).
 *
 * Singleton: `module.exports = new Bus()` — o mesmo bus é compartilhado por
 * todos os requires; isso é intencional para que mutações de qualquer handler
 * sejam transmitidas a todos os subscribers.
 *
 * @example
 *   const bus = require('./lib/bus');
 *   bus.attach(req, res, { userId, userEmail });   // dentro de GET /api/stream
 *   bus.publish({ entity: 'contracts', action: 'update', id: 42 });
 *   bus.online();   // -> [{userId, userEmail, since}, ...]
 */

/**
 * Intervalo de keepalive em ms. Mantido abaixo de 30s para sobreviver a
 * timeouts default de Cloudflare/nginx.
 * @type {number}
 */
const KEEPALIVE_MS = 25_000;

/**
 * @typedef {object} SSEClient
 * @property {string} id          Identificador efêmero da conexão.
 * @property {import('http').ServerResponse} res  Stream HTTP aberto.
 * @property {string | null} userId
 * @property {string | null} userEmail
 * @property {number} since       Timestamp Date.now() do attach.
 */

/**
 * @typedef {object} MutationEvent
 * @property {string} entity  Nome lógico da entidade ('contracts', 'caixa', ...).
 * @property {'create'|'update'|'delete'} action
 * @property {string|number} [id]
 * @property {string} [by]    Email do usuário que originou a mutação.
 */

class Bus {
  constructor() {
    /** @type {Set<SSEClient>} */
    this.clients = new Set();
    this._heartbeat = setInterval(() => this._heartbeatTick(), KEEPALIVE_MS);
    this._heartbeat.unref?.();
  }

  /**
   * Registra um cliente novo na lista. Escreve headers SSE, envia evento
   * 'hello' com a lista de presentes, e notifica todos da nova presença.
   *
   * @param {import('http').IncomingMessage} req
   * @param {import('http').ServerResponse} res
   * @param {{ userId?: string|null, userEmail?: string|null }} [opts]
   */
  attach(req, res, { userId, userEmail } = {}) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // nginx
    });
    // Comentário inicial pra abrir o stream
    res.write(': connected\n\n');

    const client = {
      id: Math.random().toString(36).slice(2, 10),
      res,
      userId: userId || null,
      userEmail: userEmail || null,
      since: Date.now(),
    };
    this.clients.add(client);

    // Envia identidade + lista atual de online ao recém-chegado.
    this._send(client.res, 'hello', { id: client.id, online: this.online() });
    // Notifica todos (inclusive o próprio) da nova presença — útil para confirmar.
    this._broadcast('presence', { online: this.online() });

    const cleanup = () => {
      this.clients.delete(client);
      try { res.end(); } catch {}
      this._broadcast('presence', { online: this.online() });
    };
    req.on('close', cleanup);
    req.on('error', cleanup);
    res.on('error', cleanup);
  }

  /**
   * Transmite um evento de mutação a todos os clientes conectados.
   *
   * @param {MutationEvent} event
   */
  publish(event) {
    if (!event || !event.entity) return;
    this._broadcast('mutation', event);
  }

  /**
   * Lista deduplicada de usuários atualmente conectados (por userId ou email).
   * Múltiplas abas do mesmo usuário aparecem apenas uma vez.
   *
   * @returns {Array<{userId: string|null, userEmail: string|null, since: number}>}
   */
  online() {
    const seen = new Map();
    for (const c of this.clients) {
      const key = c.userId || c.userEmail || c.id;
      if (!seen.has(key)) {
        seen.set(key, { userId: c.userId, userEmail: c.userEmail, since: c.since });
      }
    }
    return [...seen.values()];
  }

  /**
   * Envia um evento SSE para um único cliente. Silencia falha (socket fechado).
   *
   * @param {import('http').ServerResponse} res
   * @param {string} type
   * @param {unknown} data
   * @private
   */
  _send(res, type, data) {
    try {
      res.write(`event: ${type}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {
      // socket fechou
    }
  }

  /**
   * Envia um evento para todos os clientes conectados.
   * @param {string} type
   * @param {unknown} data
   * @private
   */
  _broadcast(type, data) {
    for (const c of this.clients) this._send(c.res, type, data);
  }

  /**
   * Heartbeat — escreve um comentário SSE em cada cliente; sockets fechados
   * são automaticamente removidos da lista.
   * @private
   */
  _heartbeatTick() {
    for (const c of this.clients) {
      try { c.res.write(': ping\n\n'); } catch { this.clients.delete(c); }
    }
  }
}

module.exports = new Bus();
