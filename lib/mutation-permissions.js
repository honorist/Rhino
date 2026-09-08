'use strict';
/**
 * @file C-04 — mapa de tela exigida para mutar cada domínio da API, e decisão
 * pura de bloquear/liberar. Extraído de server.js pra ser testável sem I/O
 * (a leitura de `abas`/sessão continua em server.js#checkMutationPermission).
 *
 * Sem isso: a UI esconde a aba por perfil, mas a API aceitava mutação
 * (POST/PUT/DELETE/PATCH) de qualquer usuário autenticado via curl — mesma
 * classe de bug reaberta a cada domínio novo que esquece de entrar na lista
 * (achado da varredura 2026-09-08: cotações, ordens de compra, subcontratados,
 * ferramentas e equipamentos foram ao ar sem regra aqui).
 */

const MUTATION_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

const MUTATION_PERMISSION_RULES = [
  { re: /^\/api\/base\/[^/]+\/allocate$/, screens: ['#/base', '#/contratos'] },
  { re: /^\/api\/(contracts|saidas)(\/|$)/, screens: ['#/contratos'] },
  { re: /^\/api\/(base|tipos-base)(\/|$)/, screens: ['#/base'] },
  { re: /^\/api\/caixa(\/|$)/, screens: ['#/caixa'] },
  { re: /^\/api\/socios(\/|$)/, screens: ['#/socios'] },
  { re: /^\/api\/investimentos(\/|$)/, screens: ['#/investimentos'] },
  { re: /^\/api\/clientes(\/|$)/, screens: ['#/clientes', '#/contratos'] },
  {
    re: /^\/api\/fornecedores(\/|$)/,
    screens: ['#/fornecedores', '#/contratos', '#/contas-pagar'],
  },
  { re: /^\/api\/notas-fiscais(\/|$)/, screens: ['#/notas-fiscais', '#/contratos'] },
  { re: /^\/api\/contas-pagar(\/|$)/, screens: ['#/contas-pagar'] },
  { re: /^\/api\/recursos(\/|$)/, screens: ['#/recursos'] },
  { re: /^\/api\/folha-pagamento(\/|$)/, screens: ['#/folha-pagamento'] },
  { re: /^\/api\/recrutamento(\/|$)/, screens: ['#/recrutamento'] },
  // Mapa de Cotações: uma só tela cobre cotação, itens, preços e a ordem gerada.
  { re: /^\/api\/(cotacoes|ordens-compra)(\/|$)/, screens: ['#/mapa-cotacoes'] },
  { re: /^\/api\/subcontratados(\/|$)/, screens: ['#/subcontratados'] },
  { re: /^\/api\/ferramentas(\/|$)/, screens: ['#/ferramentaria'] },
  { re: /^\/api\/equipamentos(\/|$)/, screens: ['#/equipamentos'] },
];

/**
 * Regra de mutação para o pathname, ou `null` se a rota não é mapeada.
 * @param {string} pathname
 * @returns {{re: RegExp, screens: string[]} | null}
 */
function rulesFor(pathname) {
  return MUTATION_PERMISSION_RULES.find((r) => r.re.test(pathname)) || null;
}

/**
 * Decide se uma requisição de mutação deve ser bloqueada.
 *
 * @param {object} params
 * @param {string} params.pathname
 * @param {string[] | null} params.abas  Abas do perfil (`null` = sem restrição, super admin ou nível legado).
 * @param {boolean} params.isSuperAdmin
 * @returns {{blocked: boolean, screens?: string[]}}
 */
function resolve({ pathname, abas, isSuperAdmin }) {
  if (isSuperAdmin) return { blocked: false };
  const rule = rulesFor(pathname);
  if (!rule) return { blocked: false }; // rota não mapeada → não bloqueia
  if (!abas) return { blocked: false }; // null = sem restrição
  const liberado = rule.screens.some((s) => abas.includes('edit:' + s));
  return liberado ? { blocked: false } : { blocked: true, screens: rule.screens };
}

module.exports = { MUTATION_METHODS, MUTATION_PERMISSION_RULES, rulesFor, resolve };
