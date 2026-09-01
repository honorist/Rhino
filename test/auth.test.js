'use strict';
/**
 * @file Testes das funções PURAS de auth (lib/auth.js) — hashing, token e cookies de sessão.
 *
 * SEGURANÇA: cobre o gap de §8. NÃO toca banco — `require('../lib/auth')` carrega `../db`, mas o
 * Pool do pg é lazy (só conecta na 1ª query) e estas funções nunca fazem query. Sem DATABASE_URL
 * no ambiente de teste, nada chega perto da produção (Railway).
 */
const { test } = require('node:test');
const assert = require('node:assert');
const auth = require('../lib/auth');

test('hash + verify: senha correta valida, senha errada não', async () => {
  const h = await auth.hash('s3nh@Forte!');
  assert.notStrictEqual(h, 's3nh@Forte!', 'o hash não pode ser a senha em texto puro');
  assert.match(h, /^\$2[aby]\$/, 'formato bcrypt');
  assert.strictEqual(await auth.verify('s3nh@Forte!', h), true);
  assert.strictEqual(await auth.verify('senhaErrada', h), false);
});

test('verify: hash null/undefined → false (anti-enumeração de e-mail por timing)', async () => {
  assert.strictEqual(await auth.verify('qualquer', null), false);
  assert.strictEqual(await auth.verify('qualquer', undefined), false);
});

// M-05: migração de bcryptjs → bcrypt nativo (rehash-on-login, sem job de
// bulk) só é segura porque as duas libs produzem/leem o MESMO formato de
// hash bcrypt ($2a$/$2b$) — um hash antigo gerado por bcryptjs precisa
// continuar validando com o verify() novo (bcrypt nativo), senão todo login
// existente quebraria no deploy.
test('verify (bcrypt nativo) valida hash gerado pela lib antiga (bcryptjs)', async () => {
  const bcryptjs = require('bcryptjs');
  const hashAntigo = await bcryptjs.hash('s3nh@Forte!', 10);
  assert.strictEqual(await auth.verify('s3nh@Forte!', hashAntigo), true);
  assert.strictEqual(await auth.verify('senhaErrada', hashAntigo), false);
});

test('parseCookies: parseia o header em objeto e decodifica o valor', () => {
  const c = auth.parseCookies({ headers: { cookie: 'a=1; b=hello%20world; sid=abc' } });
  assert.strictEqual(c.a, '1');
  assert.strictEqual(c.b, 'hello world');
  assert.strictEqual(c.sid, 'abc');
});

test('parseCookies: sem header → objeto vazio', () => {
  assert.deepStrictEqual(auth.parseCookies({ headers: {} }), {});
});

test('setSessionCookie: aplica flags de segurança (HttpOnly, SameSite=Strict, Path)', () => {
  let header = null;
  const res = { setHeader: (k, v) => { if (k === 'Set-Cookie') header = v; } };
  auth.setSessionCookie(res, 'sid123', new Date(Date.now() + 3600000).toISOString());
  assert.match(header, /HttpOnly/);
  assert.match(header, /SameSite=Strict/);
  assert.match(header, /Path=\//);
  assert.match(header, /sid123/);
});

test('clearSessionCookie: expira via Max-Age=0 e mantém HttpOnly', () => {
  let header = null;
  const res = { setHeader: (_k, v) => { header = v; } };
  auth.clearSessionCookie(res);
  assert.match(header, /Max-Age=0/);
  assert.match(header, /HttpOnly/);
});
