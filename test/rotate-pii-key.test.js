'use strict';
/**
 * @file scripts/rotate-pii-key.js — item 8 do plano async-wandering-kite
 * (docs/LGPD.md documentava a cifra mas não tinha script de rotação de
 * chave). Cobre só a lógica de decisão pura (tentar chave antiga, cair pra
 * nova se já rotacionado) — não toca banco.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const pii = require('../lib/crypto-pii');
const { decifrarComQualquerChave, decifrarBufferComQualquerChave } = require('../scripts/rotate-pii-key');

const oldKey = pii.parseKey(Buffer.alloc(32, 1).toString('base64'));
const newKey = pii.parseKey(Buffer.alloc(32, 2).toString('base64'));
const outraChave = pii.parseKey(Buffer.alloc(32, 3).toString('base64'));

test('valor não cifrado (legado em claro) devolve null — nada a rotacionar', () => {
  assert.strictEqual(decifrarComQualquerChave('12345678900', oldKey, newKey), null);
});

test('decifra com a chave antiga — jaRotacionado false', () => {
  const cifrado = pii.encryptWithKey('12345678900', oldKey);
  const r = decifrarComQualquerChave(cifrado, oldKey, newKey);
  assert.strictEqual(r.plaintext, '12345678900');
  assert.strictEqual(r.jaRotacionado, false);
});

test('chave antiga falha, chave nova funciona — já foi rotacionado antes (jaRotacionado true)', () => {
  const cifrado = pii.encryptWithKey('12345678900', newKey); // já rotacionado numa rodada anterior
  const r = decifrarComQualquerChave(cifrado, oldKey, newKey);
  assert.strictEqual(r.plaintext, '12345678900');
  assert.strictEqual(r.jaRotacionado, true);
});

test('nenhuma das duas chaves bate — lança (não silencia corrupção/chave errada)', () => {
  const cifrado = pii.encryptWithKey('12345678900', outraChave);
  assert.throws(() => decifrarComQualquerChave(cifrado, oldKey, newKey));
});

test('buffer: mesmo comportamento (antiga, nova, nenhuma)', () => {
  const buf = Buffer.from('conteudo do arquivo');
  const cifradoAntiga = pii.encryptBufferWithKey(buf, oldKey);
  const cifradoNova = pii.encryptBufferWithKey(buf, newKey);
  const cifradoOutra = pii.encryptBufferWithKey(buf, outraChave);

  const r1 = decifrarBufferComQualquerChave(cifradoAntiga, oldKey, newKey);
  assert.ok(r1.plaintext.equals(buf));
  assert.strictEqual(r1.jaRotacionado, false);

  const r2 = decifrarBufferComQualquerChave(cifradoNova, oldKey, newKey);
  assert.ok(r2.plaintext.equals(buf));
  assert.strictEqual(r2.jaRotacionado, true);

  assert.throws(() => decifrarBufferComQualquerChave(cifradoOutra, oldKey, newKey));
});

test('buffer sem cifra (legado em claro) devolve null', () => {
  assert.strictEqual(decifrarBufferComQualquerChave(Buffer.from('plain file'), oldKey, newKey), null);
});
