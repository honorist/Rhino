#!/usr/bin/env node
/**
 * @file Aplicador minimalista de migrations SQL.
 *
 * Roda no boot (railway.json startCommand) ou via `npm run db:migrate`.
 * Lê db/migrations/*.sql em ordem alfabética, aplica os que ainda não
 * foram registrados na tabela `_app_migrations`.
 *
 * Por que não node-pg-migrate? A v8 quebrou compatibilidade com timestamps
 * `YYYYMMDDHHMMSS` (passou a exigir Date.now() em ms). Nossas migrations
 * existentes usam o formato antigo. Em vez de renomear arquivos (perde
 * histórico) ou pinar v7 (uma dep adicional), aplicamos diretamente — todos
 * os SQLs são idempotentes (IF NOT EXISTS em tudo).
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'db', 'migrations');
const CONTROL_TABLE = '_app_migrations';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('[migrate] DATABASE_URL não definido — abortando');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 20000,
  });

  try {
    // 1. Garante tabela de controle
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${CONTROL_TABLE} (
        name       TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // 2. Lista arquivos .sql ordenados alfabeticamente.
    //    Ignora *.down.sql — são scripts de rollback (ver rollback-migration.js),
    //    nunca devem ser aplicados como migration forward.
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.toLowerCase().endsWith('.sql') && !f.toLowerCase().endsWith('.down.sql'))
      .sort();

    if (files.length === 0) {
      console.log('[migrate] nenhuma migration encontrada');
      return;
    }

    // 3. Busca já aplicadas
    const { rows } = await pool.query(`SELECT name FROM ${CONTROL_TABLE}`);
    const applied = new Set(rows.map(r => r.name));

    // 4. Para cada arquivo novo, aplica + registra
    let aplicadasAgora = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`[migrate] ⊝ ${file} (já aplicada)`);
        continue;
      }
      const sqlPath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(sqlPath, 'utf8');

      // Transação por arquivo: aplica SQL + registra no controle
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Postgres aceita múltiplas statements no mesmo .query() — perfeito p/ migrations
        await client.query(sql);
        await client.query(
          `INSERT INTO ${CONTROL_TABLE} (name) VALUES ($1)
             ON CONFLICT (name) DO NOTHING`,
          [file]
        );
        await client.query('COMMIT');
        console.log(`[migrate] ✓ ${file}`);
        aplicadasAgora++;
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        // Caso especial: se migration já criou tabelas em prod ANTES do
        // controle ter sido criado (caso da 20260505 que rodou via
        // node-pg-migrate), tentamos verificar se a falha é só duplicação.
        // Se for, marcamos como aplicada e seguimos.
        const msg = String(e.message || '');
        const isAlreadyApplied =
          msg.includes('already exists') ||
          msg.includes('duplicate_object') ||
          (e.code && ['42P07', '42710', '42P06'].includes(e.code));
        if (isAlreadyApplied) {
          console.warn(`[migrate] ⚠  ${file}: parece já aplicada fora do controle — marcando como ok (${msg.slice(0, 80)})`);
          await pool.query(
            `INSERT INTO ${CONTROL_TABLE} (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
            [file]
          );
        } else {
          console.error(`[migrate] ✗ ${file} falhou:`, msg);
          throw e;
        }
      } finally {
        client.release();
      }
    }

    if (aplicadasAgora === 0) {
      console.log('[migrate] tudo em dia, nada para aplicar');
    } else {
      console.log(`[migrate] OK — ${aplicadasAgora} migration(s) aplicada(s)`);
    }
  } finally {
    await pool.end();
  }
}

main().catch(e => {
  console.error('[migrate] erro fatal:', e);
  process.exit(1);
});
