/**
 * @file Repositório de `recursos` — funcionários/colaboradores (RH).
 *
 * PII em repouso (LGPD): o CPF é CIFRADO na escrita (create/updateById) e
 * DECIFRADO na leitura (findAll/findById), de forma transparente — todos os
 * consumidores de exibição/envelope recebem o CPF em claro, sem mudança.
 *
 * EXCEÇÃO importante: backups e o `before_state` da auditoria NÃO podem conter
 * PII em texto puro (são "dumps"). Para esses casos use `findAllRaw` /
 * `findByIdRaw`, que devolvem o CPF cifrado exatamente como está no banco.
 *
 * `pii.decrypt` deixa passar valores legados em texto puro → leitura continua
 * funcionando ANTES de a migração (scripts/encrypt-existing-pii.js) rodar.
 */
const { createRepo } = require('./_factory');
const pii = require('../../lib/crypto-pii');

const base = createRepo('recursos', { orderBy: 'nome ASC' });

/** Cifra o CPF antes de gravar (idempotente; '' e null passam direto). */
function encWrite(data) {
  if (data && data.cpf !== undefined && data.cpf !== null && data.cpf !== '') {
    return { ...data, cpf: pii.encrypt(String(data.cpf)) };
  }
  return data;
}

/** Decifra o CPF de uma row para exibição. */
function decRead(row) {
  if (row && row.cpf) return { ...row, cpf: pii.decrypt(row.cpf) };
  return row;
}

module.exports = {
  ...base,
  // Escrita: cifra; devolve a row já decifrada (envelope/handler veem em claro).
  async create(data) { return decRead(await base.create(encWrite(data))); },
  async updateById(id, data) { return decRead(await base.updateById(id, encWrite(data))); },
  // Leitura para exibição: decifra.
  async findById(id) { return decRead(await base.findById(id)); },
  async findAll(filters, opts) { return (await base.findAll(filters, opts)).map(decRead); },

  // Leitura SEM decifrar — backups e auditoria (não devem expor PII em claro).
  findAllRaw: base.findAll,
  findByIdRaw: base.findById,
};
