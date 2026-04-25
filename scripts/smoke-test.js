#!/usr/bin/env node
/**
 * Smoke test offline (sem Postgres real).
 * Valida:
 *  - módulos carregam
 *  - mappers convertem JSONs reais sem crash
 *  - server.js carrega como módulo
 */
const path = require('path');
const fs = require('fs');

let pass = 0, fail = 0;
const t = (name, fn) => {
  try {
    fn();
    console.log(`  ✓ ${name}`); pass++;
  } catch (e) {
    console.error(`  ✗ ${name}:`, e.message); fail++;
  }
};

console.log('=== Smoke test ===\n');

console.log('[1] Carregar módulos');
t('require db/index', () => require('../db'));
t('require db/repos', () => require('../db/repos'));
t('require lib/pg-sync', () => require('../lib/pg-sync'));

console.log('\n[2] Validar mappers contra JSONs reais em data/');
const pgSync = require('../lib/pg-sync');
const dataDir = path.join(__dirname, '..', 'data');

const FILES = [
  'contracts.json','clientes.json','fornecedores.json','socios.json',
  'recursos.json','caixa.json','contas_pagar.json','notas_fiscais.json',
  'investimentos.json','tipos_base.json','base.json','niveis_acesso.json','doc_templates.json',
];

for (const f of FILES) {
  t(`mapper(${f})`, () => {
    const filepath = path.join(dataDir, f);
    if (!fs.existsSync(filepath)) return;
    const json = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    const cfg = pgSync.MAPPERS[f];
    if (!cfg) throw new Error(`mapper não registrado`);
    const arr = json[cfg.arrayKey] || [];
    for (const item of arr) {
      const row = cfg.map(item);
      if (!row.id) throw new Error('item sem id após map');
      // Verifica que JSON.stringify funciona em todos os campos
      JSON.stringify(row);
    }
  });
}

console.log('\n[3] server.js carrega como módulo (sem listen real)');
t('server.js sem DATABASE_URL', () => {
  delete process.env.DATABASE_URL;
  process.env.PORT = '0'; // listen na porta aleatória, não vincula nada útil
  delete require.cache[require.resolve('../server.js')];
  const mod = require('../server.js');
  if (!mod.__server) throw new Error('module.exports.__server ausente');
  mod.__server.close();
});

console.log(`\n=== ${pass} ok, ${fail} falhas ===`);
process.exit(fail > 0 ? 1 : 0);
