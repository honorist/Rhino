/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Backend (server.js) roda na porta 3001 — ver server.js:20.
// Em dev o Vite faz proxy de /api para o backend real.
const API_TARGET = 'http://localhost:3001';

export default defineConfig({
  plugins: [
    react(),
    // PWA substitui o sw.js manual da raiz. Estratégias espelham o antigo:
    //   - static (html/js/css/imagens) — precache via workbox
    //   - /api/* GET — NetworkFirst com fallback offline
    //   - /api/* POST/PUT/DELETE — sai do SW; fila offline está em
    //     hooks/useOfflineSync.ts (patcha window.fetch).
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'icon.svg', 'icon-maskable.svg', 'logo.png'],
      manifest: {
        name: 'Rhino — Gestão Empresarial',
        short_name: 'Rhino',
        description:
          'Gestão de contratos de obras, financeiro e cadastros — Rhino Manutenções.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait-primary',
        background_color: '#F3F4F6',
        theme_color: '#55588B',
        lang: 'pt-BR',
        dir: 'ltr',
        categories: ['business', 'productivity', 'finance'],
        icons: [
          { src: '/assets/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/assets/icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
          { src: '/assets/logo.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        ],
        shortcuts: [
          { name: 'Dashboard', short_name: 'Dash', url: '/dashboard' },
          { name: 'Contratos', short_name: 'Contratos', url: '/contratos' },
          { name: 'Contas a Pagar', short_name: 'CP', url: '/contas-pagar' },
          { name: 'Mapa de Obras', short_name: 'Obras', url: '/obras' },
        ],
      },
      workbox: {
        // Precache só o shell — não inflar o cache com chunks pesados (mermaid,
        // jsPDF, leaflet) que entram via runtime.
        globPatterns: ['**/*.{js,css,svg,ico,woff2}'],
        // O arquivo gerado pelo bundle pode passar de 2MB com sourcemaps;
        // garantimos margem.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // NetworkFirst pra navegação — garante que o usuário SEMPRE pega o
        // index.html novo após um deploy, sem precisar limpar cache manualmente.
        // Cache só serve como fallback offline.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        // CRÍTICO p/ deploys: SW novo ativa IMEDIATAMENTE em vez de esperar
        // todas as abas fecharem; e assume controle de páginas já abertas.
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            // index.html — NetworkFirst com timeout curto. Em qualquer
            // navegação, tentamos buscar a versão nova primeiro; só usamos
            // cache se a rede falhar (offline).
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 50, maxAgeSeconds: 24 * 60 * 60 },
            },
          },
          {
            // /api/* — workbox encurta para GET no padrão NetworkFirst.
            urlPattern: /\/api\/.*/i,
            method: 'GET',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-get',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 },
            },
          },
          {
            // Imagens e fontes (qualquer origem).
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2?|ttf)(\?.*)?$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'assets',
              expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
        ],
      },
      devOptions: {
        // PWA fica desligado em dev — service worker no Vite dev server costuma
        // gerar mais ruído que ajuda. Ligar manualmente quando testar offline.
        enabled: false,
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      // SSE de tempo real (useRealtime usa /api/stream) — proxied junto.
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
