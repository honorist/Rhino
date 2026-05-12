/** @file Repositório de `tipos_base` — categorias de itens BASE (mão de obra,
 *  material, etc.). CRUD genérico, ordenado por `label ASC`. */
const { createRepo } = require('./_factory');
module.exports = createRepo('tipos_base', { orderBy: 'label ASC' });
