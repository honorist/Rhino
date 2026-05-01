/* Rhino · Event bus para SSE
   Mantem lista de clientes conectados e publica eventos JSON serializados.
   Uso (server.js):
     const bus = require('./lib/bus');
     bus.attach(req, res, { userId, userEmail });   // dentro de GET /api/stream
     bus.publish({ entity: 'contracts', action: 'update', id: 42 });
     bus.online();   // -> [{userId, userEmail}, ...]
*/

const KEEPALIVE_MS = 25_000; // < 30s pra atravessar proxies/Cloudflare

class Bus {
  constructor() {
    this.clients = new Set(); // { id, res, userId, userEmail, since }
    this._heartbeat = setInterval(() => this._heartbeatTick(), KEEPALIVE_MS);
    this._heartbeat.unref?.();
  }

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

    // Manda lista atual de online + identidade pro recém-chegado
    this._send(client.res, 'hello', { id: client.id, online: this.online() });
    // Notifica todos que entrou alguém (inclusive o próprio — útil pra confirmar)
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

  publish(event) {
    // event: { entity, action, id, by? }
    if (!event || !event.entity) return;
    this._broadcast('mutation', event);
  }

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

  _send(res, type, data) {
    try {
      res.write(`event: ${type}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {
      // socket fechou
    }
  }

  _broadcast(type, data) {
    for (const c of this.clients) this._send(c.res, type, data);
  }

  _heartbeatTick() {
    for (const c of this.clients) {
      try { c.res.write(': ping\n\n'); } catch { this.clients.delete(c); }
    }
  }
}

module.exports = new Bus();
