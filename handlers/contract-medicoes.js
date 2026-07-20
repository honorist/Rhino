'use strict';
/**
 * @file Medição estruturada (BM por itens) + aprovação de BM.
 *
 * A medição por itens NÃO muda a mecânica saída→NF: valida os itens contra a
 * planilha (lib/medicao.js), calcula o total (preço snapshot, BR-MED-002),
 * cria a saída agregando na NF do dia via `criarSaidaAgregandoNf` (handler de
 * saídas) e grava os itens num único INSERT multi-linha. Se o INSERT dos itens
 * falhar, a saída/NF recém-criadas são DESFEITAS (compensação — repos commitam
 * fora da transação; o advisory lock garante a serialização por contrato).
 *
 * Aprovação de BM (BR: transição com motivo): status aprovada|rejeitada com
 * quem/quando; rejeição exige observação.
 */
const db = require('../db');
const repos = require('../db/repos');
const { sendJson, sendError } = require('../lib/http-respond');
const { generateId } = require('../lib/id');
const { validateBody, schemas } = require('../lib/validate');
const med = require('../lib/medicao');
const { criarSaidaAgregandoNf } = require('./contract-saidas');

/** Visão de medições do contrato: planilha com saldo + BMs com itens e retenção. */
async function handleGetContractMedicoes(contractId, res) {
  try {
    const contract = await repos.contracts.findById(contractId);
    if (!contract) return sendError(res, 404, 'Contrato não encontrado');
    // findByContract em vez de findAll().filter — evita o N+1/cap de 5000 linhas
    // do findAll genérico (anti-pattern P1-1, ver db/repos/notas_fiscais.js).
    const [servicos, itens, medido, saidasContrato, nfsContrato] = await Promise.all([
      repos.contractServicos.findAll({ contractId }),
      repos.medicaoItens.findAll({ contractId }),
      repos.medicaoItens.somarPorServico(contractId),
      repos.saidas.findAll({ contractId }),
      repos.notasFiscais.findByContract(contractId),
    ]);

    const servicoById = new Map(servicos.map((s) => [s.id, s]));
    const itensPorSaida = new Map();
    for (const item of itens) {
      const servico = servicoById.get(item.servicoId);
      const arr = itensPorSaida.get(item.saidaId) || [];
      arr.push({
        ...item,
        codigo: servico ? servico.codigo : '',
        descricao: servico ? servico.descricao : '(serviço removido)',
        unidade: servico ? servico.unidade : '',
      });
      itensPorSaida.set(item.saidaId, arr);
    }

    const saidasPorNf = new Map();
    for (const saida of saidasContrato) {
      if (!saida.nfId) continue;
      const arr = saidasPorNf.get(saida.nfId) || [];
      arr.push({ ...saida, itens: itensPorSaida.get(saida.id) || [] });
      saidasPorNf.set(saida.nfId, arr);
    }

    const bms = nfsContrato.map((nf) => {
      const ret = med.computeRetencao(nf.valor, nf.retencaoPct);
      return {
        ...nf,
        retencaoValor: ret.retencao,
        valorLiquido: ret.liquido,
        saidas: saidasPorNf.get(nf.id) || [],
      };
    });

    sendJson(res, {
      // valor medido vem do Σ dos snapshots (BR-MED-002) — recalcular por preço
      // atual faria um reajuste da planilha reescrever o que já foi faturado.
      servicos: med.saldoPorServico(servicos, medido.qtd, medido.valor),
      bms,
    });
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

/** POST /api/contracts/:id/medicoes — { date, itens: [{servicoId, qtd}], description?, prazoRecebimento? } */
async function handlePostContractMedicao(contractId, body, res) {
  try {
    let resultado;
    await db.withTransaction(async (client) => {
      // Mesmo advisory lock das saídas — serializa medições/saídas do contrato.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::int)', [String(contractId)]);
      const contract = await repos.contracts.findById(contractId);
      if (!contract) {
        const err = new Error('Contrato não encontrado');
        err.statusCode = 404;
        throw err;
      }

      const parsed = validateBody(schemas.medicaoPost, body);
      // somarPorServico agrega no banco: findAll traria no máximo DEFAULT_LIMIT
      // (5000) linhas e truncaria o acumulado em silêncio — com o acumulado
      // sub-contado, BR-MED-001 deixaria de bloquear.
      const [servicos, medido] = await Promise.all([
        repos.contractServicos.findAll({ contractId }),
        repos.medicaoItens.somarPorServico(contractId),
      ]);
      if (servicos.length === 0) {
        const err = new Error('Contrato sem planilha de serviços. Cadastre os serviços antes de medir por itens.');
        err.statusCode = 400;
        throw err;
      }

      const calc = med.computeMedicao({
        itens: parsed.itens,
        servicos,
        medidoPorServico: medido.qtd,
      });
      if (!calc.ok) {
        const err = new Error(calc.errors.map((e) => e.msg).join('; '));
        err.statusCode = 400;
        throw err;
      }

      const descricao = parsed.description || `Medição — ${calc.itens.length} serviço(s)`;
      const { saida, nf, nfCriada, nfValorAnterior } = await criarSaidaAgregandoNf(contract, {
        valor: calc.total,
        date: parsed.date,
        type: 'servico',
        description: descricao,
        prazoRecebimento: parsed.prazoRecebimento,
      });

      // Itens num único INSERT multi-linha (atômico por statement).
      const cols = ['id', 'saida_id', 'servico_id', 'contract_id', 'qtd', 'preco_unit', 'valor'];
      const values = [];
      const params = [];
      calc.itens.forEach((item, i) => {
        const base = i * cols.length;
        values.push(`(${cols.map((_, j) => `$${base + j + 1}`).join(', ')})`);
        params.push(generateId('mit'), saida.id, item.servicoId, contractId, item.qtd, item.precoUnit, item.valor);
      });
      try {
        await db.query(
          `INSERT INTO medicao_itens (${cols.join(', ')}) VALUES ${values.join(', ')}`,
          params
        );
      } catch (insertErr) {
        // Compensação: sem itens a medição não existe — desfaz saída e NF.
        try {
          await repos.saidas.removeById(saida.id);
          if (nfCriada) {
            await repos.notasFiscais.removeById(nf.id);
          } else {
            await repos.notasFiscais.updateById(nf.id, {
              valor: nfValorAnterior,
              updatedAt: new Date().toISOString(),
            });
          }
        } catch (undoErr) {
          console.error('[medicao] falha na compensação após erro de INSERT de itens:', undoErr && undoErr.message);
        }
        throw insertErr;
      }

      resultado = { saidaId: saida.id, nfId: nf.id, numeroBm: saida.numeroBm, total: calc.total };
    });

    const env = await repos.contracts.getEnvelope();
    sendJson(res, { ...env, notas_fiscais: await repos.notasFiscais.findAll(), medicao: resultado });
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

/** POST /api/contracts/:id/bms/:nfId/aprovacao — { status: aprovada|rejeitada, obs? } */
async function handlePostBmAprovacao(contractId, nfId, body, user, res) {
  try {
    const nf = await repos.notasFiscais.findById(nfId);
    if (!nf || nf.contractId !== contractId) {
      return sendError(res, 404, 'BM não encontrado neste contrato');
    }
    const parsed = validateBody(schemas.bmAprovacao, body);
    await repos.notasFiscais.updateById(nfId, {
      aprovacaoStatus: parsed.status,
      aprovacaoPor: (user && (user.name || user.email)) || 'desconhecido',
      aprovacaoEm: new Date().toISOString(),
      aprovacaoObs: parsed.obs,
      updatedAt: new Date().toISOString(),
    });
    const env = await repos.contracts.getEnvelope();
    sendJson(res, { ...env, notas_fiscais: await repos.notasFiscais.findAll() });
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

module.exports = {
  handleGetContractMedicoes,
  handlePostContractMedicao,
  handlePostBmAprovacao,
};
