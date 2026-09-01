#!/usr/bin/env node
'use strict';
/**
 * @file Rotação da chave de criptografia de PII (LGPD) — item 8 do plano
 * async-wandering-kite. docs/LGPD.md documentava a cifra (AES-256-GCM) mas
 * não tinha script de rotação; sem ele, trocar PII_ENCRYPTION_KEY em produção
 * deixaria todo CPF/documento já cifrado ilegível (a chave antiga se perde).
 *
 * Decifra com a chave ANTIGA e recifra com a chave NOVA, no lugar, pra:
 *   - recursos.cpf, candidatos.cpf (string)
 *   - recurso_doc_arquivos.data, candidato_doc_arquivos.data (arquivo)
 *
 * Resiliente a reexecução/interrupção: se um valor já não decifrar com a
 * chave antiga, tenta a chave nova — se der certo, já foi rotacionado nesta
 * mesma rodada (ou numa anterior) e é pulado. Não há como marcar "qual chave
 * cifrou isto" no próprio dado (mesmo formato $2a$-like de envelope pras
 * duas), então a heurística é: decifra com uma OU outra, sempre recifra só
 * com a antiga bem-sucedida.
 *
 * Uso:
 *   DATABASE_URL=... PII_ENCRYPTION_KEY_OLD=... PII_ENCRYPTION_KEY_NEW=... \
 *     node scripts/rotate-pii-key.js
 *   node scripts/rotate-pii-key.js --dry-run   # só conta, não grava
 *
 * Depois de confirmar que rodou limpo (0 falhas), troque PII_ENCRYPTION_KEY
 * pra chave nova no ambiente do app e reinicie. SEMPRE faça backup do banco
 * (E das duas chaves) antes de rodar isto.
 */

const db = require('../db');
const pii = require('../lib/crypto-pii');

const DRY_RUN = process.argv.includes('--dry-run');

/**
 * Decifra uma string tentando a chave antiga, depois a nova (já rotacionada).
 * @returns {{ plaintext: string, jaRotacionado: boolean } | null}  null = não estava cifrado
 */
function decifrarComQualquerChave(value, oldKey, newKey) {
  if (!pii.isEncrypted(value)) return null;
  try {
    return { plaintext: pii.decryptWithKey(value, oldKey), jaRotacionado: false };
  } catch {
    // Chave antiga não bateu — só pode ser que já foi rotacionado antes.
    return { plaintext: pii.decryptWithKey(value, newKey), jaRotacionado: true };
  }
}

function decifrarBufferComQualquerChave(buf, oldKey, newKey) {
  if (!pii.isEncryptedBuffer(buf)) return null;
  try {
    return { plaintext: pii.decryptBufferWithKey(buf, oldKey), jaRotacionado: false };
  } catch {
    return { plaintext: pii.decryptBufferWithKey(buf, newKey), jaRotacionado: true };
  }
}

async function rotacionarCpfs(table, oldKey, newKey) {
  const rows = await db.getMany(`SELECT id, cpf FROM ${table} WHERE cpf IS NOT NULL AND cpf <> ''`, []);
  let rotacionados = 0, jaFeitos = 0, naoCifrados = 0, falhas = 0;
  for (const r of rows) {
    let res;
    try {
      res = decifrarComQualquerChave(r.cpf, oldKey, newKey);
    } catch (e) {
      falhas++;
      console.error(`[${table}.cpf] id=${r.id} — não decifrou com NENHUMA das duas chaves: ${e.message}`);
      continue;
    }
    if (res === null) { naoCifrados++; continue; }
    if (res.jaRotacionado) { jaFeitos++; continue; }
    if (!DRY_RUN) {
      await db.query(`UPDATE ${table} SET cpf = $1 WHERE id = $2`, [pii.encryptWithKey(res.plaintext, newKey), r.id]);
    }
    rotacionados++;
  }
  console.log(`[${table}.cpf] ${rows.length} linha(s) | rotacionar: ${rotacionados} | já rotacionados: ${jaFeitos} | não cifrados: ${naoCifrados} | falhas: ${falhas}`);
  return { rotacionados, falhas };
}

async function rotacionarArquivos(table, oldKey, newKey) {
  const rows = await db.getMany(`SELECT id, data FROM ${table}`, []);
  let rotacionados = 0, jaFeitos = 0, naoCifrados = 0, falhas = 0;
  for (const r of rows) {
    const buf = r.data;
    if (!buf || !Buffer.isBuffer(buf) || buf.length === 0) { naoCifrados++; continue; }
    let res;
    try {
      res = decifrarBufferComQualquerChave(buf, oldKey, newKey);
    } catch (e) {
      falhas++;
      console.error(`[${table}.data] id=${r.id} — não decifrou com NENHUMA das duas chaves: ${e.message}`);
      continue;
    }
    if (res === null) { naoCifrados++; continue; }
    if (res.jaRotacionado) { jaFeitos++; continue; }
    if (!DRY_RUN) {
      await db.query(`UPDATE ${table} SET data = $1 WHERE id = $2`, [pii.encryptBufferWithKey(res.plaintext, newKey), r.id]);
    }
    rotacionados++;
  }
  console.log(`[${table}.data] ${rows.length} arquivo(s) | rotacionar: ${rotacionados} | já rotacionados: ${jaFeitos} | sem cifra: ${naoCifrados} | falhas: ${falhas}`);
  return { rotacionados, falhas };
}

module.exports = { decifrarComQualquerChave, decifrarBufferComQualquerChave };

// Só roda a CLI quando executado direto (`node scripts/rotate-pii-key.js`) —
// permite `require('./rotate-pii-key')` em teste sem disparar o script.
if (require.main === module) (async () => {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL é obrigatório.');
    process.exit(1);
  }
  let oldKey, newKey;
  try {
    oldKey = pii.parseKey(process.env.PII_ENCRYPTION_KEY_OLD);
    newKey = pii.parseKey(process.env.PII_ENCRYPTION_KEY_NEW);
  } catch (e) {
    console.error('PII_ENCRYPTION_KEY_OLD/PII_ENCRYPTION_KEY_NEW inválida(s) ou ausente(s):', e.message);
    process.exit(1);
  }
  if (oldKey.equals(newKey)) {
    console.error('PII_ENCRYPTION_KEY_OLD e PII_ENCRYPTION_KEY_NEW são iguais — nada a rotacionar.');
    process.exit(1);
  }

  console.log(DRY_RUN ? '== DRY-RUN (nada será gravado) ==' : '== Rotacionando chave de PII ==');
  let totalFalhas = 0;
  try {
    for (const table of ['recursos', 'candidatos']) {
      const r = await rotacionarCpfs(table, oldKey, newKey);
      totalFalhas += r.falhas;
    }
    for (const table of ['recurso_doc_arquivos', 'candidato_doc_arquivos']) {
      const r = await rotacionarArquivos(table, oldKey, newKey);
      totalFalhas += r.falhas;
    }
    if (totalFalhas > 0) {
      console.error(`\n${totalFalhas} valor(es) não decifraram com NENHUMA das duas chaves — investigue antes de trocar a chave em produção.`);
      process.exit(1);
    }
    console.log(DRY_RUN
      ? '\nDry-run concluído sem falhas.'
      : '\nConcluído sem falhas. Troque PII_ENCRYPTION_KEY pra chave nova e reinicie o app.');
    process.exit(0);
  } catch (e) {
    console.error('Falha na rotação de chave:', e.message);
    process.exit(1);
  }
})();
