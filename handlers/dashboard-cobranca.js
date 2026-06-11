'use strict';
/**
 * @file Handler do painel "Cobrança por área" do Dashboard.
 * GET /api/dashboard/cobranca — pendências de RH/Obras/Financeiro/Frota com
 * semáforo por dias parado. Regra de negócio em lib/pendencias.js (pura).
 */
const repos = require('../db/repos');
const { sendJson, sendError } = require('../lib/http-respond');
const { calcularCobranca } = require('../lib/pendencias');

async function handleDashboardCobranca(res) {
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
    sendJson(
      res,
      calcularCobranca({
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
      })
    );
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

module.exports = { handleDashboardCobranca };
