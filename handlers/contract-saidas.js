'use strict';
/**
 * @file Saídas / BM (Boletim de Medição) de Contrato — Post/Put/Delete.
 * Extraído do server.js. Criar uma saída faz upsert de NF do contrato; editar
 * realoca entre NFs; excluir ajusta. Serialização por contrato via advisory lock.
 *
 * FIX (deadlock pré-existente): o POST usava `SELECT contracts FOR UPDATE`, que
 * deadlockava com o lock FK do `INSERT` da NF (feito por uma conexão separada do
 * pool — `repos`). Trocado por `pg_advisory_xact_lock` (mesmo lock que PUT/DELETE
 * já usavam), que serializa por contrato SEM conflitar com o lock FK.
 */
const db = require('../db');
const repos = require('../db/repos');
const { sendJson, sendError } = require('../lib/http-respond');
const { generateId } = require('../lib/id');
const { validateBody, schemas } = require('../lib/validate');

async function handlePostSaida(contractId, body, res) {
  try {
    await db.withTransaction(async (client) => {
      // Serializa escritas sobre o contrato (mesmo advisory lock do PUT/DELETE).
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::int)', [String(contractId)]);
      const contract = await repos.contracts.findById(contractId);
      if (!contract) {
        const err = new Error('Contract not found');
        err.statusCode = 404;
        throw err;
      }

      const { value: valor, date: dataSaida, type: saidaType, description: saidaDesc } = validateBody(schemas.saidaPost, body);

      const nfsAll = await repos.notasFiscais.findAll();
      const nfsContrato = nfsAll.filter((nf) => nf.contractId === contractId);
      const totalMedidoAtual = nfsContrato.reduce((s, nf) => s + (parseFloat(nf.valor) || 0), 0);
      if (contract.value > 0 && totalMedidoAtual + valor > parseFloat(contract.value) + 0.01) {
        const err = new Error(`BM ultrapassa o valor do contrato. Disponível para medir: R$ ${(parseFloat(contract.value) - totalMedidoAtual).toFixed(2).replace('.', ',')}`);
        err.statusCode = 400;
        throw err;
      }

      // Busca NF do mesmo dia (não emitida) para agregar
      let nf = nfsContrato.find((n) => n.dataLimite === dataSaida && !n.emitida);
      let numeroNf;

      if (nf) {
        const novoValor = (parseFloat(nf.valor) || 0) + valor;
        await repos.notasFiscais.updateById(nf.id, { valor: novoValor, updatedAt: new Date().toISOString() });
        numeroNf = nf.numero;
      } else {
        const numeroBm = String(nfsContrato.length + 1).padStart(3, '0');
        numeroNf = `BM-${numeroBm}`;
        const newNf = {
          id: generateId('nf'),
          numero: numeroNf,
          contractId,
          dataLimite: dataSaida,
          valor,
          prazoRecebimento: (Number.isFinite(parseInt(body.prazoRecebimento, 10)) ? parseInt(body.prazoRecebimento, 10) : 30),
          observacoes: saidaDesc,
          emitida: false,
          dataEmissaoReal: null,
          caixaEntryId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await repos.notasFiscais.create(newNf);
        nf = newNf;
      }

      const saida = {
        id: generateId('sai'),
        contractId,
        type: saidaType,
        description: saidaDesc,
        value: valor,
        date: dataSaida,
        nfId: nf.id,
        numeroBm: numeroNf,
        createdAt: new Date().toISOString(),
      };
      await repos.saidas.create(saida);
    });
    const env = await repos.contracts.getEnvelope();
    sendJson(res, { ...env, notas_fiscais: await repos.notasFiscais.findAll() });
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

async function handlePutSaida(id, body, res) {
  try {
    const saida = await repos.saidas.findById(id);
    if (!saida) return sendError(res, 404, 'Saida not found');

    await db.withTransaction(async (client) => {
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtext($1)::int)',
        [String(saida.contractId)]
      );
      await _handlePutSaidaInner(id, body, saida);
    });
    // Resposta de sucesso só APÓS o commit (não dentro da transação).
    const env = await repos.contracts.getEnvelope();
    sendJson(res, { ...env, notas_fiscais: await repos.notasFiscais.findAll() });
  } catch (e) {
    if (!res.headersSent) sendError(res, e.statusCode || 400, e.message);
  }
}

/**
 * Implementação interna de PUT /saida — roda dentro de db.withTransaction.
 * NÃO responde ao cliente: lança `Error` com `statusCode` em erro de regra, para o
 * caller abortar a transação e responder (evita commit de estado parcial + double-send).
 */
