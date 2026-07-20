'use strict';
/**
 * @file Handlers de Frota — veículos, planos de preventiva (por km/meses),
 * manutenções de veículo e abastecimentos. Extraído do server.js
 * (desmembramento), sem alteração de lógica.
 *
 * Quase todo endpoint devolve `repos.veiculos.getEnvelope()` — o front recarrega
 * a tela inteira de frota a cada mutação. A exceção são km/localização (devolvem
 * só o veículo) e a lista de abastecimentos.
 *
 * Abastecimento espelha um lançamento de caixa quando há contrato + valor: o
 * POST cria a row de caixa ANTES do abastecimento (a FK `caixa_entry_id` exige),
 * o PUT estorna e recria, o DELETE estorna.
 */
const repos = require('../db/repos');
const { sendJson, sendError } = require('../lib/http-respond');
const { generateId } = require('../lib/id');
const money = require('../lib/money');

// ============ Frota / Veículos ============
async function handleListVeiculos(res) {
  try {
    sendJson(res, await repos.veiculos.getEnvelope());
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

function _allowedVeiculoFields(body) {
  const allowed = {};
  const fields = [
    'placa',
    'modelo',
    'marca',
    'tipo',
    'observacoes',
    'status',
    'contractId',
    'endereco',
  ];
  for (const f of fields) {
    if (body[f] !== undefined) allowed[f] = body[f] || null;
  }
  if (body.ano !== undefined) allowed.ano = parseInt(body.ano) || null;
  if (body.kmAtual !== undefined) allowed.kmAtual = parseInt(body.kmAtual) || 0;
  if (body.lat !== undefined) allowed.lat = body.lat ? parseFloat(body.lat) : null;
  if (body.lng !== undefined) allowed.lng = body.lng ? parseFloat(body.lng) : null;
  return allowed;
}

async function handlePostVeiculo(body, res) {
  try {
    if (!body.placa) return sendError(res, 400, 'Placa é obrigatória');
    const data = { id: generateId('veic'), ..._allowedVeiculoFields(body) };
    if (data.kmAtual) data.kmAtualizadoEm = new Date();
    if (data.lat && data.lng) data.localizadoEm = new Date();
    await repos.veiculos.create(data);
    sendJson(res, await repos.veiculos.getEnvelope());
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePutVeiculo(id, body, res) {
  try {
    const allowed = _allowedVeiculoFields(body);
    const result = await repos.veiculos.updateById(id, allowed);
    if (!result) return sendError(res, 404, 'Veículo não encontrado');
    sendJson(res, await repos.veiculos.getEnvelope());
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDeleteVeiculo(id, res) {
  try {
    await repos.veiculos.removeById(id);
    sendJson(res, await repos.veiculos.getEnvelope());
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePutVeiculoKm(id, body, res) {
  try {
    const km = parseInt(body.km);
    if (!(km >= 0)) return sendError(res, 400, 'KM inválido');
    const result = await repos.veiculos.updateById(id, { kmAtual: km, kmAtualizadoEm: new Date() });
    if (!result) return sendError(res, 404, 'Veículo não encontrado');
    sendJson(res, { veiculo: result });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePutVeiculoLocalizacao(id, body, res) {
  try {
    const lat = body.lat ? parseFloat(body.lat) : null;
    const lng = body.lng ? parseFloat(body.lng) : null;
    const result = await repos.veiculos.updateById(id, {
      lat,
      lng,
      endereco: body.endereco || null,
      localizadoEm: new Date(),
    });
    if (!result) return sendError(res, 404, 'Veículo não encontrado');
    sendJson(res, { veiculo: result });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePostVeiculoPlano(veiculoId, body, res) {
  try {
    if (!body.descricao) return sendError(res, 400, 'Descrição obrigatória');
    if (!body.intervaloKm && !body.intervaloMeses)
      return sendError(res, 400, 'Informe intervaloKm e/ou intervaloMeses');
    const data = {
      id: generateId('plano'),
      veiculoId,
      descricao: body.descricao,
      intervaloKm: body.intervaloKm ? parseInt(body.intervaloKm) : null,
      intervaloMeses: body.intervaloMeses ? parseInt(body.intervaloMeses) : null,
      ultimoKm: body.ultimoKm ? parseInt(body.ultimoKm) : null,
      ultimaData: body.ultimaData || null,
      ativo: body.ativo === undefined ? true : !!body.ativo,
    };
    await repos.veiculoPlanos.create(data);
    sendJson(res, await repos.veiculos.getEnvelope());
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePutVeiculoPlano(veiculoId, planoId, body, res) {
  try {
    const allowed = {};
    if (body.descricao !== undefined) allowed.descricao = body.descricao;
    if (body.intervaloKm !== undefined)
      allowed.intervaloKm = body.intervaloKm ? parseInt(body.intervaloKm) : null;
    if (body.intervaloMeses !== undefined)
      allowed.intervaloMeses = body.intervaloMeses ? parseInt(body.intervaloMeses) : null;
    if (body.ultimoKm !== undefined)
      allowed.ultimoKm = body.ultimoKm ? parseInt(body.ultimoKm) : null;
    if (body.ultimaData !== undefined) allowed.ultimaData = body.ultimaData || null;
    if (body.ativo !== undefined) allowed.ativo = !!body.ativo;
    await repos.veiculoPlanos.updateById(planoId, allowed);
    sendJson(res, await repos.veiculos.getEnvelope());
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDeleteVeiculoPlano(veiculoId, planoId, res) {
  try {
    await repos.veiculoPlanos.removeById(planoId);
    sendJson(res, await repos.veiculos.getEnvelope());
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePostVeiculoManutencao(req, veiculoId, body, res) {
  try {
    if (!body.data) return sendError(res, 400, 'Data obrigatória');
    const data = {
      id: generateId('manut'),
      veiculoId,
      planoId: body.planoId || null,
      tipo: body.tipo || 'preventiva',
      descricao: body.descricao || '',
      data: body.data,
      km: body.km ? parseInt(body.km) : null,
      custo: body.custo ? money.parse(body.custo) : null,
      fornecedorId: body.fornecedorId || null,
      observacoes: body.observacoes || '',
      arquivo: body.arquivo ? JSON.stringify(body.arquivo) : null,
    };
    await repos.veiculoManutencoes.create(data);

    // Se está vinculada a plano, atualiza ultimoKm e ultimaData do plano
    if (body.planoId) {
      const planoUpd = {};
      if (data.km) planoUpd.ultimoKm = data.km;
      if (data.data) planoUpd.ultimaData = data.data;
      if (Object.keys(planoUpd).length)
        await repos.veiculoPlanos.updateById(body.planoId, planoUpd);
    }
    // Atualiza KM atual do veículo se a manutenção informou KM maior
    if (data.km) {
      const veic = await repos.veiculos.findById(veiculoId);
      if (veic && data.km > (parseInt(veic.kmAtual) || 0)) {
        await repos.veiculos.updateById(veiculoId, {
          kmAtual: data.km,
          kmAtualizadoEm: new Date(),
        });
      }
    }

    sendJson(res, await repos.veiculos.getEnvelope());
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePutVeiculoManutencao(veiculoId, manId, body, res) {
  try {
    const allowed = {};
    const fields = ['tipo', 'descricao', 'data', 'observacoes', 'planoId', 'fornecedorId'];
    for (const f of fields) {
      if (body[f] !== undefined) allowed[f] = body[f] || null;
    }
    if (body.km !== undefined) allowed.km = body.km ? parseInt(body.km) : null;
    if (body.custo !== undefined) allowed.custo = body.custo ? money.parse(body.custo) : null;
    if (body.arquivo !== undefined)
      allowed.arquivo = body.arquivo ? JSON.stringify(body.arquivo) : null;
    await repos.veiculoManutencoes.updateById(manId, allowed);
    sendJson(res, await repos.veiculos.getEnvelope());
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDeleteVeiculoManutencao(veiculoId, manId, res) {
  try {
    await repos.veiculoManutencoes.removeById(manId);
    sendJson(res, await repos.veiculos.getEnvelope());
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// ============ Abastecimentos ============
async function handleListVeiculoAbastecimentos(veiculoId, res) {
  try {
    // Filtra no SQL (WHERE veiculo_id = $1, com o ORDER BY do repo preservado)
    // em vez de trazer a tabela inteira e filtrar em JS — o histórico cresce.
    const rows = await repos.veiculoAbastecimentos.findAll({ veiculoId });
    sendJson(res, { abastecimentos: rows });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handlePostVeiculoAbastecimento(veiculoId, body, res) {
  try {
    if (!body.data) return sendError(res, 400, 'Data obrigatória');
    if (!body.litros) return sendError(res, 400, 'Litros obrigatório');
    const data = {
      id: generateId('abst'),
      veiculoId,
      data: body.data,
      km: body.km ? parseInt(body.km) : null,
      litros: parseFloat(body.litros),
      valorTotal: body.valorTotal ? money.parse(body.valorTotal) : null,
      tipoCombustivel: body.tipoCombustivel || null,
      fornecedorId: body.fornecedorId || null,
      contractId: body.contractId || null,
      observacoes: body.observacoes || '',
    };
    // Reserva e CRIA o lançamento de caixa (se houver contrato + valor) ANTES do
    // abastecimento — a FK caixa_entry_id exige que a row de caixa já exista.
    data.caixaEntryId = data.contractId && data.valorTotal ? generateId('cxa') : null;
    if (data.caixaEntryId) {
      await repos.caixa.create({
        id: data.caixaEntryId,
        type: 'saida',
        value: data.valorTotal,
        date: data.data,
        description: `Abastecimento veículo — ${data.litros}L`,
        category: 'abastecimento',
        contractId: data.contractId,
      });
    }
    await repos.veiculoAbastecimentos.create(data);

    // Atualiza KM atual do veículo se o hodômetro informado for maior
    if (data.km) {
      const veic = await repos.veiculos.findById(veiculoId);
      if (veic && data.km > (parseInt(veic.kmAtual) || 0)) {
        await repos.veiculos.updateById(veiculoId, {
          kmAtual: data.km,
          kmAtualizadoEm: new Date(),
        });
      }
    }

    sendJson(res, await repos.veiculos.getEnvelope());
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePutVeiculoAbastecimento(veiculoId, abastecId, body, res) {
  try {
    const abast = await repos.veiculoAbastecimentos.findById(abastecId);
    if (!abast) return sendError(res, 404, 'Abastecimento não encontrado');
    const allowed = {};
    const strFields = ['data', 'tipoCombustivel', 'fornecedorId', 'contractId', 'observacoes'];
    for (const f of strFields) {
      if (body[f] !== undefined) allowed[f] = body[f] || null;
    }
    if (body.km !== undefined) allowed.km = body.km ? parseInt(body.km) : null;
    if (body.litros !== undefined) allowed.litros = body.litros ? parseFloat(body.litros) : null;
    if (body.valorTotal !== undefined)
      allowed.valorTotal = body.valorTotal ? money.parse(body.valorTotal) : null;

    // Re-sincroniza o lançamento de caixa: estorna o antigo e recria se ainda
    // houver contrato + valor (evita saída de caixa órfã ou desatualizada).
    const contractId = allowed.contractId !== undefined ? allowed.contractId : abast.contractId;
    const valorTotal = allowed.valorTotal !== undefined ? allowed.valorTotal : abast.valorTotal;
    const dataAb = allowed.data !== undefined ? allowed.data : abast.data;
    const litros = allowed.litros !== undefined ? allowed.litros : abast.litros;
    if (abast.caixaEntryId) await repos.caixa.removeById(abast.caixaEntryId);
    let novoCaixaId = null;
    if (contractId && valorTotal) {
      novoCaixaId = generateId('cxa');
      await repos.caixa.create({
        id: novoCaixaId,
        type: 'saida',
        value: valorTotal,
        date: dataAb,
        description: `Abastecimento veículo — ${litros}L`,
        category: 'abastecimento',
        contractId,
      });
    }
    allowed.caixaEntryId = novoCaixaId;
    await repos.veiculoAbastecimentos.updateById(abastecId, allowed);
    sendJson(res, await repos.veiculos.getEnvelope());
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDeleteVeiculoAbastecimento(veiculoId, abastecId, res) {
  try {
    const abast = await repos.veiculoAbastecimentos.findById(abastecId);
    await repos.veiculoAbastecimentos.removeById(abastecId);
    // Estorna o lançamento de caixa gerado por este abastecimento (se houver).
    if (abast && abast.caixaEntryId) await repos.caixa.removeById(abast.caixaEntryId);
    sendJson(res, await repos.veiculos.getEnvelope());
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

module.exports = {
  handleListVeiculos,
  handlePostVeiculo,
  handlePutVeiculo,
  handleDeleteVeiculo,
  handlePutVeiculoKm,
  handlePutVeiculoLocalizacao,
  handlePostVeiculoPlano,
  handlePutVeiculoPlano,
  handleDeleteVeiculoPlano,
  handlePostVeiculoManutencao,
  handlePutVeiculoManutencao,
  handleDeleteVeiculoManutencao,
  handleListVeiculoAbastecimentos,
  handlePostVeiculoAbastecimento,
  handlePutVeiculoAbastecimento,
  handleDeleteVeiculoAbastecimento,
};
