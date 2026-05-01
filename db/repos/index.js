// Barrel — importe tudo de um só lugar:
//   const repos = require('./db/repos');
//   const contracts = await repos.contracts.findAll();
module.exports = {
  contracts:      require('./contracts'),
  saidas:         require('./saidas'),
  organograma:    require('./organograma'),
  rdos:           require('./rdos'),
  clientes:       require('./clientes'),
  fornecedores:   require('./fornecedores'),
  socios:         require('./socios'),
  recursos:       require('./recursos'),
  caixa:          require('./caixa'),
  contasPagar:    require('./contas_pagar'),
  notasFiscais:   require('./notas_fiscais'),
  investimentos:  require('./investimentos'),
  tiposBase:      require('./tipos_base'),
  baseItems:      require('./base_items'),
  niveisAcesso:   require('./niveis_acesso'),
  docTemplates:   require('./doc_templates'),
  users:          require('./users'),
  aditivos:       require('./aditivos'),
  marcos:         require('./marcos'),
  ocorrencias:    require('./ocorrencias'),
};
