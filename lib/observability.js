'use strict';
/**
 * @file Observabilidade — captura de erro com sink plugável (steering §5:
 * port + adapter, stub local como default, real por configuração).
 *
 * Antes disso a produção era cega: erro só ia para `console.error`/stdout, sem
 * agregação, sem alerta e sem ninguém olhando — um 500 só era descoberto quando
 * um usuário reclamava.
 *
 * Sinks (`OBSERVABILITY_SINK`):
 *   - `console` (DEFAULT) — uma linha JSON estruturada em stdout. Zero dependência,
 *     e já é o que o Railway/Docker coleta.
 *   - `webhook`           — POST em `OBSERVABILITY_WEBHOOK_URL` (Slack, Discord,
 *     Better Stack, qualquer coletor). Escolhido no lugar de um SDK para não
 *     acrescentar cadeia de suprimentos por 90% do valor.
 *   - `noop`              — silêncio (default sob NODE_ENV=test).
 *
 * INVARIANTE: observabilidade NUNCA derruba o request. Toda falha de sink é
 * engolida aqui (com aviso local). Se este módulo puder lançar, ele vira a causa
 * do incidente que deveria estar apenas reportando.
 *
 * As regras testáveis (redação de segredo, fingerprint e throttle) são puras e
 * recebem o "agora" injetado — ver test/observability.test.js.
 */

/** Chaves cujo VALOR nunca pode sair da máquina (mesmo espírito do `_auditBody`). */
const SENSITIVE_KEY =
  /(pass(word|wd)?|senha|token|secret|authorization|cookie|api[-_]?key|credential|cpf|hash)/i;

const REDACTED = '[REDACTED]';
const MAX_DEPTH = 4;
const MAX_STRING = 2000;

/**
 * Cópia profunda com valores sensíveis mascarados e tamanho limitado.
 * Pura. Não altera a entrada.
 *
 * @param {unknown} value
 * @param {number} [depth]
 * @returns {unknown}
 */
function redact(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (depth >= MAX_DEPTH) return '[deep]';

  if (typeof value === 'string') {
    return value.length > MAX_STRING ? value.slice(0, MAX_STRING) + '…[truncado]' : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Error) {
    return { name: value.name, message: redact(value.message, depth + 1), stack: value.stack };
  }
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEY.test(k) ? REDACTED : redact(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

/**
 * Chave estável de agrupamento do erro: nome + mensagem sem dígitos + 1º frame
 * do stack. Sem remover os dígitos, `id=123 não encontrado` viraria um evento
 * novo a cada requisição e o throttle nunca agruparia nada.
 *
 * @param {Error|string} err
 * @returns {string}
 */
function fingerprint(err) {
  if (!err) return 'unknown';
  const name = (err && err.name) || 'Error';
  const raw = typeof err === 'string' ? err : (err && err.message) || '';
  const msg = String(raw).replace(/\d+/g, '#').slice(0, 200);
  let frame = '';
  if (err && typeof err.stack === 'string') {
    const linha = err.stack.split('\n').find((l) => l.trim().startsWith('at '));
    if (linha) frame = linha.trim().slice(0, 160);
  }
  return `${name}|${msg}|${frame}`;
}

/**
 * Throttle por fingerprint: um erro em laço não pode virar 10.000 webhooks.
 * Deixa passar até `maxPerKey` por janela e conta os suprimidos, para que o
 * primeiro evento da janela seguinte informe quantos foram engolidos.
 *
 * O "agora" é INJETADO (steering §5) — testável com relógio fixo.
 *
 * @param {{windowMs?: number, maxPerKey?: number, maxKeys?: number}} [opts]
 * @returns {(key: string, now: number) => {send: boolean, suprimidos: number}}
 */
function createThrottle(opts = {}) {
  const windowMs = opts.windowMs || 60_000;
  const maxPerKey = opts.maxPerKey || 5;
  const maxKeys = opts.maxKeys || 500; // teto de memória do próprio throttle
  const janelas = new Map();

  return function shouldSend(key, now) {
    let j = janelas.get(key);
    if (!j || now - j.inicio >= windowMs) {
      const suprimidos = j ? j.suprimidos : 0;
      j = { inicio: now, enviados: 0, suprimidos: 0 };
      janelas.set(key, j);
      // Poda simples: sem isso um atacante gera chaves infinitas e vaza memória.
      if (janelas.size > maxKeys) {
        for (const [k, v] of janelas) {
          if (now - v.inicio >= windowMs) janelas.delete(k);
          if (janelas.size <= maxKeys) break;
        }
      }
      j.enviados = 1;
      return { send: true, suprimidos };
    }
    if (j.enviados < maxPerKey) {
      j.enviados += 1;
      return { send: true, suprimidos: 0 };
    }
    j.suprimidos += 1;
    return { send: false, suprimidos: 0 };
  };
}

// ─── Adapters (o detalhe; a regra acima não conhece nenhum deles) ────────────

const sinks = {
  noop() {},

  console(evento) {
    // Uma linha JSON — o coletor do Railway/Docker já entende.
    console.error(JSON.stringify({ tipo: 'observability', ...evento }));
  },

  webhook(evento) {
    const url = process.env.OBSERVABILITY_WEBHOOK_URL;
    if (!url) {
      sinks.console(evento);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    // Sem await: o request do usuário não espera o coletor.
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: resumoTexto(evento), evento }),
      signal: ctrl.signal,
    })
      .catch((e) => console.error('[observability] webhook falhou:', e && e.message))
      .finally(() => clearTimeout(timer));
  },
};

