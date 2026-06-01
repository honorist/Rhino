'use strict';
/**
 * @file Organograma (equipe por contrato) — Post/Put/Delete membro. Extraído do
 * server.js. Valida a hierarquia (encarregado/líder de área/profissional) e
 * trata a remoção de líder com subordinados (modos strict/reassign/cascade).
 */
const repos = require('../db/repos');
const { sendJson, sendError } = require('../lib/http-respond');
const { generateId } = require('../lib/id');

const NIVEIS_VALIDOS = ['encarregado', 'lider_area', 'profissional'];

function validarMembroOrganograma(body, organograma, membroIdAtual) {
  const nivel = body.nivel;
  if (!NIVEIS_VALIDOS.includes(nivel)) return 'Nível inválido';
  if (!body.recursoId) return 'Recurso obrigatório';
  const jaExiste = organograma.some((m) => m.recursoId === body.recursoId && m.id !== membroIdAtual);
  if (jaExiste) return 'Este recurso já faz parte do organograma deste contrato';
  if (nivel === 'encarregado') {
    const outroEnc = organograma.some((m) => m.nivel === 'encarregado' && m.id !== membroIdAtual);
    if (outroEnc) return 'Já existe um encarregado neste contrato';
  }
  if (nivel === 'lider_area') {
    if (!body.area || !String(body.area).trim()) return 'Área é obrigatória para líder';
  }
  if (nivel === 'profissional') {
    if (!body.supervisorId) return 'Profissional precisa ter um supervisor';
    const sup = organograma.find((m) => m.id === body.supervisorId);
    if (!sup) return 'Supervisor não encontrado';
    if (sup.nivel !== 'lider_area') return 'Supervisor de profissional deve ser Líder de Área';
  }
  return null;
}

async function handlePostMembroOrganograma(contractId, body, res) {
  try {
    const contract = await repos.contracts.findByIdWithChildren(contractId);
    if (!contract) return sendError(res, 404, 'Contrato não encontrado');
    const erro = validarMembroOrganograma(body, contract.organograma || [], null);
    if (erro) return sendError(res, 400, erro);
    const membro = {
      id: generateId('org'), contractId, recursoId: body.recursoId, nivel: body.nivel, cargo: body.cargo,
      supervisorId: body.nivel === 'encarregado' ? null : (body.supervisorId || null),
      area: body.nivel === 'lider_area' ? String(body.area).trim() : null,
      createdAt: new Date().toISOString(),
    };
    await repos.organograma.create(membro);
    sendJson(res, await repos.contracts.getEnvelope());
  } catch (e) { sendError(res, 400, e.message); }
}

async function handlePutMembroOrganograma(contractId, membroId, body, res) {
  try {
    const contract = await repos.contracts.findByIdWithChildren(contractId);
    if (!contract) return sendError(res, 404, 'Contrato não encontrado');
    const lista = contract.organograma || [];
    const atual = lista.find((m) => m.id === membroId);
    if (!atual) return sendError(res, 404, 'Membro não encontrado');
    const merged = {
      recursoId: body.recursoId !== undefined ? body.recursoId : atual.recursoId,
      nivel: body.nivel !== undefined ? body.nivel : atual.nivel,
      cargo: body.cargo !== undefined ? body.cargo : atual.cargo,
      supervisorId: body.supervisorId !== undefined ? body.supervisorId : atual.supervisorId,
      area: body.area !== undefined ? body.area : atual.area,
    };
    const erro = validarMembroOrganograma(merged, lista, membroId);
    if (erro) return sendError(res, 400, erro);
    await repos.organograma.updateById(membroId, {
      recursoId: merged.recursoId, nivel: merged.nivel, cargo: merged.cargo,
      supervisorId: merged.nivel === 'encarregado' ? null : (merged.supervisorId || null),
      area: merged.nivel === 'lider_area' ? String(merged.area).trim() : null,
    });
    sendJson(res, await repos.contracts.getEnvelope());
  } catch (e) { sendError(res, 400, e.message); }
}

async function handleDeleteMembroOrganograma(contractId, membroId, body, res, query) {
  try {
    const contract = await repos.contracts.findByIdWithChildren(contractId);
    if (!contract) return sendError(res, 404, 'Contrato não encontrado');
    const lista = contract.organograma || [];
    const alvo = lista.find((m) => m.id === membroId);
    if (!alvo) return sendError(res, 404, 'Membro não encontrado');
    const mode = (query && query.mode) || 'strict';
    const reassignTo = query && query.reassignTo;

    if (alvo.nivel === 'encarregado') {
      if (lista.some((m) => m.nivel === 'lider_area')) {
        return sendError(res, 409, 'Não é possível remover o encarregado enquanto houver líderes no organograma');
      }
      await repos.organograma.removeById(membroId);
    } else if (alvo.nivel === 'lider_area') {
      const subordinados = lista.filter((m) => m.supervisorId === membroId);
      if (subordinados.length > 0 && mode === 'strict') {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Líder possui profissionais vinculados. Informe mode=reassign&reassignTo=<liderId> ou mode=cascade',
          subordinadosCount: subordinados.length,
        }));
        return;
      }
      if (mode === 'reassign') {
        const novo = lista.find((m) => m.id === reassignTo && m.nivel === 'lider_area' && m.id !== membroId);
        if (!novo) return sendError(res, 400, 'Líder de destino inválido');
        for (const s of subordinados) await repos.organograma.updateById(s.id, { supervisorId: novo.id });
        await repos.organograma.removeById(membroId);
      } else if (mode === 'cascade') {
        for (const s of subordinados) await repos.organograma.removeById(s.id);
        await repos.organograma.removeById(membroId);
      } else {
        await repos.organograma.removeById(membroId);
      }
    } else {
      await repos.organograma.removeById(membroId);
    }
    sendJson(res, await repos.contracts.getEnvelope());
  } catch (e) { sendError(res, 400, e.message); }
}

module.exports = { handlePostMembroOrganograma, handlePutMembroOrganograma, handleDeleteMembroOrganograma };
