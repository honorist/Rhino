'use strict';
/**
 * @file RDO (Relatório Diário de Obra) — núcleo: visão global (dashboard de
 * aderência) + CRUD por contrato. Extraído do server.js.
 *
 * O cluster de mídia do RDO (upload de fotos multipart, assinaturas) permanece
 * inline no server.js por compartilhar o caminho de parsing multipart. As fotos
 * agora vivem em BYTEA na tabela `rdo_fotos` (não mais em disco), e são removidas
 * em cascata quando o RDO é deletado (FK ON DELETE CASCADE).
 */
const repos = require('../db/repos');
const feriados = require('../lib/feriados');
const rdoHH = require('../lib/rdo-hh');
const { sendJson, sendError } = require('../lib/http-respond');
const { generateId } = require('../lib/id');

/**
 * Normaliza o bloco `passarelli` do body (recalculando o detalhamento de
 * horário e o HH no SERVIDOR — fonte da verdade) e devolve o objeto pronto
 * para persistir + o total de homem-hora.
 *
 * @param {object} passarelliBody  body.passarelli (pode ser undefined)
 * @returns {{ passarelli: object, totalHomemHora: number }}
 */
function normalizarPassarelli(passarelliBody) {
  const p = passarelliBody && typeof passarelliBody === 'object' ? passarelliBody : {};
  const detalhe = Array.isArray(p.detalhamentoHorario)
    ? p.detalhamentoHorario.map(rdoHH.normalizarLinha)
    : [];
  const totalHomemHora = rdoHH.totalHomemHora(detalhe);
  return {
    passarelli: {
      pedido: p.pedido || '',
      localizacao: p.localizacao || '',
      subcontratada: p.subcontratada || '',
      fiscalizacaoNome: p.fiscalizacaoNome || '',
      diasCorridos: p.diasCorridos != null ? Number(p.diasCorridos) || 0 : 0,
      detalhamentoHorario: detalhe,
    },
    totalHomemHora,
  };
}

function validarRdo(body, rdos, rdoIdAtual) {
  if (!body.data) return 'Data é obrigatória';
  const duplicado = rdos.some(r => r.data === body.data && r.id !== rdoIdAtual);
  if (duplicado) return `Já existe um RDO para a data ${body.data} neste contrato`;
  return null;
}

/**
 * Próximo número de RDO de um contrato.
 * US-02: respeita `rdoSeed` (gravado em contract.metadata) — útil pra obras
 * já em andamento que adotam o sistema com numeração contínua de fora.
 * Fórmula: max(maior_já_lançado, seed - 1) + 1
 */
function proxNumeroRdo(rdos, seed) {
  const maior = rdos.reduce((max, r) => Math.max(max, Number(r.numero) || 0), 0);
  const seedNum = Math.max(0, Number(seed) || 0);
  return Math.max(maior, seedNum - 1) + 1;
}