async function _handlePutSaidaInner(id, body, saida) {
  const allowedSaida = { ...validateBody(schemas.saidaPut, body) };

  if (saida.nfId) {
    const nf = await repos.notasFiscais.findById(saida.nfId);
    const dataMudou  = allowedSaida.date  !== undefined && allowedSaida.date  !== saida.date;
    // À prova de float: drift de IEEE-754 não deve falsamente disparar "valor mudou".
    const valorMudou = allowedSaida.value !== undefined && Math.abs(allowedSaida.value - (parseFloat(saida.value) || 0)) > 0.001;

    if (nf && nf.emitida && (dataMudou || valorMudou)) {
      const err = new Error('Não é possível alterar valor ou data de saída com BM já emitido. Cancele a emissão antes.');
      err.statusCode = 400;
      throw err;
    }

    // Ajuste por delta de valor
    if (valorMudou && nf) {
      const delta = allowedSaida.value - (parseFloat(saida.value) || 0);
      const contract = await repos.contracts.findById(saida.contractId);
      if (contract && contract.value > 0) {
        const allNFs = await repos.notasFiscais.findAll();
        const totalMedidoOutros = allNFs.reduce((s, n) =>
          n.contractId !== saida.contractId ? s : s + (parseFloat(n.valor) || 0), 0);
        if (totalMedidoOutros + delta > parseFloat(contract.value) + 0.01) {
          const err = new Error(`BM ultrapassa o valor do contrato. Disponível: R$ ${(parseFloat(contract.value) - totalMedidoOutros).toFixed(2).replace('.', ',')}`);
          err.statusCode = 400;
          throw err;
        }
      }
      await repos.notasFiscais.updateById(nf.id, {
        valor: Math.max(0, (parseFloat(nf.valor) || 0) + delta),
        updatedAt: new Date().toISOString(),
      });
    }

      // Se a data mudou, realoca entre NFs
      if (dataMudou && nf) {
        const novaData = allowedSaida.date;
        const outrasDaNfAtual = (await repos.saidas.findAll({ nfId: nf.id })).filter((s) => s.id !== id);
        if (outrasDaNfAtual.length === 0) {
          await repos.notasFiscais.removeById(nf.id);
        } else {
          await repos.notasFiscais.updateById(nf.id, {
            valor: Math.max(0, (parseFloat(nf.valor) || 0) - (parseFloat(saida.value) || 0)),
            updatedAt: new Date().toISOString(),
          });
        }
        const valorFinal = allowedSaida.value !== undefined ? allowedSaida.value : (parseFloat(saida.value) || 0);
        const allNFs2 = await repos.notasFiscais.findAll();
        const nfsContrato = allNFs2.filter((n) => n.contractId === saida.contractId);
        let nfNova = nfsContrato.find((n) => n.dataLimite === novaData && !n.emitida);
        if (nfNova) {
          await repos.notasFiscais.updateById(nfNova.id, {
            valor: (parseFloat(nfNova.valor) || 0) + valorFinal,
            updatedAt: new Date().toISOString(),
          });
          allowedSaida.nfId = nfNova.id;
          allowedSaida.numeroBm = nfNova.numero;
        } else {
          const numeroNf = `BM-${String(nfsContrato.length + 1).padStart(3, '0')}`;
          const novaNf = {
            id: generateId('nf'),
            numero: numeroNf,
            contractId: saida.contractId,
            dataLimite: novaData,
            valor: valorFinal,
            prazoRecebimento: (Number.isFinite(parseInt(body.prazoRecebimento)) ? parseInt(body.prazoRecebimento) : 30),
            observacoes: allowedSaida.description || saida.description || '',
            emitida: false,
            dataEmissaoReal: null,
            caixaEntryId: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          await repos.notasFiscais.create(novaNf);
          allowedSaida.nfId = novaNf.id;
          allowedSaida.numeroBm = numeroNf;
        }
      }

      // Atualiza prazoRecebimento da NF associada
      if (body.prazoRecebimento !== undefined) {
        const novoPrazo = (Number.isFinite(parseInt(body.prazoRecebimento)) ? parseInt(body.prazoRecebimento) : 30);
        const finalNfId = allowedSaida.nfId || saida.nfId;
        const targetNf = await repos.notasFiscais.findById(finalNfId);
        if (targetNf && !targetNf.emitida && targetNf.prazoRecebimento !== novoPrazo) {
          await repos.notasFiscais.updateById(finalNfId, {
            prazoRecebimento: novoPrazo,
            updatedAt: new Date().toISOString(),
          });
        }
      }
    }

    await repos.saidas.updateById(id, allowedSaida);
    // Sem resposta aqui — handlePutSaida responde após o commit da transação.
}

async function handleDeleteSaida(id, res) {
  try {
    const saida = await repos.saidas.findById(id);
    if (!saida) return sendError(res, 404, 'Saída não encontrada');

    await db.withTransaction(async (client) => {
      // Serializa com POST/PUT de saídas/NFs do mesmo contrato (advisory lock).
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::int)', [String(saida.contractId)]);

      if (saida.nfId) {
        const nf = await repos.notasFiscais.findById(saida.nfId);
        if (nf) {
          if (nf.emitida) {
            const err = new Error('Não é possível excluir saída cujo BM já foi emitido. Cancele a emissão do BM primeiro.');
            err.statusCode = 400;
            throw err;
          }
          const outrasSaidas = (await repos.saidas.findAll({ nfId: nf.id })).filter((s) => s.id !== id);
          if (outrasSaidas.length === 0) {
            await repos.notasFiscais.removeById(nf.id);
          } else {
            await repos.notasFiscais.updateById(nf.id, {
              valor: Math.max(0, (parseFloat(nf.valor) || 0) - (parseFloat(saida.value) || 0)),
              updatedAt: new Date().toISOString(),
            });
          }
        }
      }
      await repos.saidas.removeById(id);
    });

    const env = await repos.contracts.getEnvelope();
    sendJson(res, { ...env, notas_fiscais: await repos.notasFiscais.findAll() });
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

module.exports = { handlePostSaida, handlePutSaida, handleDeleteSaida };
