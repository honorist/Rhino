'use strict';
/**
 * @file Content-Security-Policy — fonte única de verdade. Extraído de server.js
 * pra poder ser reusado por handlers que precisam de uma CSP diferente do
 * default global (ex.: relaxar frame-ancestors só numa resposta específica),
 * sem duplicar a lista de diretivas em mais de um lugar.
 */
function buildCsp(scriptSrc, frameAncestors) {
  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.openstreetmap.org",
    "connect-src 'self' https://*.openstreetmap.org https://nominatim.openstreetmap.org https://router.project-osrm.org https://cdn.jsdelivr.net",
    "worker-src 'self' blob:",
    `frame-ancestors ${frameAncestors || "'none'"}`,
  ].join('; ');
}

module.exports = { buildCsp };
