/** @file Repositório de `organograma_membros` — vincula recursos a contratos
 *  com hierarquia (parentId), papel/cargo, e custo alocado. Ordenado por
 *  ordem de criação (preserva a sequência que o usuário definiu). */
const { createRepo } = require('./_factory');

const base = createRepo('organograma_membros', { orderBy: 'created_at ASC' });

module.exports = { ...base };
