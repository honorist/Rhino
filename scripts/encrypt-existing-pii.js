#!/usr/bin/env node
'use strict';
/**
 * @file Migração de dados — cifra PII já existente (LGPD).
 *
 * Cifra, no lugar, os CPFs (recursos.cpf) e os arquivos de documentos
 * (recurso_doc_arquivos.data) que ainda estão em texto puro. É IDEMPOTENTE:
 * valores já cifrados são pulados, então pode rodar mais de uma vez com
 * segurança.
 *
 * Pré-requisitos:
 *   - DATABASE_URL apontando para o banco alvo.
 *   - PII_ENCRYPTION_KEY definida (a MESMA que o app usará). Gere com:
 *       node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *
 * Uso:
 *   DATABASE_URL=... PII_ENCRYPTION_KEY=... node scripts/encrypt-existing-pii.js
 *   node scripts/encrypt-existing-pii.js --dry-run   # só conta, não grava
 *
 * SEMPRE faça backup do banco antes. Guarde a chave separada do backup —
 * perder a chave = perder o acesso aos dados cifrados.
 */

const db = require('../db');
const pii = require('../lib/crypto-pii');

const DRY_RUN = process.argv.includes('--dry-run');

async function migrarCpfs() {
  const rows = await db.getMany(
    `SELECT id, cpf FROM recursos WHERE cpf IS NOT NULL AND cpf <> ''`,
    []
  );
  let cifrados = 0, pulados = 0;
  for (const r of rows) {
    if (pii.isEncrypted(r.cpf)) { pulados++; continue; }
    if (!DRY_RUN) {
      await db.query('UPDATE recursos SET cpf = $1 WHERE id = $2', [pii.encrypt(r.cpf), r.id]);
    }
    cifrados++;
  }
  console.log(`[cpf] ${rows.length} com CPF | cifrar: ${cifrados} | já cifrados: ${pulados}`);
  return cifrados;
}

async function migrarArquivos() {
  const rows = await db.getMany(`SELECT id, data FROM recurso_doc_arquivos`, []);
  let cifrados = 0, pulados = 0, vazios = 0;
  for (const r of rows) {
    const buf = r.data;
    if (!buf || !Buffer.isBuffer(buf) || buf.length === 0) { vazios++; continue; }
    if (pii.isEncryptedBuffer(buf)) { pulados++; continue; }
    if (!DRY_RUN) {
      await db.query('UPDATE recurso_doc_arquivos SET data = $1 WHERE id = $2', [pii.encryptBuffer(buf), r.id]);
    }
    cifrados++;
  }
  console.log(`[docs] ${rows.length} arquivos | cifrar: ${cifrados} | já cifrados: ${pulados} | vazios: ${vazios}`);
  return cifrados;
}

(async () => {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL é obrigatório.');
    process.exit(1);
  }
  if (!pii.isConfigured()) {
    console.error('PII_ENCRYPTION_KEY não configurada (32 bytes em base64 ou hex). Abortei.');
    process.exit(1);
  }
  console.log(DRY_RUN ? '== DRY-RUN (nada será gravado) ==' : '== Cifrando PII existente ==');
  try {
    const a = await migrarCpfs();
    const b = await migrarArquivos();
    console.log(DRY_RUN
      ? `\nDry-run concluído. Cifraria ${a} CPFs e ${b} arquivos.`
      : `\nConcluído. ${a} CPFs e ${b} arquivos cifrados.`);
    process.exit(0);
  } catch (e) {
    console.error('Falha na migração de PII:', e.message);
    process.exit(1);
  }
})();