/** Linha curta legível — Slack/Discord mostram isso direto. */
function resumoTexto(e) {
  const onde = e.contexto && e.contexto.rota ? ` em ${e.contexto.metodo || ''} ${e.contexto.rota}` : '';
  return `[${e.nivel}] ${e.app}@${e.versao}${onde}: ${e.mensagem}`;
}

function sinkAtivo() {
  const escolhido = process.env.OBSERVABILITY_SINK;
  if (escolhido && sinks[escolhido]) return sinks[escolhido];
  if (process.env.NODE_ENV === 'test') return sinks.noop;
  return sinks.console;
}

// ─── API pública ─────────────────────────────────────────────────────────────

const throttle = createThrottle({
  windowMs: Number(process.env.OBSERVABILITY_WINDOW_MS) || 60_000,
  maxPerKey: Number(process.env.OBSERVABILITY_MAX_PER_KEY) || 5,
});

/**
 * Emite um evento. Nunca lança — falha de sink vira log local.
 * @param {'error'|'warn'|'info'} nivel
 * @param {string} mensagem
 * @param {object} [contexto]
 * @param {Error} [erro]
 */
function emit(nivel, mensagem, contexto, erro) {
  try {
    const chave = fingerprint(erro || mensagem);
    const { send, suprimidos } = throttle(chave, Date.now());
    if (!send) return;

    const evento = {
      nivel,
      mensagem: String(mensagem || '').slice(0, MAX_STRING),
      app: 'rhino',
      versao: process.env.APP_VERSION || 'dev',
      ambiente: process.env.NODE_ENV || 'development',
      ts: new Date().toISOString(),
      fingerprint: chave,
      contexto: redact(contexto || {}),
      stack: erro && erro.stack ? String(erro.stack).slice(0, 4000) : undefined,
    };
    if (suprimidos > 0) evento.suprimidosNaJanelaAnterior = suprimidos;

    sinkAtivo()(evento);
  } catch (e) {
    // Última linha de defesa: reportar não pode virar o incidente.
    try {
      console.error('[observability] falha ao emitir evento:', e && e.message);
    } catch {
      /* nada mais a fazer */
    }
  }
}

/**
 * @param {Error|string} err
 * @param {object} [contexto]  Ex.: { metodo, rota, status, userId }
 */
function captureError(err, contexto) {
  const erro = err instanceof Error ? err : null;
  const msg = erro ? erro.message : String(err);
  emit('error', msg, contexto, erro);
}

/**
 * @param {string} mensagem
 * @param {'error'|'warn'|'info'} [nivel]
 * @param {object} [contexto]
 */
function captureMessage(mensagem, nivel = 'info', contexto) {
  emit(nivel, mensagem, contexto, null);
}

/** Nome do sink em uso — exposto em /api/health para conferir a config em prod. */
function sinkAtivoNome() {
  const escolhido = process.env.OBSERVABILITY_SINK;
  if (escolhido && sinks[escolhido]) return escolhido;
  return process.env.NODE_ENV === 'test' ? 'noop' : 'console';
}

module.exports = {
  captureError,
  captureMessage,
  sinkAtivoNome,
  // exportados para teste (regras puras)
  redact,
  fingerprint,
  createThrottle,
  SENSITIVE_KEY,
  REDACTED,
};
