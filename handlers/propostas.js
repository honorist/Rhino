'use strict';
/**
 * @file Propostas Comerciais — CRUD, custos internos, ciclo (enviar/aceitar/
 * rejeitar/duplicar-revisão) e os geradores de documento (DOCX via lib docx,
 * PDF via puppeteer, preview HTML). Inclui as variantes do Portal do Cliente
 * (listar/baixar PDF/DOCX das próprias propostas), que reaproveitam os
 * geradores internos com um gate de ownership. Extraído do server.js
 * (desmembramento), sem alteração de lógica.
 *
 * Geração de DOCX/PDF é cara (docx/puppeteer): um semáforo (_HEAVY_GEN_MAX)
 * limita a 3 gerações simultâneas — o excesso recebe 429. As libs pesadas são
 * require()d sob demanda dentro do handler, não no topo.
 */
const db = require('../db');
const repos = require('../db/repos');
const money = require('../lib/money');
const { generateId } = require('../lib/id');
const { sendJson, sendError } = require('../lib/http-respond');
const { buildCsp } = require('../lib/csp');

// ============ Propostas Comerciais ============
async function handleGetPropostas(res) {
  try {
    sendJson(res, await repos.propostas.getEnvelope());
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handleGetProposta(id, res) {
  try {
    const proposta = await repos.propostas.findByIdWithChildren(id);
    if (!proposta) return sendError(res, 404, 'Proposta não encontrada');
    sendJson(res, { proposta });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handlePostProposta(body, res) {
  try {
    if (!body.titulo || !String(body.titulo).trim()) {
      return sendError(res, 400, 'Título é obrigatório');
    }
    if (!body.clienteId && !body.clienteNome && !body.clienteEmpresa) {
      return sendError(res, 400, 'Cliente é obrigatório');
    }
    // Se vier cliente_id, faz snapshot dos campos do cliente atual
    if (body.clienteId) {
      const cli = await repos.clientes.findById(body.clienteId);
      if (cli) {
        body.clienteNome = body.clienteNome || cli.nome || null;
        body.clienteEmpresa = body.clienteEmpresa || cli.empresa || cli.nome || null;
        body.clienteContato = body.clienteContato || cli.nome || null;
        body.clienteCargo = body.clienteCargo || cli.cargo || null;
        body.clienteEmail = body.clienteEmail || cli.email || null;
        body.clienteTelefone = body.clienteTelefone || cli.telefone || null;
        body.clienteEndereco = body.clienteEndereco || cli.endereco || null;
      }
    }
    const { proposta, contract } = await repos.propostas.createWithContract(body);
    sendJson(res, { proposta, contract, propostasEnvelope: await repos.propostas.getEnvelope() });
  } catch (e) {
    console.error('[propostas] erro POST:', e);
    sendError(res, 400, e.message);
  }
}

async function handlePutProposta(id, body, res) {
  try {
    const allowed = {};
    const camelFields = [
      'tipo',
      'clienteId',
      'clienteNome',
      'clienteEmpresa',
      'clienteContato',
      'clienteCargo',
      'clienteEmail',
      'clienteTelefone',
      'clienteDocumento',
      'clienteEndereco',
      'referencia',
      'titulo',
      'objetivo',
      'saudacao',
      'condicoesPagamento',
      'prazoExecucao',
      'observacoes',
      'signatario',
      'signatarioCargo',
      'status',
    ];
    for (const f of camelFields) {
      if (body[f] !== undefined) allowed[f] = body[f];
    }
    // Campos numéricos
    if (body.valorTotal !== undefined) allowed.valorTotal = money.parse(body.valorTotal);
    if (body.validadeDias !== undefined)
      allowed.validadeDias = parseInt(body.validadeDias, 10) || 15;
    if (body.garantiaMeses !== undefined) {
      allowed.garantiaMeses =
        body.garantiaMeses === null || body.garantiaMeses === ''
          ? null
          : parseInt(body.garantiaMeses, 10);
    }
    // JSONB
    for (const f of [
      'escopo',
      'obrigacoesContratada',
      'obrigacoesContratante',
      'cronograma',
      'investimentoHh',
      'investimentoMat',
      'metadata',
    ]) {
      if (body[f] !== undefined) allowed[f] = JSON.stringify(body[f]);
    }
    if (body.dataEmissao !== undefined) allowed.dataEmissao = body.dataEmissao || null;
    allowed.updatedAt = new Date().toISOString();

    const result = await repos.propostas.updateById(id, allowed);
    if (!result) return sendError(res, 404, 'Proposta não encontrada');

    // Se valorTotal mudou e há contrato vinculado, sincroniza o value do contrato
    if (body.valorTotal !== undefined && result.contratoId) {
      try {
        await repos.contracts.updateById(result.contratoId, { value: allowed.valorTotal });
      } catch (syncErr) {
        console.error('[propostas] falha ao sincronizar value do contrato:', syncErr.message);
      }
    }
    const proposta = await repos.propostas.findByIdWithChildren(id);
    sendJson(res, { proposta });
  } catch (e) {
    console.error('[propostas] erro PUT:', e);
    sendError(res, 400, e.message);
  }
}

async function handleDeleteProposta(id, res) {
  try {
    const proposta = await repos.propostas.findById(id);
    if (!proposta) return sendError(res, 404, 'Proposta não encontrada');
    // Desvincula contrato (mantém em prospecção; usuário decide se apaga depois)
    if (proposta.contratoId) {
      try {
        await db.query(
          `UPDATE contracts
              SET metadata = metadata - 'propostaId' - 'propostaNumero' - 'propostaAno' - 'propostaRevisao' - 'origem'
            WHERE id = $1`,
          [proposta.contratoId]
        );
      } catch (e) {
        console.error('[propostas] falha ao desvincular contrato:', e.message);
      }
    }
    await repos.propostas.removeById(id);
    sendJson(res, await repos.propostas.getEnvelope());
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleEnviarProposta(id, res) {
  try {
    const result = await repos.propostas.enviar(id);
    if (!result) return sendError(res, 404, 'Proposta não encontrada');
    sendJson(res, { proposta: result, envelope: await repos.propostas.getEnvelope() });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleAceitarProposta(id, res) {
  try {
    const { proposta, contract } = await repos.propostas.aceitar(id);
    sendJson(res, {
      proposta,
      contract,
      envelope: await repos.propostas.getEnvelope(),
      contractsEnvelope: await repos.contracts.getEnvelope({ lite: true }),
    });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleRejeitarProposta(id, body, res) {
  try {
    const result = await repos.propostas.rejeitar(id, body.motivo);
    if (!result) return sendError(res, 404, 'Proposta não encontrada');
    sendJson(res, { proposta: result, envelope: await repos.propostas.getEnvelope() });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDuplicarProposta(id, res) {
  try {
    const nova = await repos.propostas.duplicarNovaRevisao(id);
    sendJson(res, { proposta: nova, envelope: await repos.propostas.getEnvelope() });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// ── Custos internos ──
async function handlePostPropostaCusto(propostaId, body, res) {
  try {
    const custo = {
      id: generateId('cst'),
      propostaId,
      categoria: body.categoria || 'outros',
      descricao: body.descricao || '',
      valor: money.parse(body.valor),
      percentual: body.percentual != null ? parseFloat(body.percentual) : null,
      ordem: parseInt(body.ordem, 10) || 0,
    };
    await repos.propostaCustos.create(custo);
    const proposta = await repos.propostas.findByIdWithChildren(propostaId);
    sendJson(res, { proposta });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePutPropostaCusto(propostaId, custoId, body, res) {
  try {
    const allowed = {};
    if (body.categoria !== undefined) allowed.categoria = body.categoria;
    if (body.descricao !== undefined) allowed.descricao = body.descricao;
    if (body.valor !== undefined) allowed.valor = money.parse(body.valor);
    if (body.percentual !== undefined)
      allowed.percentual =
        body.percentual === null || body.percentual === '' ? null : parseFloat(body.percentual);
    if (body.ordem !== undefined) allowed.ordem = parseInt(body.ordem, 10) || 0;
    const result = await repos.propostaCustos.updateById(custoId, allowed);
    if (!result) return sendError(res, 404, 'Custo não encontrado');
    const proposta = await repos.propostas.findByIdWithChildren(propostaId);
    sendJson(res, { proposta });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDeletePropostaCusto(propostaId, custoId, res) {
  try {
    await repos.propostaCustos.removeById(custoId);
    const proposta = await repos.propostas.findByIdWithChildren(propostaId);
    sendJson(res, { proposta });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// Anexos de proposta extraídos → handlers/proposta-anexos.js

// ============ Geração de DOCX/PDF/Preview de proposta ============
async function _loadPropostaComAnexosBinarios(propostaId) {
  const proposta = await repos.propostas.findByIdWithChildren(propostaId);
  if (!proposta) return null;
  // Carrega `data` BYTEA de TODOS os anexos: imagens (embed inline) e PDFs
  // (concatenação na sequência via pdf-lib). Sem isso, o concatenador filtra
  // por `a.data` e pula os PDFs anexos.
  const anexosMeta = proposta.anexos || [];
  const anexosComData = await Promise.all(
    anexosMeta.map(async (a) => {
      const full = await repos.propostaAnexos.findByIdWithData(a.id);
      return full || a;
    })
  );
  // Apresentação global + logos de cases (centralizado, não duplicado por proposta)
  let apresentacao = {};
  let caseLogos = [];
  try {
    apresentacao = (await repos.appSettings.get('proposta_apresentacao')) || {};
    const logosMeta = await repos.caseLogos.listMetadata({ ativo: true });
    // Carrega binário de cada logo para embed em PDF/DOCX
    caseLogos = await Promise.all(
      logosMeta.map(async (lg) => {
        const full = await repos.caseLogos.findByIdWithData(lg.id);
        return full || lg;
      })
    );
  } catch (e) {
    console.warn('[propostas] não pude carregar apresentação global:', e.message);
  }
  return { ...proposta, anexos: anexosComData, _apresentacao: apresentacao, _caseLogos: caseLogos };
}

// FIX A-05: limita geração SIMULTÂNEA de documentos. PDF (Puppeteer) e DOCX
// são caros em CPU/memória — sem cap, várias gerações em paralelo derrubam o
// servidor. O rate limit global (1000/min) não protege contra isso.
let _heavyGenInFlight = 0;
const _HEAVY_GEN_MAX = 3;

async function handleGetPropostaDocx(propostaId, res) {
  if (_heavyGenInFlight >= _HEAVY_GEN_MAX) {
    return sendError(res, 429, 'Servidor ocupado gerando documentos. Aguarde alguns segundos.');
  }
  _heavyGenInFlight++;
  try {
    const { gerarDocx, isDocxAvailable } = require('../lib/proposta-docx');
    if (!isDocxAvailable()) {
      return sendError(res, 500, 'Lib `docx` não instalada. Rode `npm install` no servidor.');
    }
    const proposta = await _loadPropostaComAnexosBinarios(propostaId);
    if (!proposta) return sendError(res, 404, 'Proposta não encontrada');
    // NOTA: tentativa de injetar conteudo no Template.dotx (v1.1.2) gerou
    // DOCX corrompido por causa de rIds conflitantes entre meu document.xml
    // e os _rels do template. Revertido para gerador programatico que ja
    // usa logo, cores e fontes do template via lib `docx`.
    const buf = await gerarDocx(proposta);
    const cfg = require('../lib/proposta-template-config');
    const numeroLimpo = cfg.formatNumeroCompleto(proposta).replace(/[^A-Za-z0-9_-]+/g, '_');
    const fname = `Proposta_${numeroLimpo}.docx`;
    res.writeHead(200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Length': buf.length,
      'Content-Disposition': `attachment; filename="${fname}"`,
    });
    res.end(buf);
  } catch (e) {
    console.error('[propostas/docx] erro:', e);
    sendError(res, 500, e.message);
  } finally {
    _heavyGenInFlight--;
  }
}

async function handleGetPropostaPdf(propostaId, res) {
  if (_heavyGenInFlight >= _HEAVY_GEN_MAX) {
    return sendError(res, 429, 'Servidor ocupado gerando documentos. Aguarde alguns segundos.');
  }
  _heavyGenInFlight++;
  try {
    const { gerarPdf, isPdfAvailable } = require('../lib/proposta-pdf');
    if (!isPdfAvailable()) {
      return sendError(
        res,
        500,
        'Lib `puppeteer` não instalada. Rode `npm install puppeteer` no servidor.'
      );
    }
    const proposta = await _loadPropostaComAnexosBinarios(propostaId);
    if (!proposta) return sendError(res, 404, 'Proposta não encontrada');
    const buf = await gerarPdf(proposta);
    const cfg = require('../lib/proposta-template-config');
    const numeroLimpo = cfg.formatNumeroCompleto(proposta).replace(/[^A-Za-z0-9_-]+/g, '_');
    const fname = `Proposta_${numeroLimpo}.pdf`;
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Length': buf.length,
      'Content-Disposition': `inline; filename="${fname}"`,
    });
    res.end(buf);
  } catch (e) {
    console.error('[propostas/pdf] erro:', e);
    sendError(res, 500, e.message);
  } finally {
    _heavyGenInFlight--;
  }
}

async function handleGetPropostaPreview(propostaId, res) {
  try {
    const { renderHtml } = require('../lib/proposta-html');
    const proposta = await repos.propostas.findByIdWithChildren(propostaId);
    if (!proposta) return sendError(res, 404, 'Proposta não encontrada');
    const html = renderHtml(proposta);
    // A view carrega isto num <iframe> same-origin (js/views/proposta/preview.js).
    // O default global é frame-ancestors 'none' (anti-clickjacking) — relaxar só
    // pra 'self' NESTA resposta, senão o próprio app não consegue se auto-enquadrar.
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Frame-Options': 'SAMEORIGIN',
      'Content-Security-Policy': buildCsp("script-src 'self'", "'self'"),
    });
    res.end(html);
  } catch (e) {
    console.error('[propostas/preview] erro:', e);
    sendError(res, 500, e.message);
  }
}

// ============ Portal do Cliente — Propostas ============
async function handlePortalListPropostas(req, res) {
  try {
    const clienteId = req.portalCliente.id;
    const propostas = await db.getMany(
      `SELECT id, numero, ano, revisao, titulo, referencia, tipo,
              valor_total, validade_dias, data_emissao, data_envio,
              status, created_at, updated_at
         FROM propostas
        WHERE cliente_id = $1 AND status IN ('enviada','aceita','rejeitada','expirada')
        ORDER BY data_emissao DESC, created_at DESC`,
      [clienteId]
    );
    sendJson(res, { propostas });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handlePortalPropostaPdf(req, propostaId, res) {
  try {
    const proposta = await repos.propostas.findById(propostaId);
    if (!proposta || proposta.clienteId !== req.portalCliente.id) {
      return sendError(res, 404, 'Proposta não encontrada');
    }
    if (proposta.status === 'rascunho') {
      return sendError(res, 403, 'Proposta ainda em rascunho — aguarde o envio');
    }
    return handleGetPropostaPdf(propostaId, res);
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handlePortalPropostaDocx(req, propostaId, res) {
  try {
    const proposta = await repos.propostas.findById(propostaId);
    if (!proposta || proposta.clienteId !== req.portalCliente.id) {
      return sendError(res, 404, 'Proposta não encontrada');
    }
    if (proposta.status === 'rascunho') {
      return sendError(res, 403, 'Proposta ainda em rascunho — aguarde o envio');
    }
    return handleGetPropostaDocx(propostaId, res);
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

module.exports = {
  handleGetPropostas,
  handleGetProposta,
  handlePostProposta,
  handlePutProposta,
  handleDeleteProposta,
  handleEnviarProposta,
  handleAceitarProposta,
  handleRejeitarProposta,
  handleDuplicarProposta,
  handlePostPropostaCusto,
  handlePutPropostaCusto,
  handleDeletePropostaCusto,
  handleGetPropostaDocx,
  handleGetPropostaPdf,
  handleGetPropostaPreview,
  handlePortalListPropostas,
  handlePortalPropostaPdf,
  handlePortalPropostaDocx,
};
