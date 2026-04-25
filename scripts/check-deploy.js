#!/usr/bin/env node
/**
 * Smoke test pós-deploy — valida que a app está no ar e funcional.
 *
 * Uso:
 *   node scripts/check-deploy.js https://rhino-production.up.railway.app admin@empresa.com SenhaForte
 */
const url = process.argv[2];
const email = process.argv[3];
const password = process.argv[4];

if (!url || !email || !password) {
  console.error('Uso: node scripts/check-deploy.js <URL> <ADMIN_EMAIL> <ADMIN_PASSWORD>');
  process.exit(1);
}

const base = url.replace(/\/$/, '');
let cookie = '';
let ok = 0, fail = 0;

async function req(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie && setCookie.includes('rhino_sid=')) {
    cookie = setCookie.split(';')[0];
  }
  return res;
}

async function check(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    ok++;
  } catch (e) {
    console.log(`  ✗ ${name} — ${e.message}`);
    fail++;
  }
}

(async () => {
  console.log(`\nSmoke test → ${base}\n`);

  await check('GET / (HTML carrega)', async () => {
    const r = await fetch(base + '/');
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    const txt = await r.text();
    if (!txt.includes('Rhino')) throw new Error('HTML sem "Rhino"');
  });

  await check('GET /api/health → db ok', async () => {
    const r = await req('GET', '/api/health');
    const j = await r.json();
    if (j.db !== 'ok') throw new Error(`db: ${j.db}`);
  });

  await check('GET /api/contracts SEM auth → 401', async () => {
    const r = await fetch(base + '/api/contracts');
    if (r.status !== 401) throw new Error(`esperado 401, recebido ${r.status}`);
  });

  await check('POST /api/auth/login com senha errada → 401', async () => {
    const r = await req('POST', '/api/auth/login', { email, password: 'errado' });
    if (r.status !== 401) throw new Error(`esperado 401, recebido ${r.status}`);
  });

  await check('POST /api/auth/login com senha certa → 200 + cookie', async () => {
    const r = await req('POST', '/api/auth/login', { email, password });
    if (r.status !== 200) throw new Error(`esperado 200, recebido ${r.status}`);
    if (!cookie) throw new Error('cookie não definido');
  });

  await check('GET /api/auth/me autenticado', async () => {
    const r = await req('GET', '/api/auth/me');
    const j = await r.json();
    if (j.user?.email?.toLowerCase() !== email.toLowerCase()) throw new Error('usuário errado');
  });

  await check('GET /api/contracts autenticado → 200', async () => {
    const r = await req('GET', '/api/contracts');
    if (r.status !== 200) throw new Error(`status ${r.status}`);
  });

  await check('GET /api/dashboard autenticado → 200', async () => {
    const r = await req('GET', '/api/dashboard?modo=ano');
    const j = await r.json();
    if (typeof j.activeContracts !== 'number') throw new Error('payload inválido');
  });

  await check('GET /api/rdos autenticado → 200', async () => {
    const r = await req('GET', '/api/rdos');
    const j = await r.json();
    if (!Array.isArray(j.rdos)) throw new Error('payload inválido');
  });

  await check('GET /api/metrics → 200', async () => {
    const r = await req('GET', '/api/metrics');
    const j = await r.json();
    if (typeof j.requests !== 'number') throw new Error('payload inválido');
  });

  await check('POST /api/auth/forgot-password (rate limit) → 200 ok', async () => {
    const r = await req('POST', '/api/auth/forgot-password', { email });
    if (r.status !== 200) throw new Error(`status ${r.status}`);
  });

  await check('POST /api/auth/logout → 200', async () => {
    const r = await req('POST', '/api/auth/logout');
    if (r.status !== 200) throw new Error(`status ${r.status}`);
  });

  console.log(`\n${ok}/${ok + fail} checks ok\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
