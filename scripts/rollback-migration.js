#!/usr/bin/env node
/**
 * @file Rollback da última migration aplicada.
 *
 * Reverte a migration mais recente registrada em `_app_migrations`, executando
 * o arquivo `<nome>.down.sql` correspondente em db/migrations/. Se o .down.sql
 * não existir, aborta — rollback não é adivinhado.
 *
 * Uso:
 *   npm run db:rollback -- --yes
 *   node scripts/rollback-migration.js --yes
 *
 * Convenção: toda migration nova `XXXX_nome.sql` deve vir acompanhada de
 * `XXXX_nome.down.sql` com o SQL que desfaz a mudança (idempotente de
 * preferência — DROP ... IF EXISTS). Sem o .down.sql, o rollback não é
 * possível por este script.
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'db', 'migrations');
const CONTROL_TABLE = '_app_migrations';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('[rollback] DATABASE_URL não definido — abortando');
    process.exit(1);
  }
  if (!process.argv.includes('--yes')) {
    console.error('[rollback] operação destrutiva — confirme com --yes:');
    console.error('           node scripts/rollback-migration.js --yes');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 20000,
  });

  try {
    // Última migration aplicada (mais recente por applied_at).
    const { rows } = await pool.query(
      `SELECT name FROM ${CONTROL_TABLE} ORDER BY applied_at DESC, name DESC LIMIT 1`
    );
    if (rows.length === 0) {
      console.log('[rollback] nenhuma migration aplicada — nada a reverter');
      return;
    }
    const name = rows[0].name;
    const downFile = name.replace(/\.sql$/i, '.down.sql');
    const downPath = path.join(MIGRATIONS_DIR, downFile);

    if (!fs.existsSync(downPath)) {
      console.error(`[rollback] ✗ ${name}: arquivo de rollback não existe (${downFile})`);
      console.error('           Crie o .down.sql correspondente ou reverta manualmente.');
      process.exit(1);
    }

    const sql = fs.readFileSync(downPath, 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(`DELETE FROM ${CONTROL_TABLE} WHERE name = $1`, [name]);
      await client.query('COMMIT');
      console.log(`[rollback] ✓ ${name} revertida (${downFile})`);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      console.error(`[rollback] ✗ ${name} falhou:`, String(e.message || e));
      process.exit(1);
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch(e => {
  console.error('[rollback] erro fatal:', e);
  process.exit(1);
});
