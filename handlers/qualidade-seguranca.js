'use strict';
/**
 * @file Qualidade & Segurança — leitura unificada de Punch List + SSMA +
 * Ocorrências numa aba só. A regra é a lib pura lib/ocorrencias-obra.js; aqui
 * só se orquestra I/O.
 *
 * As ESCRITAS continuam nos três endpoints existentes (`/punch`, `/ssma`, e
 * ocorrências em `/api/contracts/:id/ocorrencias`) — o formulário escolhe o
 * destino pelo campo "origem". As três tabelas seguem existindo de propósito
 * (ver o cabeçalho de lib/ocorrencias-obra.js).
 *
 * Cada fonte é embrulhada em safe() (padrão de handlers/dre.js): se uma tabela
 * estiver ausente ou uma query falhar, aquela origem entra vazia em vez de
 * derrubar a aba inteira.
 */
const repos = require('../db/repos');
const { unificar } = require('../lib/ocorrencias-obra');
const ssmaLib = require('../lib/ssma');
const { sendJson, sendError } = require('../lib/http-respond');

/** Origens aceitas no filtro; qualquer outra coisa vira 'todos'. */
const ORIGENS = ['todos', 'punch', 'ssma', 'geral'];

/**
 * GET /api/contracts/:id/qualidade?origem=todos|punch|ssma|geral
 *
 * O filtro por origem recorta apenas `itens`. O `resumo` — em especial
 * `resumo.seguranca`, que carrega TF e TG — é SEMPRE calculado sobre todas as
 * ocorrências da obra: são indicadores do contrato, não da lista filtrada.
 * Recalculá-los sobre o recorte faria a TF mudar só porque o usuário clicou num
 * chip de filtro.
 */
async function handleGetQualidade(contractId, res, query) {
  try {
    const contract = await repos.contracts.findById(contractId);
    if (!contract) return sendError(res, 404, 'Contrato não encontrado');

    const safe = async (fn, fallback) => {
      try {
        return (await fn()) ?? fallback;
      } catch (e) {
        console.error('[qualidade]', e.message);
        return fallback;
      }
    };

    const [punchItens, ssmaOcorrencias, contractOcorrencias, rdos] = await Promise.all([
      safe(() => repos.punchItens.findAll({ contractId }), []),
      safe(() => repos.ssmaOcorrencias.findAll({ contractId }), []),
      safe(() => repos.ocorrencias.findAll({ contractId }), []),
      safe(() => repos.rdos.findAll({ contractId }), []),
    ]);

    // HHT (base de TF/TG) somado dos RDOs da obra. Override por `?hht=` segue o
    // mesmo contrato do endpoint de SSMA, para quando o número oficial vem da
    // planilha da segurança e não do sistema.
    const hhtRaw = query && query.hht;
    const hhtOverride = Number(hhtRaw);
    const hht =
      hhtRaw !== undefined && hhtRaw !== null && hhtRaw !== '' &&
      Number.isFinite(hhtOverride) && hhtOverride >= 0
        ? hhtOverride
        : ssmaLib.hhtDeRdos(rdos);

    const hojeISO = new Date().toISOString().slice(0, 10);
    const { itens, resumo } = unificar({
      punchItens,
      ssmaOcorrencias,
      contractOcorrencias,
      hojeISO,
      hht,
    });

    const origemRaw = (query && query.origem) || 'todos';
    const origem = ORIGENS.includes(origemRaw) ? origemRaw : 'todos';
    const filtrados = origem === 'todos' ? itens : itens.filter((i) => i.origem === origem);

    sendJson(res, { itens: filtrados, resumo, origem, hht });
  } catch (e) {
    sendError(res, e.statusCode || 500, e.message);
  }
}

module.exports = { handleGetQualidade, ORIGENS };
