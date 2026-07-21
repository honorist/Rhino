/** @file Repositório de `subcontratados` — cadastro GLOBAL de empreiteiros /
 *  terceiros (não por obra). Ordena por nome (ASC) porque é uma lista de
 *  seleção/consulta, e o usuário procura o subcontratado pelo nome. As medições
 *  ficam na tabela-filha `subcontrato_medicoes`. */
const { createRepo } = require('./_factory');

module.exports = createRepo('subcontratados', { orderBy: 'nome ASC' });
