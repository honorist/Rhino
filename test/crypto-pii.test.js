'use strict';
/**
 * Testes do módulo de criptografia de PII (lib/crypto-pii.js).
 * Cobre round-trip, retrocompatibilidade (legado em texto puro), idempotência,
 * não-determinismo do ciphertext, detecção de adulteração e índice cego.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

// Chave de teste (32 bytes em base64) — definida ANTES de require do módulo.
process.env.PII_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
const pii = require('../lib/crypto-pii');

test('encrypt → decrypt devolve o valor original (CPF)', () => {
  const cpf = '123.456.789-00';
  const enc = pii.encrypt(cpf);
  assert.notEqual(enc, cpf);
  assert.ok(enc.startsWith('enc:1:'));
  assert.equal(pii.decrypt(enc), cpf);
});

test('decrypt deixa passar valor legado em texto puro (sem prefixo)', () => {
  assert.equal(pii.decrypt('123.456.789-00'), '123.456.789-00');
});

test('encrypt é idempotente — não cifra duas vezes', () => {
  const enc1 = pii.encrypt('98765432100');
  const enc2 = pii.encrypt(enc1);
  assert.equal(enc1, enc2);
  assert.equal(pii.decrypt(enc2), '98765432100');
});

test('null e string vazia passam direto (nada a proteger)', () => {
  assert.equal(pii.encrypt(null), null);
  assert.equal(pii.encrypt(''), '');
  assert.equal(pii.decrypt(null), null);
  assert.equal(pii.decrypt(''), '');
});

test('mesmo input gera ciphertexts diferentes (IV aleatório)', () => {
  const a = pii.encrypt('11111111111');
  const b = pii.encrypt('11111111111');
  assert.notEqual(a, b);                  // IV diferente
  assert.equal(pii.decrypt(a), pii.decrypt(b)); // mas decifram igual
});

test('decrypt detecta adulteração (GCM auth tag)', () => {
  const enc = pii.encrypt('segredo');
  // Corrompe um byte do base64 do payload
  const corrupted = enc.slice(0, -4) + (enc.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA');
  assert.throws(() => pii.decrypt(corrupted));
});

test('encryptBuffer → decryptBuffer devolve os bytes originais (documento)', () => {
  const file = Buffer.from([0x25, 0x50, 0x44, 0x46, 1, 2, 3, 255, 0, 128]); // "%PDF"+bytes
  const enc = pii.encryptBuffer(file);
  assert.ok(!enc.equals(file));
  assert.ok(pii.isEncryptedBuffer(enc));
  assert.ok(pii.decryptBuffer(enc).equals(file));
});

test('decryptBuffer deixa passar arquivo legado (sem magic)', () => {
  const legacy = Buffer.from('%PDF-1.4 conteudo antigo');
  assert.ok(!pii.isEncryptedBuffer(legacy));
  assert.ok(pii.decryptBuffer(legacy).equals(legacy));
});

test('blindIndex é determinístico e ignora máscara (só dígitos)', () => {
  const a = pii.blindIndex('123.456.789-00');
  const b = pii.blindIndex('12345678900');
  assert.equal(a, b);                     // máscara não muda o índice
  assert.match(a, /^[0-9a-f]{64}$/);      // HMAC-SHA256 hex
  assert.equal(pii.blindIndex(''), null);
});

test('isConfigured retorna true com a chave definida', () => {
  assert.equal(pii.isConfigured(), true);
});

test('SEM chave: encrypt degrada para texto puro (não lança) — rollout seguro', () => {
  // Subprocesso sem PII_ENCRYPTION_KEY: encrypt deve devolver o valor em claro.
  // Esse é o caminho de DEV/rollout — em produção (NODE_ENV=production) o
  // próprio encrypt() recusa degradar e lança de propósito (LGPD: nunca
  // gravar PII em claro em prod). Sem fixar NODE_ENV aqui, este teste falha
  // sempre que rodado com um .env que já tem NODE_ENV=production (like este
  // projeto tem, pra espelhar produção localmente) — não é bug do código.
  const { execFileSync } = require('node:child_process');
  const out = execFileSync(
    process.execPath,
    ['-e', "process.stdout.write(require('./lib/crypto-pii').encrypt('12345678900'))"],
    { cwd: process.cwd(), env: { ...process.env, PII_ENCRYPTION_KEY: '', NODE_ENV: 'development' } }
  ).toString();
  assert.equal(out, '12345678900'); // texto puro, sem prefixo enc:
});

test('SEM chave EM PRODUÇÃO: encrypt lança em vez de gravar PII em claro', () => {
  const { execFileSync } = require('node:child_process');
  assert.throws(() => {
    execFileSync(
      process.execPath,
      ['-e', "require('./lib/crypto-pii').encrypt('12345678900')"],
      { cwd: process.cwd(), env: { ...process.env, PII_ENCRYPTION_KEY: '', NODE_ENV: 'production' }, stdio: 'pipe' }
    );
  }, /PII_ENCRYPTION_KEY/);
});
