/** @file Repositório de `doc_templates` — templates de documento usados pelo
 *  validador de IA (`/api/ai/validate-doc`). CRUD genérico. */
const { createRepo } = require('./_factory');
module.exports = createRepo('doc_templates', { orderBy: 'nome ASC' });
