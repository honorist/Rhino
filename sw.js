/* Rhino — Service Worker
   Estratégia:
   - HTML/JS/CSS: network-first (sempre busca a versão mais recente)
   - Imagens/fontes: stale-while-revalidate (safe — nunca mudam)
   - APIs (/api/*): network-first com fallback de cache somente em GET
   VERSION é injetado pelo servidor com a versão atual do app,
   garantindo que o cache seja invalidado a cada deploy.
*/
const VERSION = '__RHINO_VERSION__'; // substituído pelo servidor em runtime
const STATIC_CACHE = `${VERSION}-static`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const API_CACHE = `${VERSION}-api`;

const PRECACHE_URLS = [
  './',
  './index.html',
  './css/main.css',
  './css/components.css',
  './css/theme-v2.css',
  './css/polish.css',
  './js/app.js',
  './js/store.js',
  './js/lib/icons.js',
  './js/lib/recurrence.js',
  './assets/icon.svg',
  './assets/logo.png',
  './manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

function isApi(url) {
  return url.pathname.startsWith('/api/');
}
function isStatic(url) {
  return /\.(?:css|js|svg|png|jpg|jpeg|webp|woff2?|ttf)$/.test(url.pathname);
}
function isHtml(req) {
  return req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // não interfere em CDN

  // APIs: network-first
  if (isApi(url)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(API_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || new Response(
          JSON.stringify({ error: 'offline', cached: false }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        )))
    );
    return;
  }

  // HTML: network-first com fallback ao index cacheado
  if (isHtml(req)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // Estáticos:
  //  JS/CSS → network-first (código muda a cada deploy; versão antiga = bug)
  //  Imagens/fontes → stale-while-revalidate (safe — nunca mudam entre deploys)
  if (isStatic(url)) {
    const isCode = /\.(?:css|js)$/.test(url.pathname);
    if (isCode) {
      event.respondWith(
        fetch(req)
          .then((res) => {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy)).catch(() => {});
            return res;
          })
          .catch(() => caches.match(req).then((r) => r || new Response('', { status: 503 })))
      );
    } else {
      // Imagens, fontes, SVGs: stale-while-revalidate é seguro
      event.respondWith(
        caches.match(req).then((cached) => {
          const network = fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy)).catch(() => {});
            return res;
          }).catch(() => cached);
          return cached || network;
        })
      );
    }
  }
});
