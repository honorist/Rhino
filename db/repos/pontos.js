/** @file Repositório de `pontos` — marcações de ponto / banco de horas por
 *  colaborador (tabela-filha por recurso_id). Ordena por data desc (folha de
 *  ponto do mês do mais recente para o mais antigo). */
const { createRepo } = require('./_factory');

module.exports = createRepo('pontos', { orderBy: 'data DESC, created_at DESC' });
