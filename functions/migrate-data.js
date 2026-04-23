/**
 * Roda UMA VEZ para importar os dados JSON locais para o Firestore.
 * Uso: node functions/migrate-data.js
 * Requer: GOOGLE_APPLICATION_CREDENTIALS apontando para a service account, ou firebase login
 */
const admin = require('firebase-admin');
const fs    = require('fs');
const path  = require('path');

admin.initializeApp({ projectId: 'gestao-projetos-cmpc' });
const db = admin.firestore();

const DATA_DIR = path.join(__dirname, '..', 'data');

const files = [
  { file: 'contracts.json',     key: 'contracts'     },
  { file: 'caixa.json',         key: 'caixa'         },
  { file: 'base.json',          key: 'base'           },
  { file: 'notas_fiscais.json', key: 'notas_fiscais' },
  { file: 'contas_pagar.json',  key: 'contas_pagar'  },
  { file: 'socios.json',        key: 'socios'         },
  { file: 'investimentos.json', key: 'investimentos'  },
  { file: 'clientes.json',      key: 'clientes'       },
  { file: 'fornecedores.json',  key: 'fornecedores'   },
  { file: 'tipos_base.json',    key: 'tipos_base'     },
  { file: 'niveis_acesso.json', key: 'niveis_acesso'  },
];

async function migrate() {
  for (const { file, key } of files) {
    const filepath = path.join(DATA_DIR, file);
    if (!fs.existsSync(filepath)) { console.log(`Skipping ${file} (not found)`); continue; }
    const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    await db.collection('data').doc(key).set(data);
    console.log(`✓ Migrated ${file} → Firestore data/${key}`);
  }
  console.log('\nMigração concluída!');
  process.exit(0);
}

migrate().catch(e => { console.error(e); process.exit(1); });
