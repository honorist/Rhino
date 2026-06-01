/**
 * @file Repositório de candidatos a uma vaga (US-06+).
 * Status: contatado | interessado | sem_interesse | reprovado_antecedentes | aprovado.
 * Antecedentes: pendente | ok | reprovado.
 *
 * PII em repouso (LGPD): o CPF é CIFRADO na escrita e DECIFRADO na leitura, de
 * forma transparente — espelha o padrão de `recursos.js`. Valores legados em
 * texto puro continuam legíveis (pii.decrypt deixa passar sem prefixo).
 */
const { createRepo } = require('./_factory');
const pii = require('../../lib/crypto-pii');

const base = createRepo('candidatos', { orderBy: 'created_at DESC' });

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
  async create(data) { return decRead(await base.create(encWrite(data))); },
  async updateById(id, data) { return decRead(await base.updateById(id, encWrite(data))); },
  async findById(id) { return decRead(await base.findById(id)); },
  async findAll(filters, opts) { return (await base.findAll(filters, opts)).map(decRead); },

  // Leitura SEM decifrar — backups/auditoria (não devem expor PII em claro).
  findAllRaw: base.findAll,
  findByIdRaw: base.findById,
};
