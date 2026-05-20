#!/usr/bin/env node
// Helper: loga como admin e chama um endpoint admin (GET).
// Uso: node scripts/admin-call.js <path>
const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

const HOST = process.env.RHINO_HOST || 'rhino.up.railway.app';
const ROOT = path.resolve(__dirname, '..');

function loadCreds() {
  const credPath = path.join(ROOT, '.rhino-deploy-creds');
  if (process.env.RHINO_ADMIN_EMAIL && process.env.RHINO_ADMIN_PASSWORD) {
    return { email: process.env.RHINO_ADMIN_EMAIL, password: process.env.RHINO_ADMIN_PASSWORD };
  }
  return JSON.parse(fs.readFileSync(credPath, 'utf8'));
}

function request(method, urlStr, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const opts = { method, hostname: url.hostname, port: url.port || 443, path: url.pathname + (url.search || ''), headers: { ...headers } };
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.headers['Content-Length'] = Buffer.byteLength(body); }
    const req = https.request(opts, res => { const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) })); });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function parseSession(arr) {
  if (!arr) return null;
  for (const c of (Array.isArray(arr) ? arr : [arr])) {
    const m = c.match(/^rhino_sid=([^;]+)/);
    if (m) return `rhino_sid=${m[1]}`;
  }
  return null;
}

async function main() {
  const target = process.argv[2];
  if (!target) { console.error('Uso: node scripts/admin-call.js <path>'); process.exit(2); }
  const creds = loadCreds();
  const login = await request('POST', `https://${HOST}/api/auth/login`, { body: JSON.stringify({ email: creds.email, password: creds.password }) });
  if (login.status !== 200) throw new Error(`Login: HTTP ${login.status} ${login.body.toString().slice(0,200)}`);
  const cookie = parseSession(login.headers['set-cookie']);
  const r = await request('GET', `https://${HOST}${target}`, { headers: { Cookie: cookie } });
  console.log('HTTP', r.status);
  try { console.log(JSON.stringify(JSON.parse(r.body.toString()), null, 2)); }
  catch { console.log(r.body.toString()); }
  await request('POST', `https://${HOST}/api/auth/logout`, { headers: { Cookie: cookie } }).catch(() => {});
}
main().catch(e => { console.error(e.message); process.exit(1); });
