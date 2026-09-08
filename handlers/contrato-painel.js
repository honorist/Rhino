'use strict';
/**
 * @file Painel da obra — endpoint de leitura que reúne, num payload só, o
 * retrato da obra (avanço, prazo, margem, faturamento) e a lista do que precisa
 * de atenção. A regra é a lib pura lib/contrato-painel.js; aqui só se orquestra
 * I/O e se aplica o gate de permissão financeira.
 *
 * Cada consulta é embrulhada em safe() (padrão de handlers/dre.js): se uma
 * tabela estiver ausente ou uma query falhar, aquele card degrada sozinho em
 * vez de derrubar o painel inteiro.
 */
const db = require('../db');
const repos = require('../db/repos');
const { calcularPainel } = require('../lib/contrato-painel');
const { computeDreRealizado } = require('../lib/dre');
const { avancoFisicoPonderado } = require('../lib/avanco-fisico');
const { prontidao } = require('../lib/data-book');
const punchLib = require('../lib/punch');
const ssmaLib = require('../lib/ssma');
const evmLib = require('../lib/evm');
const perms = require('../lib/permissions');
const { sendJson, sendError } = require('../lib/http-respond');

/**
 * O painel concentra margem + faturamento num payload só. O servidor hoje
 * gateia apenas MUTAÇÃO (server.js), então qualquer autenticado leria esses
 * números por aqui — mais fácil do que abrindo a aba, que ao menos some da
 * navegação. Aplica-se então o mesmo critério da UI: sem `contrato-tab:
 * financeiro` nem `contrato-tab:dre`, os blocos financeiros não vão no payload.
 *
 * Recebe as `abas` JÁ resolvidas (lib/permissions.js#loadAbas), porque `req.user`
 * guarda só o `nivelAcessoId` — o array vem do perfil no banco. `null` = super
 * admin. Mantém a válvula legada do resto do sistema: perfil que não configurou
 * NENHUMA `contrato-tab:` enxerga tudo (senão trancaria usuários existentes).
 *
 * @param {string[]|null} abas
 * @returns {boolean}
 */
function podeVerFinanceiro(abas) {
  if (!Array.isArray(abas)) return true; // sem perfil (super admin) → tudo
  const contractTabs = abas.filter(
    (a) => typeof a === 'string' && a.startsWith('contrato-tab:')
  );
  if (contractTabs.length === 0) return true; // legado → tudo
  return (
    contractTabs.includes('contrato-tab:financeiro') ||
    contractTabs.includes('contrato-tab:dre')
  );
}

async function handleGetContratoPainel(req, contractId, res) {
  try {
    const contract = await repos.contracts.findById(contractId);
    if (!contract) return sendError(res, 404, 'Contrato não encontrado');

    const safe = async (fn, fallback) => {
      try {
        return (await fn()) ?? fallback;
      } catch (e) {
        console.error('[painel]', e.message);
        return fallback;
      }
    };

    const [rdos, punchItens, ssmaOcorrencias, atividades, caixaRows, medidoRow, organograma, recursos] =
      await Promise.all([
        safe(() => repos.rdos.findAll({ contractId }), []),
        safe(() => repos.punchItens.findAll({ contractId }), []),
        safe(() => repos.ssmaOcorrencias.findAll({ contractId }), []),
        safe(
          () =>
            db.getMany(
              `SELECT * FROM atividades WHERE contract_id = $1 ORDER BY ordem ASC, created_at ASC`,
              [contractId]
            ),
          []
        ),
        safe(
          () =>
            db.getMany(
              `SELECT type, category, SUM(value)::float AS total
                 FROM caixa WHERE contract_id = $1 GROUP BY type, category`,
              [contractId]
            ),
          []
        ),
        safe(
          () =>
            db.getOne(
              `SELECT COALESCE(SUM(value),0)::float AS total FROM saidas WHERE contract_id = $1`,
              [contractId]
            ),
          { total: 0 }
        ),
        safe(() => repos.organograma.findAll({ contractId }), []),
        safe(() => repos.recursos.findAll(), []),
      ]);

    const hojeISO = new Date().toISOString().slice(0, 10);

    const dre = computeDreRealizado({
      contractValue: contract.value,
      totalMedido: medidoRow ? medidoRow.total : 0,
      caixaRows,
    });
    const avanco = avancoFisicoPonderado(atividades);
    const punchResumo = punchLib.resumo(punchItens, hojeISO);
    // HHT sai dos RDOs que já buscamos — sem segunda query (lib/ssma.js).
    const ssmaResumo = ssmaLib.resumo(ssmaOcorrencias, ssmaLib.hhtDeRdos(rdos));
    const dataBook = prontidao({ punchItens, atividades });
    const evm = safeEvm(contract, atividades, caixaRows, hojeISO);

    const painel = calcularPainel({
      contract,
      rdos,
      punchResumo,
      ssmaResumo,
      evm,
      dataBook,
      avanco,
      dre,
      organograma,
      recursos,
      hojeISO,
    });

    // loadAbas resolve o nivelAcessoId no perfil; devolve null pra super admin.
    const abas = await perms.loadAbas(req && req.user);
    if (!podeVerFinanceiro(abas)) {
      delete painel.obra.margem;
      delete painel.obra.faturamento;
    }

    sendJson(res, { painel });
  } catch (e) {
    console.error('[painel] erro:', e);
    sendError(res, 500, e.message);
  }
}

/** EVM nunca pode derrubar o painel: erro aqui vira "sem indicadores". */
function safeEvm(contract, atividades, caixaRows, hojeISO) {
  try {
    const acReal = (caixaRows || [])
      .filter((r) => r && r.type === 'saida')
      .reduce((s, r) => s + (Number(r.total) || 0), 0);
    return evmLib.evm(atividades, acReal, hojeISO);
  } catch (e) {
    console.error('[painel] evm:', e.message);
    return { spi: null, cpi: null, porAtividade: [] };
  }
}

module.exports = { handleGetContratoPainel, podeVerFinanceiro };
