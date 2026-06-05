#!/usr/bin/env node
'use strict';
/**
 * @file Restaura um backup completo gerado por scripts/backup-prod-full.js.
 *
 * Pré-requisito: o banco de DESTINO deve já ter o schema criado
 * (rode as migrations antes: `DATABASE_URL=<destino> npm run db:migrate`).
 * Este script só recarrega os DADOS.
 *
 * Estratégia: dentro de uma transação, desliga os triggers de FK
 * (`session_replication_role = replica`), faz TRUNCATE + re-INSERT de cada
 * tabela do dump (BYTEA decodificado de base64), e religa os triggers.
 * Ordem de tabelas não importa com os triggers desligados.
 *
 * Uso:
 *   DATABASE_URL=<destino> node scripts/restore-prod-full.js <arquivo.json.gz>
 *
 * ⚠️ DESTRUTIVO: TRUNCATE em cada tabela presente no dump antes de inserir.
 *    Aponte para um banco NOVO/vazio, nunca para produção sem certeza.
 */
const fs = require('fs');
const zlib = require('zlib');
const { Client } = require('pg');

const file = process.argv[2];
const url = process.env.DATABASE_URL;
if (!file) { console.error('uso: DATABASE_URL=<destino> node scripts/restore-prod-full.js <arquivo.json.gz>'); process.exit(1); }
if (!url) { console.error('DATABASE_URL (destino) não definido'); process.exit(1); }

function decodeRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = (v && typeof v === 'object' && typeof v.__bytea__ === 'string')
      ? Buffer.from(v.__bytea__, 'base64')
      : v;
  }
  return out;
}

async function main() {
  const raw = zlib.gunzipSync(fs.readFileSync(file));
  const dump = JSON.parse(raw.toString('utf8'));
  if (!dump || !dump.tables) throw new Error('arquivo não é um rhino-full-backup válido');

  const client = new Client({ connectionString: url, connectionTimeoutMillis: 20000 });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET session_replication_role = replica"); // desliga FK triggers

    let totalRows = 0;
    for (const [tbl, rows] of Object.entries(dump.tables)) {
      await client.query(`TRUNCATE TABLE "${tbl}" CASCADE`);
      for (const r0 of rows) {
        const r = decodeRow(r0);
        const cols = Object.keys(r);
        if (cols.length === 0) continue;
        const ph = cols.map((_, i) => `$${i + 1}`);
        await client.query(
          `INSERT INTO "${tbl}" (${cols.map(c => `"${c}"`).join(',')}) VALUES (${ph.join(',')})`,
          cols.map(c => r[c])
        );
        totalRows++;
      }
      console.log(`  ${tbl}: ${rows.length} linhas`);
    }

    await client.query("SET session_replication_role = DEFAULT");
    await client.query('COMMIT');
    console.log(`OK: restaurado ${Object.keys(dump.tables).length} tabelas, ${totalRows} linhas.`);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

main().catch(e => { console.error('FALHA restore:', e.message); process.exit(1); });
