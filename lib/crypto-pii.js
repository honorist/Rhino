/**
 * @file Criptografia de dados pessoais (PII) em repouso — LGPD.
 *
 * Cifra CPF e arquivos de documentos no banco com AES-256-GCM (autenticado:
 * detecta adulteração). A chave vem de `PII_ENCRYPTION_KEY` (32 bytes em
 * base64 ou hex) — NUNCA versionada no git; configure como secret no deploy.
 *
 *   Gerar uma chave:  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *
 * Formatos no banco:
 *   - Strings (CPF):  prefixo "enc:1:" + base64(iv[12] | tag[16] | ciphertext)
 *   - Buffers (docs): magic "PENC" + version[1] + iv[12] | tag[16] | ciphertext
 *
 * Retrocompatibilidade (migração sem downtime): `decrypt`/`decryptBuffer`
 * DEIXAM PASSAR valores legados em texto puro (sem o prefixo/magic). Assim a
 * leitura funciona antes mesmo de a migração de dados rodar — só o que foi
 * cifrado é decifrado; o resto volta como está.
 *
 * Degradação segura (rollout): SEM a chave configurada, `encrypt`/`encryptBuffer`
 * NÃO falham — gravam em texto puro (status quo) e avisam UMA vez no log. A
 * criptografia "liga" assim que a chave é definida. Isso permite subir o código
 * e rodar o CI sem a chave, sem quebrar gravação de CPF/documento. (Ler um valor
 * JÁ CIFRADO sem a chave continua falhando — não há como decifrar sem ela.)
 *
 * IMPORTANTE: perder a chave = perder o acesso aos dados cifrados. Faça backup
 * da chave junto (e separada) do backup do banco.
 */

'use strict';

const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;          // 96 bits — recomendado para GCM
const TAG_LEN = 16;         // 128 bits
const STR_PREFIX = 'enc:1:'; // versão 1 do envelope de string
const BUF_MAGIC = Buffer.from('PENC');
const BUF_VERSION = 1;

let _cachedKey = null;
let _warnedNoKey = false;

/** Avisa UMA vez que a PII está sendo gravada sem criptografia (chave ausente). */
function _warnNoKey() {
  if (_warnedNoKey) return;
  _warnedNoKey = true;
  console.warn('[crypto-pii] PII_ENCRYPTION_KEY ausente — gravando PII em TEXTO PURO (criptografia inativa). Defina a chave para ativar; ver docs/LGPD.md.');
}

/**
 * Resolve a chave de 32 bytes a partir de PII_ENCRYPTION_KEY (base64 ou hex).
 * Lança erro claro se ausente/ inválida — falha cedo em vez de cifrar errado.
 * @returns {Buffer}
 */
function getKey() {
  if (_cachedKey) return _cachedKey;
  const raw = process.env.PII_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'PII_ENCRYPTION_KEY não configurada — necessária para cifrar/decifrar PII (LGPD). ' +
      'Gere com: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
    );
  }
  // Aceita base64 (44 chars) ou hex (64 chars). Valida que dá 32 bytes.
  let key;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, 'hex');
  } else {
    key = Buffer.from(raw, 'base64');
  }
  if (key.length !== 32) {
    throw new Error(`PII_ENCRYPTION_KEY inválida: esperado 32 bytes, veio ${key.length}. Use base64(32 bytes) ou hex(64 chars).`);
  }
  _cachedKey = key;
  return key;
}

/** @returns {boolean} A chave está configurada? (não lança) */
function isConfigured() {
  try { getKey(); return true; } catch { return false; }
}

/**
 * Faz o parse de uma chave de 32 bytes a partir de uma string arbitrária
 * (base64 ou hex) — mesma validação de getKey(), mas sem depender de
 * PII_ENCRYPTION_KEY. Usado por scripts/rotate-pii-key.js, que precisa da
 * chave ANTIGA e da NOVA ao mesmo tempo (getKey() só conhece uma).
 * @param {string} raw
 * @returns {Buffer}
 */
function parseKey(raw) {
  if (!raw) throw new Error('Chave vazia.');
  let key;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) key = Buffer.from(raw, 'hex');
  else key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(`Chave inválida: esperado 32 bytes, veio ${key.length}. Use base64(32 bytes) ou hex(64 chars).`);
  }
  return key;
}

/** @param {string} v @returns {boolean} É uma string já cifrada por este módulo? */
function isEncrypted(v) {
  return typeof v === 'string' && v.startsWith(STR_PREFIX);
}

/**
 * Cifra uma string. `null`/`''` passam direto (nada a proteger). Se já estiver
 * cifrada, retorna como está (idempotente — evita dupla cifragem na migração).
 * @param {string|null|undefined} plaintext
 * @returns {string|null|undefined}
 */
/**
 * Núcleo de encrypt() — parametrizado por chave pra ser reusado pelo
 * script de rotação (encripta com a chave NOVA sem passar por getKey()).
 * @param {string} plaintext
 * @param {Buffer} key
 * @returns {string}
 */
