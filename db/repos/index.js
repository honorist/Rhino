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
  contractServicos: require('./contract_servicos'),
  medicaoItens:     require('./medicao_itens'),
  organograma:    require('./organograma'),
  rdos:           require('./rdos'),
  rdoApontamentos: require('./rdo_apontamentos'),
  punchItens:     require('./punch_itens'),
  ssmaOcorrencias: require('./ssma_ocorrencias'),
  treinamentos:   require('./treinamentos'),
  epiEntregas:    require('./epi_entregas'),
  pontos:         require('./pontos'),
  composicoes:    require('./composicoes'),
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
  sugestoes:            require('./sugestoes'),

  // Roadmap lote 2 — compras (mapa de cotações + PO), subcontratados,
  // ferramentaria/calibração, equipamentos próprios/locados (itens 13–16).
  cotacoes:             require('./cotacoes'),
  cotacaoItens:         require('./cotacao_itens'),
  cotacaoPrecos:        require('./cotacao_precos'),
  ordensCompra:         require('./ordens_compra'),
  ordemCompraItens:     require('./ordem_compra_itens'),
  subcontratados:       require('./subcontratados'),
  subcontratoMedicoes:  require('./subcontrato_medicoes'),
  ferramentas:          require('./ferramentas'),
  ferramentaCalibracoes: require('./ferramenta_calibracoes'),
  equipamentos:         require('./equipamentos'),
  equipamentoLocacoes:  require('./equipamento_locacoes'),
};
