/* Rhino — RDO offline-first (roadmap 27)
 *
 * PROBLEMA: o encarregado preenche o RDO na obra, onde falta sinal. Antes, toda
 * mutação sem rede simplesmente falhava e o trabalho de campo se perdia.
 *
 * SOLUÇÃO: uma fila de mutações PERSISTENTE em IndexedDB. Sem sinal, a mutação
 * é gravada no aparelho e a UI recebe um "salvo no dispositivo" em vez de erro.
 * Quando a rede volta, a fila é reenviada NA ORDEM em que foi criada, com
 * `Idempotency-Key` (contrato de withIdempotency em server.js) para que um retry
 * não duplique lançamento.
 *
 * Por que IndexedDB e não localStorage: o payload de RDO carrega foto (base64 /
 * Blob) e estoura a cota de ~5MB do localStorage — a fila sumiria em silêncio.
 *
 * REGRA DE OURO: o caminho ONLINE não muda. Se há rede, a requisição vai direto
 * pro `fetch` original e a resposta (inclusive 4xx/5xx) chega ao Store como
 * sempre. A fila só entra em cena quando o navegador está offline ou quando o
 * fetch falha por rede.
 *
 * As DECISÕES ("enfileirar? reenviar? descartar? quanto esperar?") não moram
 * aqui — moram em js/lib/offline-queue.js, que é puro e coberto por
 * test/offline-queue.test.js. Este arquivo é só encanamento (IndexedDB, fetch,
 * eventos, Background Sync).
 */
