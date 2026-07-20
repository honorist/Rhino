'use strict';
/**
 * @file Cobrança Mensal (admin) — o quanto a plataforma cobra do cliente por
 * mês: taxa fixa + valor por contrato ativo, com faixas por volume. Extraído do
 * server.js (desmembramento), sem alteração de lógica.
 *
 * "Contrato ativo no mês" = teve status 'ativo' por >= 2 dias sobrepostos ao
 * mês, apurado a partir de contract_status_history. Acesso restrito a quem
 * enxerga a tela '#/cobranca' (via permissions.temAba — nível nulo = admin sem
 * perfil libera; 'admin' cai na consulta do perfil, como antes).
 */
const db = require('../db');
const repos = require('../db/repos');
const { sendJson, sendError } = require('../lib/http-respond');
const { temAba } = require('../lib/permissions');

const COBRANCA_TAXA_FIXA = 500;
function _cobrancaPorContrato(n) {
  if (n <= 10) return 100;
  if (n <= 15) return 80;
  return 60;
}
function _cobrancaFaixaLabel(n) {
  if (n <= 10) return '1-10 contratos';
  if (n <= 15) return '11-15 contratos';
  return '16+ contratos';
}

// Pode acessar a tela de cobrança? Verifica a permissão '#/cobranca' nas abas do perfil.
// Sem perfil ativo = libera (admin de fato sem nível atribuído).
async function _eAdmin(req) {
  return await temAba(req, '#/cobranca');
}

// Calcula dias com status='ativo' que se sobrepõem ao mês [ano, mes].
// Retorna inteiro de dias ativos.
async function _calcularDiasAtivos(contractId, ano, mes) {
  const inicioMes = new Date(Date.UTC(ano, mes - 1, 1));
  const fimMes = new Date(Date.UTC(ano, mes, 1)); // primeiro dia do mês seguinte
  const rows = await db.getMany(
    `SELECT status, valid_from FROM contract_status_history
     WHERE contract_id = $1 AND valid_from < $2 ORDER BY valid_from ASC`,
    [contractId, fimMes.toISOString()]
  );
  if (!rows.length) return 0;
  let dias = 0;
  for (let i = 0; i < rows.length; i++) {
    const ini = new Date(rows[i].validFrom);
    const fim = i + 1 < rows.length ? new Date(rows[i + 1].validFrom) : fimMes;
    if (rows[i].status !== 'ativo') continue;
    // Interseção [ini, fim) ∩ [inicioMes, fimMes)
    const a = ini > inicioMes ? ini : inicioMes;
    const b = fim < fimMes ? fim : fimMes;
    if (b > a) dias += Math.ceil((b - a) / 86400000);
  }
  return dias;
}

async function _calcularCobrancaMensal(ano, mes) {
  const contracts = await repos.contracts.findAll();
  // Calcula os dias-ativos de cada contrato em paralelo. Antes era um loop
  // sequencial (1 query por contrato = N+1); aqui as N queries disparam juntas
  // e o pool do pg serializa pela capacidade (PG_POOL_MAX). Resultado idêntico:
  // mesmo filtro (>= 2 dias) e mesma ordenação por diasAtivos desc.
  const comDias = await Promise.all(
    contracts.map(async (c) => ({ c, dias: await _calcularDiasAtivos(c.id, ano, mes) }))
  );
  const detalhes = comDias
    .filter(({ dias }) => dias >= 2)
    .map(({ c, dias }) => ({
      contractId: c.id,
      name: c.name,
      statusAtual: c.status,
      diasAtivos: dias,
    }));
  detalhes.sort((a, b) => b.diasAtivos - a.diasAtivos);
  const n = detalhes.length;
  const valorPorContrato = _cobrancaPorContrato(n);
  const valorContratos = n * valorPorContrato;
  const total = COBRANCA_TAXA_FIXA + valorContratos;
  return {
    ano,
    mes,
    contratosAtivos: n,
    faixa: _cobrancaFaixaLabel(n),
    valorPorContrato,
    taxaFixa: COBRANCA_TAXA_FIXA,
    valorContratos,
    total,
    detalhes,
  };
}

async function handleCobrancaMensal(req, ano, mes, res) {
  try {
    if (!(await _eAdmin(req))) return sendError(res, 403, 'Apenas admin pode acessar cobrança');
    if (!(ano >= 2020 && ano <= 2100) || !(mes >= 1 && mes <= 12)) {
      return sendError(res, 400, 'Ano/mês inválidos');
    }
    sendJson(res, await _calcularCobrancaMensal(ano, mes));
  } catch (e) {
    console.error('[cobranca-mensal]', e);
    sendError(res, 500, e.message);
  }
}

async function handleCobrancaHistorico(req, res) {
  try {
    if (!(await _eAdmin(req))) return sendError(res, 403, 'Apenas admin pode acessar cobrança');
    const hoje = new Date();
    const meses = [];
    // 12 meses anteriores ao corrente (não inclui o atual)
    for (let i = 1; i <= 12; i++) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      meses.push(await _calcularCobrancaMensal(d.getFullYear(), d.getMonth() + 1));
    }
    sendJson(res, { meses });
  } catch (e) {
    console.error('[cobranca-historico]', e);
    sendError(res, 500, e.message);
  }
}

async function handleCobrancaProjecaoAtual(req, res) {
  try {
    if (!(await _eAdmin(req))) return sendError(res, 403, 'Apenas admin pode acessar cobrança');
    const hoje = new Date();
    const r = await _calcularCobrancaMensal(hoje.getFullYear(), hoje.getMonth() + 1);
    sendJson(res, { ...r, parcial: true, geradoEm: new Date().toISOString() });
  } catch (e) {
    console.error('[cobranca-projecao]', e);
    sendError(res, 500, e.message);
  }
}

module.exports = {
  handleCobrancaMensal,
  handleCobrancaHistorico,
  handleCobrancaProjecaoAtual,
};
