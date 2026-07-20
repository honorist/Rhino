'use strict';
/**
 * @file Envelopes de coleção — helpers compartilhados que leem/escrevem uma
 * coleção via repositório e devolvem `{ [arrayKey]: rows }`. Extraído do
 * server.js (desmembramento), sem alteração de lógica.
 *
 * Usados por handlers que respondem com a lista inteira após uma mutação
 * (documentos de recurso, níveis de acesso). Postgres é a única fonte de
 * verdade; o parâmetro `filename` de `readCollection` é vestigial (legado da
 * época JSON) e mantido só para não editar os call sites antigos.
 */
const repos = require('../db/repos');

// Lê uma coleção do Postgres e retorna o envelope `{ [arrayKey]: rows }`.
async function readCollection(filename, repoName, arrayKey) {
  const rows = await repos[repoName].findAll();
  return { [arrayKey]: rows };
}

// Executa uma operação de escrita via repo e devolve o envelope atualizado.
// Lança se o PG não estiver disponível (escritas não têm fallback seguro).
async function writeCollection(repoName, arrayKey, fn) {
  if (!repos || !repos[repoName]) {
    throw new Error('Banco de dados indisponível');
  }
  const result = await fn(repos[repoName]);
  const rows = await repos[repoName].findAll();
  return { envelope: { [arrayKey]: rows }, result };
}

module.exports = { readCollection, writeCollection };
