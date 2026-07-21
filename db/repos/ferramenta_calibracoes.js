/** @file Repositório de `ferramenta_calibracoes` — histórico de calibrações de
 *  cada ferramenta (data, validade, certificado, resultado), tabela-filha por
 *  ferramenta_id. Ordena por data (mais recente primeiro): é a linha do tempo
 *  de calibração do instrumento. */
const { createRepo } = require('./_factory');

module.exports = createRepo('ferramenta_calibracoes', { orderBy: 'data DESC' });
