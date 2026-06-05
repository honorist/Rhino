#!/usr/bin/env node
'use strict';
/**
 * @file Backup COMPLETO de produção — todas as tabelas do schema `public`,
 * incluindo colunas BYTEA (anexos PDF, fotos de RDO, logos, assinaturas).
 *
 * Diferente do backup por e-mail (`_runEmailBackup` no server.js), que só
 * cobre ~14 tabelas em texto e PULA todos os binários, este dump é fiel:
 * varre o catálogo, dumpa cada tabela inteira e codifica BYTEA em base64
 * para o JSON round-tripar binário sem perda. Gera .json.gz + manifest.
 *
 * Saída:  <OUT_BASE>/<YYYY-MM-DD>/rhino_full_<ts>.json.gz  (+ manifest_<ts>.json)
 * Retenção: mantém só as últimas RHINO_BACKUP_RETENTION (default 7) pastas-dia.
 *
 * Origem da URL (nesta ordem):
 *   1. env RHINO_PG_URL              (usado no GitHub Actions / CI)
 *   2. `railway variables --service Postgres --json` -> DATABASE_PUBLIC_URL
 *
 * Uso:
 *   node scripts/backup-prod-full.js [pastaDestino]
 *   RHINO_BACKUP_DIR=... RHINO_BACKUP_RETENTION=7 node scripts/backup-prod-full.js
 *
 * Restaurar: ver scripts/restore-prod-full.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execSync } = require('child_process');
const { Client } = require('pg');

const OUT_BASE = process.argv[2] || process.env.RHINO_BACKUP_DIR || 'E:\\OneDrive\\Backup_rhino';
const RETENTION_DAYS = parseInt(process.env.RHINO_BACKUP_RETENTION || '7', 10);

// Tabelas transitórias/efêmeras — não têm valor em backup (regeneram sozinhas).
const SKIP_TABLES = new Set([
  'sessions', 'login_attempts', 'password_reset_tokens', 'idempotency_keys', 'portal_sessions',
]);

function getUrl() {
  if (process.env.RHINO_PG_URL) return process.env.RHINO_PG_URL;
  const out = execSync('railway variables --service Postgres --json', { encoding: 'utf8' });
  return JSON.parse(out).DATABASE_PUBLIC_URL;
}

/** Codifica Buffers (BYTEA) como marcador base64 para o JSON preservar binário. */
function encodeRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = Buffer.isBuffer(v) ? { __bytea__: v.toString('base64') } : v;
  }
  return out;
}

async function main() {
  const url = getUrl();
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 20000 });
  await client.connect();

  const t = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`
  );
  const tables = t.rows.map(r => r.table_name).filter(n => !SKIP_TABLES.has(n));

  const dump = {
    _meta: { format: 'rhino-full-backup-v1', generatedAt: new Date().toISOString(), source: 'railway-prod' },
    tables: {},
  };
  const counts = {};
  for (const tbl of tables) {
    const r = await client.query(`SELECT * FROM "${tbl}"`);
    dump.tables[tbl] = r.rows.map(encodeRow);
    counts[tbl] = r.rowCount;
  }
  await client.end();

  const now = new Date();
  const day = now.toISOString().slice(0, 10);                       // YYYY-MM-DD
  const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);  // YYYY-MM-DDTHH-MM-SS
  const dir = path.join(OUT_BASE, day);
  fs.mkdirSync(dir, { recursive: true });

  const json = JSON.stringify(dump);
  const gz = zlib.gzipSync(Buffer.from(json), { level: 9 });
  const file = path.join(dir, `rhino_full_${ts}.json.gz`);
  fs.writeFileSync(file, gz);
  if (!fs.statSync(file).size) throw new Error('arquivo de backup vazio — abortando');

  const totalRows = Object.values(counts).reduce((a, b) => a + b, 0);
  const manifest = {
    generatedAt: dump._meta.generatedAt, file: path.basename(file),
    tables: tables.length, totalRows, rawBytes: json.length, gzBytes: gz.length,
    rowsPerTable: counts,
  };
  fs.writeFileSync(path.join(dir, `manifest_${ts}.json`), JSON.stringify(manifest, null, 2));

  // Retenção: apaga pastas-dia mais antigas que RETENTION_DAYS.
  const cutoff = Date.now() - RETENTION_DAYS * 86400000;
  const pruned = [];
  for (const name of fs.readdirSync(OUT_BASE)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(name)) continue;
    const d = Date.parse(name + 'T00:00:00Z');
    if (!isNaN(d) && d < cutoff) {
      fs.rmSync(path.join(OUT_BASE, name), { recursive: true, force: true });
      pruned.push(name);
    }
  }

  console.log(`OK: ${tables.length} tabelas, ${totalRows} linhas, ${(gz.length / 1024).toFixed(0)} KB`);
  console.log(`-> ${file}`);
  const naoVazias = Object.entries(counts).filter(([, n]) => n > 0).map(([k, n]) => `${k}=${n}`);
  console.log(`Tabelas com dados (${naoVazias.length}): ${naoVazias.join(', ')}`);
  if (pruned.length) console.log(`Retenção: removidas ${pruned.length} pasta(s) >${RETENTION_DAYS}d: ${pruned.join(', ')}`);
}

main().catch(e => { console.error('FALHA backup:', e.message); process.exit(1); });
