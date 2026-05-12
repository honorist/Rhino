/** @file Repositório de `veiculo_planos` — planos de manutenção preventiva
 *  (ex: troca de óleo a cada 10k km, revisão a cada 6 meses). */
const { createRepo } = require('./_factory');

module.exports = createRepo('veiculo_planos', { orderBy: 'descricao ASC' });