// ============ RDOs (visão global) ============
async function handleGetRdosGlobal(res) {
  try {
    const [rdos, contracts, lastByContract] = await Promise.all([
      repos.rdos.findAllFlat(),
      repos.contracts.findAll(),
      repos.rdos.lastRdoDateByContract(),
    ]);

    const hojeISO = new Date().toISOString().split('T')[0];
    const ultimoDiaUtil = feriados.ultimoDiaUtilAnterior(hojeISO);

    // Obras ativas = status='ativo' (mesmo critério do dashboard).
    // Contratos com endDate no passado ainda contam se não foram concluídos manualmente —
    // isso é intencional: obra "vencida" mas aberta ainda precisa de RDO.
    const ativas = contracts.filter(c => c.status === 'ativo');

    // Sem RDO ontem: obra ativa cuja data do último RDO < último dia útil
    const obrasSemRdoOntem = ativas
      .filter(c => {
        const last = lastByContract[c.id];
        return !last || last < ultimoDiaUtil;
      })
      .map(c => ({ contractId: c.id, name: c.name, client: c.client, ultimoRdo: lastByContract[c.id] || null }));

    // Atrasada: > 2 dias úteis sem RDO ou nunca fez RDO.
    const obrasAtrasadas = ativas
      .map(c => {
        const last = lastByContract[c.id] || null;
        const nuncaFezRdo = !last;
        const diasSem = nuncaFezRdo ? null : feriados.diasUteisEntre(last, hojeISO);
        return { contractId: c.id, name: c.name, client: c.client, ultimoRdo: last, diasUteisSemRdo: diasSem, nuncaFezRdo };
      })
      .filter(c => c.nuncaFezRdo || c.diasUteisSemRdo > 2)
      .sort((a, b) => {
        const av = a.nuncaFezRdo ? Number.MAX_SAFE_INTEGER : a.diasUteisSemRdo;
        const bv = b.nuncaFezRdo ? Number.MAX_SAFE_INTEGER : b.diasUteisSemRdo;
        return bv - av;
      });

    // Aderência últimos 7 dias úteis: feitos / esperados (ativas × 7).
    const ultimos7 = feriados.ultimosNDiasUteis(7, hojeISO);
    const setUltimos7 = new Set(ultimos7);
    const ativasIds = new Set(ativas.map(c => c.id));
    let feitos = 0;
    // Contagem por dia para o gráfico
    const feitosPorDia = {};
    for (const d of ultimos7) feitosPorDia[d] = 0;
    for (const r of rdos) {
      if (!ativasIds.has(r.contractId)) continue;
      if (setUltimos7.has(r.data)) {
        feitos++;
        feitosPorDia[r.data] = (feitosPorDia[r.data] || 0) + 1;
      }
    }
    const esperados = ativas.length * ultimos7.length;
    const aderencia = esperados > 0 ? Math.round((feitos / esperados) * 100) : 100;

    // Série diária (ordenada cronologicamente) para o gráfico
    const aderenciaDiaria = ultimos7
      .slice()
      .sort()
      .map(d => ({
        data: d,
        feitos: feitosPorDia[d] || 0,
        esperados: ativas.length,
        pct: ativas.length > 0 ? Math.round((feitosPorDia[d] / ativas.length) * 100) : 100,
      }));

    // Detecta dia da semana de hoje (0=dom, 6=sáb) para banner relaxado
    const hojeDow = new Date(hojeISO + 'T12:00:00').getDay();
    const ehFimDeSemana = hojeDow === 0 || hojeDow === 6;

    // Aderência do mês corrente: RDOs feitos ÷ (obras ativas × dias úteis do mês até hoje).
    const mesInicio = hojeISO.slice(0, 7) + '-01';
    const diasUteisMes = feriados.ultimosNDiasUteis(45, hojeISO).filter(d => d >= mesInicio);
    const setMes = new Set(diasUteisMes);
    let feitosMes = 0;
    for (const r of rdos) {
      if (ativasIds.has(r.contractId) && setMes.has(r.data)) feitosMes++;
    }
    const esperadosMes = ativas.length * diasUteisMes.length;
    const aderenciaMes = esperadosMes > 0 ? Math.round((feitosMes / esperadosMes) * 100) : 100;

    sendJson(res, {
      rdos,
      stats: {
        ultimoDiaUtil,
        hoje: hojeISO,
        ehFimDeSemana,
        obrasAtivas: ativas.length,
        obrasSemRdoOntem,
        obrasAtrasadas,
        aderencia7d: aderencia,
        diasUteisAvaliados: ultimos7.length,
        aderenciaDiaria,
        aderenciaMes,
        diasUteisMes: diasUteisMes.length,
        feitosMes,
        esperadosMes,
      },
    });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

// ============ RDO CRUD (por contrato) ============
async function handlePostRdo(contractId, body, res) {
  try {
    const contract = await repos.contracts.findByIdWithChildren(contractId);
    if (!contract) return sendError(res, 404, 'Contrato não encontrado');

    const erro = validarRdo(body, contract.rdos || [], null);
    if (erro) return sendError(res, 400, erro);

    // US-02: lê rdoSeed do metadata (JSON) do contrato
    let rdoSeed = 0;
    try {
      const meta =
        typeof contract.metadata === 'string'
          ? JSON.parse(contract.metadata)
          : contract.metadata || {};
      rdoSeed = Number(meta.rdoSeed) || 0;
    } catch { /* metadata inválido — ignora */ }

    const pass = normalizarPassarelli(body.passarelli);

    const rdo = {
      id: generateId('rdo'),
      contractId,
      // Número editável: usa o informado (ex.: RDO antigo de obra em andamento);
      // senão, sequencial automático.
      numero: (body.numero != null && String(body.numero).trim())
        ? String(body.numero).trim()
        : String(proxNumeroRdo(contract.rdos || [], rdoSeed)),
      data: body.data,
      diaSemana: body.diaSemana || '',
      osNumero: body.osNumero || '',
      ordemCompra: body.ordemCompra || '',
      projeto: body.projeto || '',
      prazo: JSON.stringify(body.prazo || { dataInicial: '', contratual: 0, decorrido: 0, faltante: 0, pctConcluida: 0 }),
      tempo: JSON.stringify(body.tempo || {
        manha:    { tempo: 'bom', condicoes: 'operavel' },
        tarde:    { tempo: 'bom', condicoes: 'operavel' },
        noiteAnt: { tempo: 'bom', condicoes: 'operavel' },
        precipitacao: 0,
      }),
      periodoTrabalho: body.periodoTrabalho || '7:00 às 17:00',
      horaExtra: body.horaExtra ? 'true' : 'false',
      moi:  JSON.stringify(Array.isArray(body.moi)  ? body.moi  : []),
      mod:  JSON.stringify(Array.isArray(body.mod)  ? body.mod  : []),
      terc: JSON.stringify(Array.isArray(body.terc) ? body.terc : []),
      equipamentos: JSON.stringify(Array.isArray(body.equipamentos) ? body.equipamentos : []),
      atividades:   JSON.stringify(Array.isArray(body.atividades)   ? body.atividades   : []),
      seguranca: JSON.stringify(body.seguranca || { acidente: 'nao_houve', diagnostico: '', comentarios: '' }),
      fiscalizacaoComentarios: body.fiscalizacaoComentarios || '',
      totais: JSON.stringify({
        moi: 0, mod: 0, terc: 0, eqp: 0, homensHora: 0, horasParadas: 0, equipamentoHora: 0,
        ...(body.totais || {}),
        totalHomemHora: pass.totalHomemHora,
      }),
      passarelli: JSON.stringify(pass.passarelli),
      fotos: '[]',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await repos.rdos.create(rdo);
    sendJson(res, await repos.contracts.getEnvelope());
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePutRdo(contractId, rdoId, body, res) {
  try {
    const contract = await repos.contracts.findByIdWithChildren(contractId);
    if (!contract) return sendError(res, 404, 'Contrato não encontrado');
    const atual = (contract.rdos || []).find(r => r.id === rdoId);
    if (!atual) return sendError(res, 404, 'RDO não encontrado');

    const novaData = body.data !== undefined ? body.data : atual.data;
    const erro = validarRdo({ ...body, data: novaData }, contract.rdos || [], rdoId);
    if (erro) return sendError(res, 400, erro);

    const allowed = {};
    const stringFields = ['data', 'diaSemana', 'numero', 'osNumero', 'ordemCompra', 'projeto', 'periodoTrabalho', 'fiscalizacaoComentarios'];
    for (const f of stringFields) { if (body[f] !== undefined) allowed[f] = body[f]; }
    const jsonbFields = ['prazo', 'tempo', 'moi', 'mod', 'terc', 'equipamentos', 'atividades', 'seguranca', 'totais'];
    for (const f of jsonbFields) {
      if (body[f] !== undefined) allowed[f] = JSON.stringify(body[f]);
    }
    // Modelo Passarelli: recalcula detalhamento de horário + HH no servidor
    // (fonte da verdade) e propaga totalHomemHora para `totais`.
    if (body.passarelli !== undefined) {
      const pass = normalizarPassarelli(body.passarelli);
      allowed.passarelli = JSON.stringify(pass.passarelli);
      const totaisBase = body.totais !== undefined
        ? body.totais
        : (typeof atual.totais === 'string' ? JSON.parse(atual.totais || '{}') : (atual.totais || {}));
      allowed.totais = JSON.stringify({ ...totaisBase, totalHomemHora: pass.totalHomemHora });
    }
    if (body.horaExtra !== undefined) allowed.horaExtra = body.horaExtra ? 'true' : 'false';
    allowed.updatedAt = new Date().toISOString();

    await repos.rdos.updateById(rdoId, allowed);
    sendJson(res, await repos.contracts.getEnvelope());
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// Limita geração simultânea de PDFs (pdfkit é CPU-bound). Espelha o guard das
// propostas no server.js, mas local a este módulo.
let _rdoPdfInFlight = 0;
const _RDO_PDF_MAX = 3;

async function handleGetRdoPdf(contractId, rdoId, res) {
  if (_rdoPdfInFlight >= _RDO_PDF_MAX) {
    return sendError(res, 429, 'Servidor ocupado gerando documentos. Aguarde alguns segundos.');
  }
  _rdoPdfInFlight++;
  try {
    const contract = await repos.contracts.findByIdWithChildren(contractId);
    if (!contract) return sendError(res, 404, 'Contrato não encontrado');
    const rdo = (contract.rdos || []).find(r => r.id === rdoId);
    if (!rdo) return sendError(res, 404, 'RDO não encontrado');

    let buf;
    const office = require('../lib/office-convert');
    if (office.isAvailable()) {
      // Caminho preferido: preenche o template OFICIAL Passarelli (.xlsx) e
      // converte com LibreOffice → PDF IDÊNTICO ao modelo.
      const { preencherRdoXlsx } = require('../lib/rdo-xlsx');
      try {
        const xlsx = await preencherRdoXlsx(rdo, contract);
        buf = await office.xlsxToPdf(xlsx);
      } catch (e) {
        console.error('[rdo/pdf] template xlsx falhou, caindo no pdfkit:', e.message);
      }
    }
    if (!buf) {
      // Fallback: gerador PDFKit (dev local sem LibreOffice, ou erro acima).
      const { gerarRdoPdf, isPdfAvailable } = require('../lib/rdo-pdf');
      if (!isPdfAvailable()) return sendError(res, 500, 'Gerador de PDF indisponível.');
      buf = await gerarRdoPdf(rdo, contract);
    }
    const fname = `RDO_${String(rdo.numero || rdoId).replace(/[^A-Za-z0-9_-]+/g, '_')}_${rdo.data || ''}.pdf`;
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Length': buf.length,
      'Content-Disposition': `inline; filename="${fname}"`,
    });
    res.end(buf);
  } catch (e) {
    console.error('[rdo/pdf] erro:', e);
    sendError(res, 500, e.message);
  } finally {
    _rdoPdfInFlight--;
  }
}

async function handleDeleteRdo(contractId, rdoId, res) {
  try {
    await repos.rdos.removeById(rdoId);
    // As fotos (rdo_fotos) são removidas em cascata pela FK ON DELETE CASCADE.
    sendJson(res, await repos.contracts.getEnvelope());
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

module.exports = { handleGetRdosGlobal, handlePostRdo, handlePutRdo, handleDeleteRdo, handleGetRdoPdf };
