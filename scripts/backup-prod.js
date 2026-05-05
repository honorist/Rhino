#!/usr/bin/env node
// Backup completo de produção via /api/backup/download (admin-only).
// Salva em deploy-backups/<YYYY-MM-DD_HH-mm-ss>_v<x.y.z>/full_backup.json
//
// Uso:
//   node scripts/backup-prod.js
//
// Configuração (uma vez):
//   Crie .rhino-deploy-creds (JSON, gitignored) na raiz do projeto:
//     { "email": "admin@dominio", "password": "..." }
//   OU exporte vars de ambiente RHINO_ADMIN_EMAIL e RHINO_ADMIN_PASSWORD.
//
// O script:
//   1. Lê credenciais (env vars > .rhino-deploy-creds)
//   2. Loga em https://rhino.up.railway.app/api/auth/login → guarda cookie
//   3. Chama /api/backup/download → salva JSON e versão
//   4. Sai com código 0 se OK; ≠0 em qualquer falha (use em CI / pre-push hook)

const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

const HOST = process.env.RHINO_HOST || 'rhino.up.railway.app';
const ROOT = path.resolve(__dirname, '..');
const BACKUP_ROOT = path.join(ROOT, 'deploy-backups');

function loadCreds() {
  if (process.env.RHINO_ADMIN_EMAIL && process.env.RHINO_ADMIN_PASSWORD) {
    return { email: process.env.RHINO_ADMIN_EMAIL, password: process.env.RHINO_ADMIN_PASSWORD };
  }
  const credPath = path.join(ROOT, '.rhino-deploy-creds');
  if (fs.existsSync(credPath)) {
    try { return JSON.parse(fs.readFileSync(credPath, 'utf8')); } catch (e) {
      throw new Error(`Falha ao ler ${credPath}: ${e.message}`);
    }
  }
  throw new Error(
    'Credenciais ausentes. Crie .rhino-deploy-creds (JSON com email/password) ' +
    'OU exporte RHINO_ADMIN_EMAIL e RHINO_ADMIN_PASSWORD.'
  );
}

function request(method, urlStr, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const opts = {
      method,
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + (url.search || ''),
      headers: { ...headers },
    };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(body);
    }
    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        resolve({ status: res.statusCode, headers: res.headers, body: buf });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function parseSessionCookie(setCookieArr) {
  if (!setCookieArr) return null;
  const arr = Array.isArray(setCookieArr) ? setCookieArr : [setCookieArr];
  for (const c of arr) {
    const m = c.match(/^rhino_sid=([^;]+)/);
    if (m) return `rhino_sid=${m[1]}`;
  }
  return null;
}

function pkgVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version || 'unknown';
  } catch { return 'unknown'; }
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

async function main() {
  const creds = loadCreds();
  const version = pkgVersion();
  const ts = timestamp();
  const folder = path.join(BACKUP_ROOT, `${ts}_v${version}`);

  console.log(`[backup] host=${HOST} versão=${version} pasta=${folder}`);

  // 1) Login
  console.log('[backup] autenticando...');
  const loginRes = await request('POST', `https://${HOST}/api/auth/login`, {
    body: JSON.stringify({ email: creds.email, password: creds.password }),
  });
  if (loginRes.status !== 200) {
    throw new Error(`Login falhou: HTTP ${loginRes.status} ${loginRes.body.toString().slice(0, 200)}`);
  }
  const cookie = parseSessionCookie(loginRes.headers['set-cookie']);
  if (!cookie) throw new Error('Login OK mas sem cookie rhino_sid no response.');

  // 2) Backup download
  console.log('[backup] baixando dump completo...');
  const dlRes = await request('GET', `https://${HOST}/api/backup/download`, {
    headers: { Cookie: cookie },
  });
  if (dlRes.status !== 200) {
    throw new Error(`Download falhou: HTTP ${dlRes.status} ${dlRes.body.toString().slice(0, 200)}`);
  }

  // 3) Salvar
  fs.mkdirSync(folder, { recursive: true });
  const dumpPath = path.join(folder, 'full_backup.json');
  fs.writeFileSync(dumpPath, dlRes.body);

  // Também salva metadados (versão deployada, hora, host)
  const meta = {
    version,
    host: HOST,
    timestamp: new Date().toISOString(),
    sizeBytes: dlRes.body.length,
  };
  fs.writeFileSync(path.join(folder, 'meta.json'), JSON.stringify(meta, null, 2));

  // 4) Logout (best-effort)
  try {
    await request('POST', `https://${HOST}/api/auth/logout`, { headers: { Cookie: cookie } });
  } catch {}

  const sizeMb = (dlRes.body.length / 1024 / 1024).toFixed(2);
  console.log(`[backup] OK — ${dumpPath} (${sizeMb} MB)`);
}

main().catch((e) => {
  console.error('[backup] ERRO:', e.message);
  process.exit(1);
});
