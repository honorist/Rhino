#!/usr/bin/env node
/**
 * Cria usuário no Rhino.
 *
 * Uso:
 *   docker compose exec rhino node scripts/create-user.js <email> <senha> [nome] [nivel_acesso_id]
 *
 * Exemplos:
 *   docker compose exec rhino node scripts/create-user.js admin@empresa.com senha123 "Admin" encarregado
 */
const auth = require('../lib/auth');
const db = require('../db');

async function main() {
  const [email, password, name, nivelAcessoId] = process.argv.slice(2);
  if (!email || !password) {
    console.error('Uso: create-user.js <email> <senha> [nome] [nivel_acesso_id]');
    process.exit(1);
  }
  if (password.length < 6) {
    console.error('Senha precisa ter no mínimo 6 caracteres');
    process.exit(1);
  }
  try {
    const id = await auth.createUser({ email, password, name, nivelAcessoId });
    console.log(`✓ Usuário criado: ${id}  ${email}`);
  } catch (e) {
    console.error(`✗ Erro: ${e.message}`);
    process.exit(1);
  } finally {
    await db.close();
  }
}

main();
