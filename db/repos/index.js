/**
 * @file Barrel de repositórios — importação única para todos os repos.
 *
 * @example
 *   const repos = require('./db/repos');
 *   const contracts = await repos.contracts.findAll();
 *   const novoCliente = await repos.clientes.create({ nome: 'Acme', ... });
 *
 * Cada export é um repositório criado por `_factory.createRepo(table, opts)`
 * ou um módulo customizado que estende o factory (ex: `contracts.js` adiciona
 * `getEnvelope()` que junta saidas + budget + organograma + rdos).
 */
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
  folhaPagamento: require('./folha_pagamento'),
  folhaPagamentoItens: require('./folha_pagamento_itens'),
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
  solicitacoesCompra:   require('./solicitacoes_compra'),
  manutencoes:          require('./manutencoes'),
  veiculos:             require('./veiculos'),
  veiculoPlanos:          require('./veiculo_planos'),
  veiculoManutencoes:     require('./veiculo_manutencoes'),
  veiculoAbastecimentos:  require('./veiculo_abastecimentos'),
  propostas:            require('./propostas'),
  propostaCustos:       require('./proposta_custos'),
  propostaAnexos:       require('./proposta_anexos'),
  clausulas:            require('./clausulas'),
  appSettings:          require('./app_settings'),
  caseLogos:            require('./case_logos'),

  // Recrutamento (US-05 a US-09)
  solicitacoesContratacao: require('./solicitacoes_contratacao'),
  vagas:                require('./vagas'),
  candidatos:           require('./candidatos'),
  notificacoes:         require('./notificacoes'),
};