(function () {
  'use strict';

  const DB_NAME = 'rhino-offline';
  const DB_VERSION = 1;
  const STORE = 'mutations';
  const SYNC_TAG = 'rhino-offline-sync';
  /** Fallback de retry no próprio app — Background Sync não existe no iOS. */
  const POLL_MS = 20000;

  const _origFetch = window.fetch.bind(window);

  let _syncing = false;
  let _pollTimer = null;
  let _count = 0;

  // ── Carregamento das regras puras ─────────────────────────────────────────
  // index.html ainda não referencia js/lib/offline-queue.js (não é um arquivo
  // que este trabalho pode editar), então carregamos sob demanda. Enquanto o
  // módulo não chega, o wrapper de fetch é 100% passthrough — na dúvida, o
  // comportamento online é preservado.
  let _rules = window.RhinoOfflineQueue || null;
  const _rulesReady = _rules
    ? Promise.resolve(_rules)
    : new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = './js/lib/offline-queue.js';
        s.async = false;
        s.onload = () => {
          _rules = window.RhinoOfflineQueue || null;
          resolve(_rules);
        };
        s.onerror = () => {
          console.error('[offline] regras da fila não carregaram — app segue só online');
          resolve(null);
        };
        (document.head || document.documentElement).appendChild(s);
      });

  // ── IndexedDB ─────────────────────────────────────────────────────────────

  let _dbPromise = null;

  function openDb() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      const idb = (typeof indexedDB !== 'undefined' && indexedDB) || window.indexedDB;
      // Safari em modo privado antigo expõe a API mas explode ao abrir — daí o
      // reject explícito em vez de assumir que existe.
      if (!idb) return reject(new Error('IndexedDB indisponível'));
      const req = idb.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          // keyPath autoincremental: a chave numérica JÁ é a ordem de
          // enfileiramento, e o cursor do IndexedDB percorre em ordem de chave.
          db.createObjectStore(STORE, { keyPath: 'seq', autoIncrement: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch((e) => {
      _dbPromise = null; // permite nova tentativa (ex.: modo privado do Safari)
      throw e;
    });
    return _dbPromise;
  }

  function tx(mode, fn) {
    return openDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          const t = db.transaction(STORE, mode);
          const store = t.objectStore(STORE);
          let resultado;
          let req;
          try {
            req = fn(store);
          } catch (e) {
            return reject(e);
          }
          if (req) {
            req.onsuccess = () => {
              resultado = req.result;
            };
          }
          t.oncomplete = () => resolve(resultado);
          t.onerror = () => reject(t.error);
          t.onabort = () => reject(t.error);
        })
    );
  }

  const dbAll = () => tx('readonly', (s) => s.getAll());
  const dbAdd = (item) => tx('readwrite', (s) => s.add(item));
  const dbPut = (item) => tx('readwrite', (s) => s.put(item));
  const dbDelete = (seq) => tx('readwrite', (s) => s.delete(seq));
  const dbClear = () => tx('readwrite', (s) => s.clear());
  const dbCount = () => tx('readonly', (s) => s.count());

  // ── Serialização de corpo ─────────────────────────────────────────────────

  function headersToObject(h) {
    const out = {};
    if (!h) return out;
    if (typeof Headers !== 'undefined' && h instanceof Headers) {
      h.forEach((v, k) => {
        out[k] = v;
      });
      return out;
    }
    if (Array.isArray(h)) {
      for (const par of h) if (par && par.length === 2) out[par[0]] = par[1];
      return out;
    }
    for (const k of Object.keys(h)) out[k] = h[k];
    return out;
  }

  /** Descreve o corpo de forma armazenável no IndexedDB (structured clone). */
  function describeBody(body) {
    if (body === undefined || body === null) return { bodyKind: 'none', body: null };
    if (typeof body === 'string') return { bodyKind: 'json', body };
    if (typeof FormData !== 'undefined' && body instanceof FormData) {
      const partes = [];
      // File/Blob são clonáveis pelo IndexedDB — a foto do RDO sobrevive a um
      // fechamento do app e volta intacta na sincronização.
      for (const par of body.entries()) {
        const nome = par[0];
        const valor = par[1];
        if (typeof Blob !== 'undefined' && valor instanceof Blob) {
          partes.push({ name: nome, value: valor, filename: valor.name || 'arquivo' });
        } else {
          partes.push({ name: nome, value: String(valor) });
        }
      }
      return { bodyKind: 'formdata', body: partes };
    }
    if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
      return { bodyKind: 'json', body: body.toString() };
    }
    if (typeof Blob !== 'undefined' && body instanceof Blob) return { bodyKind: 'binary', body };
    // ArrayBuffer / TypedArray / ReadableStream: não sabemos reconstruir com
    // segurança → não enfileirável (o chamador recebe o erro de rede original).
    return { bodyKind: 'unsupported', body: null };
  }

  function rebuildBody(item) {
    if (item.bodyKind === 'formdata') {
      const fd = new FormData();
      for (const p of item.body || []) {
        if (p.filename) fd.append(p.name, p.value, p.filename);
        else fd.append(p.name, p.value);
      }
      return fd;
    }
    if (item.bodyKind === 'none') return undefined;
    return item.body;
  }

  function buildInit(item) {
    const headers = Object.assign({}, item.headers || {});
    if (item.bodyKind === 'formdata') {
      // O browser precisa gerar o boundary do multipart; um Content-Type fixo
      // vindo da fila quebraria o parse no servidor.
      for (const k of Object.keys(headers)) {
        if (k.toLowerCase() === 'content-type') delete headers[k];
      }
    }
    if (item.idempotencyKey) headers['Idempotency-Key'] = item.idempotencyKey;
    const init = { method: item.method, headers, credentials: 'same-origin' };
    const body = rebuildBody(item);
    if (body !== undefined) init.body = body;
    return init;
  }

  // ── UI: avisos e contador ─────────────────────────────────────────────────

  function toast(msg, tipo) {
    try {
      if (typeof window.showToast === 'function') return window.showToast(msg, tipo || 'info');
      if (window.RhinoUI && typeof window.RhinoUI.toast === 'function') {
        return window.RhinoUI.toast(msg, { type: tipo || 'info', duration: 4000 });
      }
    } catch (e) {
      /* toast é cosmético — nunca pode derrubar a sincronização */
    }
    console.info('[offline]', msg);
  }

  function badge() {
    let el = document.getElementById('rh-sync-badge');
    if (!el) {
      if (!document.body) return null;
      el = document.createElement('div');
      el.id = 'rh-sync-badge';
      // Classe para o CSS do projeto estilizar; os inline styles são só o
      // mínimo para o badge ser visível mesmo sem regra em css/.
      el.className = 'rh-sync-badge';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.style.cssText =
        'position:fixed;right:12px;bottom:12px;z-index:9998;padding:8px 12px;' +
        'border-radius:999px;background:#92400E;color:#fff;font-size:13px;' +
        'font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,.25);display:none;';
      document.body.appendChild(el);
    }
    return el;
  }

  function renderCount(total) {
    _count = total;
    const texto = _rules ? _rules.describeQueue(total) : '';
    const el = badge();
    if (el) {
      el.textContent = texto;
      el.style.display = texto ? 'block' : 'none';
    }
    // Evento público: qualquer view pode mostrar "N registros aguardando envio".
    try {
      window.dispatchEvent(
        new CustomEvent('rhino:offline-queue', { detail: { total, texto } })
      );
    } catch (e) {
      /* CustomEvent indisponível — o badge já cobriu a UI */
    }
  }

  async function refreshCount() {
    try {
      renderCount(await dbCount());
    } catch (e) {
      /* sem IndexedDB não há fila para contar */
    }
  }

  // ── Resposta otimista ─────────────────────────────────────────────────────

  /**
   * O Store faz `this.state.X = resposta.X || []` em quase todo método. Se a
   * resposta sintética viesse vazia, a tela INTEIRA esvaziaria ao salvar
   * offline. Então a resposta ecoa o estado atual: nada muda na tela, nada some.
   * (O registro só aparece de fato depois que a fila sincronizar.)
   */
  function ecoDoEstado() {
    const s = window.Store && window.Store.state;
    if (!s) return {};
    return {
      contracts: s.contracts,
      saidas: s.saidas,
      notas_fiscais: s.notas_fiscais,
      entries: s.caixa,
      items: s.base,
      socios: s.socios,
      investimentos: s.investimentos,
      tipos: s.tipos_base,
      clientes: s.clientes,
      fornecedores: s.fornecedores,
      contas: s.contas_pagar,
      recursos: s.recursos,
      users: s.users,
      solicitacoes: s.solicitacoes_compra,
      manutencoes: s.manutencoes,
      veiculos: s.veiculos,
      propostas: s.propostas,
      clausulas: s.clausulas,
      folha: s.folha,
      templates: s.doc_templates,
      niveis: s.niveis_acesso,
    };
  }

  const MSG_SALVO = 'Salvo no dispositivo — será enviado quando houver sinal.';

  function respostaOtimista(item) {
    const corpo = Object.assign(ecoDoEstado(), {
      ok: true,
      offline: true,
      queued: true,
      _offlineQueued: true,
      _offlineSeq: item.seq,
      mensagem: MSG_SALVO,
    });
    // 202 Accepted: `res.ok` é true, então o Store NÃO lança erro — a UI mostra
    // sucesso, que é a verdade (o dado está salvo, só não sincronizado).
    return new Response(JSON.stringify(corpo), {
      status: 202,
      statusText: 'Accepted (offline queue)',
      headers: { 'Content-Type': 'application/json', 'X-Rhino-Offline': 'queued' },
    });
  }

  // ── Enfileiramento ────────────────────────────────────────────────────────

  async function enqueue(dados) {
    const item = {
      id: dados.idempotencyKey || _rules.newIdempotencyKey(Math.random),
      idempotencyKey: dados.idempotencyKey,
      method: dados.method,
      url: dados.url,
      headers: dados.headers,
      bodyKind: dados.bodyKind,
      body: dados.body,
      ts: Date.now(),
      tentativas: 0,
      ultimoErro: null,
      nextAttemptAt: 0,
    };
    item.seq = await dbAdd(item);
    await refreshCount();
    solicitarBackgroundSync();
    garantirPoll();
    return item;
  }

  // ── Sincronização ─────────────────────────────────────────────────────────

  async function mensagemDoErro(res) {
    try {
      const txt = await res.text();
      try {
        const j = JSON.parse(txt);
        return j.error || j.mensagem || txt;
      } catch (e) {
        return txt;
      }
    } catch (e) {
      return 'HTTP ' + res.status;
    }
  }

  /**
   * Reenvia a fila em ORDEM ESTRITA. Um item que ainda está em backoff
   * INTERROMPE o laço em vez de ser pulado: se a foto do RDO passasse na frente
   * do RDO, o servidor recusaria a foto órfã.
   */
  async function sync() {
    if (_syncing) return;
    const rules = await _rulesReady;
    if (!rules) return;
    if (!navigator.onLine) return;

    _syncing = true;
    let enviados = 0;
    let descartados = 0;
    try {
      const itens = rules.sortQueue(await dbAll());
      const agora = Date.now();

      for (const item of itens) {
        if (!navigator.onLine) break; // caiu no meio — o resto fica pra próxima
        if (!rules.isDue(item, agora)) break; // ordem acima de throughput

        let res = null;
        let networkError = false;
        try {
          res = await _origFetch(item.url, buildInit(item));
        } catch (e) {
          networkError = true;
        }

        const tentativas = (item.tentativas || 0) + 1;
        const veredito = rules.classifyOutcome({
          status: res ? res.status : null,
          networkError,
          attempts: tentativas,
          maxAttempts: rules.MAX_ATTEMPTS,
        });

        if (veredito.action === 'ok') {
          await dbDelete(item.seq);
          enviados++;
          continue;
        }

        if (veredito.action === 'drop') {
          const detalhe = res && !networkError ? await mensagemDoErro(res) : '';
          await dbDelete(item.seq);
          descartados++;
          console.warn('[offline] item descartado', item.method, item.url, veredito.reason, detalhe);
          toast(veredito.message + (detalhe ? ' (' + detalhe + ')' : ''), 'error');
          continue;
        }

        // retry: guarda o progresso e PARA — o próximo ciclo retoma daqui.
        item.tentativas = tentativas;
        item.ultimoErro = networkError ? 'rede' : 'HTTP ' + (res ? res.status : '?');
        item.nextAttemptAt = rules.nextAttemptAt(tentativas, Date.now(), {
          jitter: Math.random(),
        });
        await dbPut(item);
        break;
      }
    } catch (e) {
      console.error('[offline] sync falhou:', (e && e.message) || e);
    } finally {
      _syncing = false;
    }

    await refreshCount();

    if (enviados > 0) {
      toast(
        enviados === 1 ? '1 registro sincronizado' : enviados + ' registros sincronizados',
        'success'
      );
      // Os dados do servidor mudaram: derruba o cache do Store e redesenha.
      try {
        if (window.Store && typeof window.Store.invalidate === 'function') window.Store.invalidate();
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      } catch (e) {
        /* re-render é conveniência; a próxima navegação já traz o dado */
      }
    }

    if (_count === 0) pararPoll();
    else garantirPoll();

    return { enviados, descartados, restantes: _count };
  }

  // ── Gatilhos de sincronização ─────────────────────────────────────────────

  /** Background Sync: o navegador reenvia mesmo com o app fechado (Chrome/Android). */
  function solicitarBackgroundSync() {
    try {
      if (!('serviceWorker' in navigator) || !window.SyncManager) return;
      navigator.serviceWorker.ready
        .then((reg) => reg.sync && reg.sync.register(SYNC_TAG))
        .catch(() => {});
    } catch (e) {
      /* sem Background Sync (Safari/iOS) — o poll abaixo cobre */
    }
  }

  /**
   * FALLBACK obrigatório: Background Sync não existe no Safari/iOS e a obra usa
   * iPhone. Enquanto houver fila, tentamos de novo em intervalo fixo (o backoff
   * por item continua sendo respeitado dentro de sync()).
   */
  function garantirPoll() {
    if (_pollTimer) return;
    _pollTimer = setInterval(() => {
      if (navigator.onLine) sync();
    }, POLL_MS);
  }

  function pararPoll() {
    if (!_pollTimer) return;
    clearInterval(_pollTimer);
    _pollTimer = null;
  }

  window.addEventListener('online', () => {
    sync();
  });
  window.addEventListener('offline', () => {
    refreshCount();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && navigator.onLine) sync();
  });

  // O SW avisa quando o Background Sync dispara com o app aberto.
  try {
    if (navigator.serviceWorker && navigator.serviceWorker.addEventListener) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'RHINO_SYNC_QUEUE') sync();
      });
    }
  } catch (e) {
    /* sem Service Worker (contexto inseguro, iOS antigo) — o poll cobre */
  }

  // ── Interceptação do fetch ────────────────────────────────────────────────

  /**
   * Envolve window.fetch. Tudo que NÃO é mutação da API do Rhino passa direto,
   * sem custo. Mutação: tenta a rede primeiro (com Idempotency-Key) e só
   * enfileira se estiver offline ou se o fetch estourar por rede.
   */
  window.fetch = function (input, init) {
    // Request object: o Store nunca usa esse formato, e ler o body de um
    // Request é assíncrono e destrutivo. Passa direto.
    if (typeof input !== 'string') return _origFetch.apply(this, arguments);

    const rules = _rules;
    const method = rules ? rules.normalizeMethod(init && init.method) : 'GET';
    if (!rules || !rules.isMutationMethod(method) || !rules.isQueueableUrl(input, location.origin)) {
      return _origFetch.apply(this, arguments);
    }
    return mutacao(input, init || {}, method, rules);
  };

  async function mutacao(url, init, method, rules) {
    const descrito = describeBody(init.body);
    const headers = headersToObject(init.headers);

    // Se o chamador já mandou a própria chave, ela vive em `headers` e é
    // reenviada como está — não sobrescrevemos.
    const jaTemChave = Object.keys(headers).some((k) => k.toLowerCase() === 'idempotency-key');
    const anexar =
      !jaTemChave &&
      rules.shouldAttachIdempotencyKey({
        method,
        url,
        origin: location.origin,
        bodyKind: descrito.bodyKind,
      });
    // Gerada ANTES do primeiro envio e reusada em todo retry: é isso que faz o
    // servidor (withIdempotency) devolver a resposta original em vez de duplicar
    // o lançamento quando a requisição chegou mas a resposta se perdeu.
    const idempotencyKey = anexar ? rules.newIdempotencyKey(Math.random) : null;

    const enviavel = descrito.bodyKind !== 'unsupported';
    const online = navigator.onLine;

    const dados = {
      method,
      url,
      headers,
      bodyKind: descrito.bodyKind,
      body: descrito.body,
      idempotencyKey,
    };

    // Offline declarado: nem tenta a rede — vai direto pra fila.
    if (!online && enviavel && rules.shouldQueue({ method, url, online, origin: location.origin })) {
      try {
        const item = await enqueue(dados);
        toast(MSG_SALVO, 'warning');
        return respostaOtimista(item);
      } catch (e) {
        console.error('[offline] não foi possível enfileirar:', (e && e.message) || e);
        // Fila indisponível (modo privado, cota) → devolve o erro real.
        return _origFetch(url, comChave(init, idempotencyKey));
      }
    }

    // Caminho normal: rede primeiro. Qualquer RESPOSTA (200, 404, 500) volta
    // intacta pro Store — o comportamento online não muda.
    try {
      return await _origFetch(url, comChave(init, idempotencyKey));
    } catch (erroDeRede) {
      if (
        !enviavel ||
        !rules.shouldQueue({ method, url, online, networkError: true, origin: location.origin })
      ) {
        throw erroDeRede;
      }
      try {
        const item = await enqueue(dados);
        toast(MSG_SALVO, 'warning');
        return respostaOtimista(item);
      } catch (e) {
        console.error('[offline] não foi possível enfileirar:', (e && e.message) || e);
        throw erroDeRede;
      }
    }
  }

  /** Devolve um init com a Idempotency-Key anexada, sem mutar o do chamador. */
  function comChave(init, key) {
    if (!key) return init;
    const novo = Object.assign({}, init);
    novo.headers = Object.assign({}, headersToObject(init.headers));
    novo.headers['Idempotency-Key'] = key;
    return novo;
  }

  // ── Boot ──────────────────────────────────────────────────────────────────

  _rulesReady.then((rules) => {
    if (!rules) return;
    refreshCount().then(() => {
      if (_count > 0) {
        garantirPoll();
        if (navigator.onLine) sync();
      }
    });
  });

  // ── API pública ───────────────────────────────────────────────────────────

  window.RhinoOffline = {
    isOnline: () => navigator.onLine,
    /** Contador já conhecido (síncrono) — para render imediato. */
    get pendingCount() {
      return _count;
    },
    /** Contagem fresca do IndexedDB. */
    count: () => dbCount().catch(() => 0),
    /** Texto pronto em pt-BR: "3 registros aguardando envio". */
    describe: () => (_rules ? _rules.describeQueue(_count) : ''),
    getQueue: () => dbAll().catch(() => []),
    clearQueue: () => dbClear().then(refreshCount),
    sync,
    /** Exposto para depuração/diagnóstico em campo. */
    rules: () => _rules,
  };
})();
