'use strict';
/**
 * @file Handler do painel "Cobrança por área" do Dashboard.
 * GET /api/dashboard/cobranca — pendências de RH/Obras/Financeiro/Frota com
 * semáforo por dias parado. Regra de negócio em lib/pendencias.js (pura).
 */
const repos = require('../db/repos');
const perms = require('../lib/permissions');
const { sendJson, sendError } = require('../lib/http-respond');
const { calcularCobranca } = require('../lib/pendencias');

// Cada área do painel deriva de telas sensíveis (RH agrega candidatos/folha;
// Financeiro agrega contas/NFs). Um perfil restrito só pode receber as áreas
// cujas telas ele enxerga — senão o painel furaria o gate de leitura de
// Folha/Recrutamento (qualquer usuário logado veria nomes de candidatos e
// pendências de folha/contas). Super admin (abas = null) recebe tudo.
const AREA_SCREENS = {
  rh: ['#/recrutamento', '#/recursos', '#/folha-pagamento'],
  obras: ['#/contratos', '#/rdos', '#/notas-fiscais'],
  financeiro: ['#/contas-pagar', '#/caixa'],
  frota: ['#/frota', '#/manutencao'],
};

/**
 * Filtro PURO (testável): dadas as `abas` do perfil (null = super admin) e as
 * áreas calculadas, devolve só as áreas cujas telas o perfil enxerga.
 * @param {string[]|null} abas
 * @param {Array<{id:string}>} areas
 * @returns {Array<{id:string}>}
 */
function filtrarAreasVisiveis(abas, areas) {
  if (!abas) return areas; // super admin / sem restrição
  return areas.filter((a) => (AREA_SCREENS[a.id] || []).some((s) => abas.includes(s)));
}

async function handleDashboardCobranca(req, res) {
  try {
    const [
      solicitacoes,
      vagas,
      candidatos,
      folha,
      nfs,
      contratos,
      ultimoRdoPorContrato,
      contas,
      manutencoes,
      veiculos,
      veiculoPlanos,
    ] = await Promise.all([
      repos.solicitacoesContratacao.findAll(),
      repos.vagas.findAll(),
      repos.candidatos.findAll(),
      repos.folhaPagamento.findAll(),
      repos.notasFiscais.findAll(),
      repos.contracts.findAll(),
      repos.rdos.lastRdoDateByContract(),
      repos.contasPagar.findAll(),
      repos.manutencoes.findAll(),
      repos.veiculos.findAll(),
      repos.veiculoPlanos.findAll(),
    ]);
    const hojeISO = new Date().toISOString().slice(0, 10);
    const { areas } = calcularCobranca({
      hojeISO,
      solicitacoes,
      vagas,
      candidatos,
      folha,
      nfs,
      contratos,
      ultimoRdoPorContrato,
      contas,
      manutencoes,
      veiculos,
      veiculoPlanos,
    });
    // Gate de leitura: filtra as áreas por permissão antes de responder (evita
    // que um perfil restrito receba dados de folha/recrutamento via este agregado).
    const abas = await perms.loadAbas(req && req.user); // null = super admin
    sendJson(res, { areas: filtrarAreasVisiveis(abas, areas) });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

module.exports = { handleDashboardCobranca, filtrarAreasVisiveis, AREA_SCREENS };