function encryptWithKey(plaintext, key) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return STR_PREFIX + Buffer.concat([iv, tag, ct]).toString('base64');
}

function encrypt(plaintext) {
  if (plaintext == null || plaintext === '') return plaintext;
  if (isEncrypted(plaintext)) return plaintext;
  if (!isConfigured()) {
    // Produção: ERRO — não grava PII em texto puro (LGPD). getKey() lança o
    // diagnóstico exato (ausente OU inválida: precisa de 32 bytes base64/hex).
    if (process.env.NODE_ENV === 'production') getKey();
    _warnNoKey(); return plaintext;
  }
  return encryptWithKey(plaintext, getKey());
}

/**
 * Decifra uma string. Valores SEM o prefixo `enc:` voltam intactos (legado em
 * texto puro) — permite leitura durante a transição da migração.
 * @param {string|null|undefined} value
 * @returns {string|null|undefined}
 */
/**
 * Núcleo de decrypt() — parametrizado por chave. `value` precisa já ter
 * passado por isEncrypted() (não faz o passthrough de legado).
 * @param {string} value
 * @param {Buffer} key
 * @returns {string}
 */
function decryptWithKey(value, key) {
  const blob = Buffer.from(value.slice(STR_PREFIX.length), 'base64');
  const iv = blob.subarray(0, IV_LEN);
  const tag = blob.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = blob.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

function decrypt(value) {
  if (value == null || value === '') return value;
  if (!isEncrypted(value)) return value; // legado em texto puro → passa direto
  return decryptWithKey(value, getKey());
}

/** @param {Buffer} buf @returns {boolean} O buffer já está cifrado? */
function isEncryptedBuffer(buf) {
  return Buffer.isBuffer(buf) && buf.length >= 5 && buf.subarray(0, 4).equals(BUF_MAGIC);
}

/**
 * Cifra um Buffer (arquivo de documento). Buffers já cifrados voltam como estão.
 * @param {Buffer|null|undefined} buf
 * @returns {Buffer|null|undefined}
 */
/**
 * Núcleo de encryptBuffer() — parametrizado por chave.
 * @param {Buffer} buf
 * @param {Buffer} key
 * @returns {Buffer}
 */
function encryptBufferWithKey(buf, key) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(buf), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([BUF_MAGIC, Buffer.from([BUF_VERSION]), iv, tag, ct]);
}

function encryptBuffer(buf) {
  if (buf == null) return buf;
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
  if (isEncryptedBuffer(buf)) return buf;
  if (!isConfigured()) {
    if (process.env.NODE_ENV === 'production') getKey(); // lança ausente/inválida
    _warnNoKey(); return buf; // dev: degrada p/ arquivo em claro
  }
  return encryptBufferWithKey(buf, getKey());
}

/**
 * Decifra um Buffer. Buffers SEM o magic voltam intactos (arquivo legado).
 * @param {Buffer|null|undefined} buf
 * @returns {Buffer|null|undefined}
 */
/**
 * Núcleo de decryptBuffer() — parametrizado por chave. `buf` precisa já ter
 * passado por isEncryptedBuffer() (não faz o passthrough de legado).
 * @param {Buffer} buf
 * @param {Buffer} key
 * @returns {Buffer}
 */
function decryptBufferWithKey(buf, key) {
  let off = 4 + 1; // magic + version
  const iv = buf.subarray(off, off + IV_LEN); off += IV_LEN;
  const tag = buf.subarray(off, off + TAG_LEN); off += TAG_LEN;
  const ct = buf.subarray(off);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

function decryptBuffer(buf) {
  if (buf == null) return buf;
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
  if (!isEncryptedBuffer(buf)) return buf; // arquivo legado em claro → passa direto
  return decryptBufferWithKey(buf, getKey());
}

/**
 * Índice cego: HMAC-SHA256 determinístico de um valor normalizado. Permite
 * lookup/dedup EXATO sem decifrar (não usado na busca por substring atual, mas
 * disponível p/ checagem de duplicidade de CPF). Só dígitos são considerados.
 * @param {string} plaintext
 * @returns {string|null} hex, ou null se vazio
 */
function blindIndex(plaintext) {
  if (plaintext == null || plaintext === '') return null;
  if (!isConfigured()) { _warnNoKey(); return null; } // sem chave não há índice
  const norm = String(plaintext).replace(/\D/g, ''); // só dígitos (CPF)
  if (!norm) return null;
  return crypto.createHmac('sha256', getKey()).update(norm).digest('hex');
}

module.exports = {
  encrypt, decrypt, isEncrypted,
  encryptBuffer, decryptBuffer, isEncryptedBuffer,
  blindIndex, isConfigured, getKey,
  // Núcleo parametrizado por chave — usado por scripts/rotate-pii-key.js.
  parseKey, encryptWithKey, decryptWithKey, encryptBufferWithKey, decryptBufferWithKey,
};
