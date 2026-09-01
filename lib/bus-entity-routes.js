'use strict';
/**
 * @file Entidade → rota que governa a visibilidade dela, usado pelo filtro
 * de permissão do SSE bus (lib/bus.js, achado L6 da varredura de segurança
 * 2026-07-10 — _broadcast mandava toda mutação pra todo cliente conectado,
 * sem checar se o usuário tinha permissão pra tela/entidade daquele evento).
 *
 * Mesmas chaves de entity usadas em js/realtime.js (VIEW_BY_ENTITY) — lá é
 * "pra qual view re-renderizar", aqui é "quem pode saber que isso mudou".
 * Entidade fora do mapa é tratada como universal (evento vai pra todo mundo,
 * o comportamento de antes) — evita regressão silenciosa em telas ainda não
 * mapeadas em vez de arriscar parar de atualizar em tempo real pra alguém
 * que tinha acesso.
 */
const ENTITY_ROUTE = {
  contracts: '#/contratos',
  clientes: '#/clientes',
  fornecedores: '#/fornecedores',
  'contas-pagar': '#/contas-pagar',
  'notas-fiscais': '#/notas-fiscais',
  caixa: '#/caixa',
  socios: '#/socios',
  investimentos: '#/investimentos',
  base: '#/base',
  recursos: '#/recursos',
  organograma: '#/contratos',
  rdos: '#/rdos',
  manutencoes: '#/manutencao',
  veiculos: '#/frota',
  estoque: '#/estoque',
  'solicitacoes-compra': '#/solicitacoes-compra',
  recrutamento: '#/recrutamento',
  propostas: '#/proposta',
  clausulas: '#/clausulas',
  'folha-pagamento': '#/folha-pagamento',
  documentos: '#/documentos',
  sugestoes: '#/sugestoes',
};

// Rotas que qualquer usuário autenticado enxerga (mesma lista de
// `universais` em js/app.js, perfil.podeAcessar) — sem isto o bus bloquearia
// mutação de uma tela que a própria UI já libera geral.
const UNIVERSAIS = new Set([
  '#/manual',
  '#/rdos',
  '#/estoque',
  '#/comparativo',
  '#/solicitacoes-compra',
  '#/cotacoes-historico',
  '#/manutencao',
  '#/frota',
  '#/proposta',
  '#/clausulas',
  '#/apresentacao',
  '#/cronograma-geral',
  '#/sugestoes',
  '#/portal',
]);

/**
 * @param {string} entity
 * @param {string[]|null} abas  abas do nível de acesso do usuário; `null` =
 *   sem nível atrelado (superAdmin/bootstrap) = sem restrição, mesma regra
 *   de `podeAcessar` no cliente.
 * @returns {boolean}
 */
function podeReceberMutacao(entity, abas) {
  if (!abas) return true;
  const rota = ENTITY_ROUTE[entity];
  if (!rota) return true;
  if (UNIVERSAIS.has(rota)) return true;
  return abas.includes(rota);
}

module.exports = { podeReceberMutacao, ENTITY_ROUTE, UNIVERSAIS };
