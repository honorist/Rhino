'use strict';
/**
 * @file Documentos de Recurso (colaborador) — arquivos (BYTEA cifrado no PG,
 * LGPD) + validação por IA contra template. Extraído do server.js.
 *
 * Fluxo: o upload cifra o arquivo em repouso, grava em recurso_doc_arquivos +
 * referência no JSONB `documentos` do recurso e dispara validação em background
 * se o doc tem template. A validação converte PDF→imagem (pdf-to-img + jimp) e
 * chama o Claude Vision com o checklist do template, devolvendo score/status.
 *
 * O upload (handlePostRecursoDocArquivo) é chamado direto no createServer
 * (caminho multipart); get/delete/validar passam pelo roteador normal (deps).
 */
const db = require('../db');
const repos = require('../db/repos');
const piiCrypto = require('../lib/crypto-pii');
const { sendJson, sendError } = require('../lib/http-respond');
const { generateId } = require('../lib/id');
const { parseMultipart } = require('../lib/multipart');

// ============ Validação de documento contra template (Claude Vision) ============
// Lê o BYTEA do arquivo, converte PDF→imagem se preciso, redimensiona com jimp,
// chama Claude Vision com o checklist do template e retorna relatório estruturado.
// SEMPRE retorna um objeto válido — em caso de erro, retorna status nao_validado.
async function _validarDocComTemplate(arquivoBuffer, mimeType, template) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { status: 'nao_validado', motivo: 'ANTHROPIC_API_KEY não configurada' };
  const meta = template?.metadata || {};
  const secoes = Array.isArray(meta.secoes) ? meta.secoes : [];
  const campos = Array.isArray(meta.campos) ? meta.campos : [];
  const visuais = Array.isArray(meta.elementos_visuais) ? meta.elementos_visuais : [];
  if (!secoes.length && !campos.length && !visuais.length) {
    return { status: 'nao_validado', motivo: 'template sem padrão de validação configurado' };
  }

  // Coleta imagens (PDF: até 5 páginas amostradas; imagem: 1 página)
  let images = []; // [{data, mediaType, pagina}]
  let totalPaginas = 1;

  try {
    if (mimeType === 'application/pdf') {
      const { pdf } = require('pdf-to-img');
      const { Jimp } = require('jimp');
      const allPages = [];
      for await (const page of await pdf(arquivoBuffer, { scale: 1.2 })) {
        allPages.push(page);
      }
      if (!allPages.length) throw new Error('PDF sem páginas legíveis');
      totalPaginas = allPages.length;

      // Seleciona índices estratégicos: primeira, distribuídas, última (máx 5)
      const idxSet = new Set([0]);
      if (totalPaginas > 1) idxSet.add(totalPaginas - 1);
      if (totalPaginas >= 4) {
        const step = Math.floor(totalPaginas / 3);
        idxSet.add(step);
        idxSet.add(step * 2);
      }
      if (totalPaginas >= 10) idxSet.add(Math.floor(totalPaginas / 2));

      for (const idx of [...idxSet].sort((a, b) => a - b)) {
        let imgBuf = allPages[idx];
        try {
          const img = await Jimp.read(imgBuf);
          if (img.bitmap.width > 1024) { img.resize({ w: 1024 }); imgBuf = await img.getBuffer('image/png'); }
        } catch {}
        images.push({ data: imgBuf.toString('base64'), mediaType: 'image/png', pagina: idx + 1 });
      }
    } else if (/^image\//.test(mimeType)) {
      let imgBuf = arquivoBuffer;
      try {
        const { Jimp } = require('jimp');
        const img = await Jimp.read(imgBuf);
        if (img.bitmap.width > 1280) { img.resize({ w: 1280 }); imgBuf = await img.getBuffer('image/png'); }
      } catch (eImg) {
        console.warn('[validar-doc] jimp falhou:', eImg.message);
      }
      images.push({ data: imgBuf.toString('base64'), mediaType: mimeType });
    } else {
      return { status: 'nao_validado', motivo: `Tipo de arquivo não suportado pra validação: ${mimeType}` };
    }
  } catch (e) {
    return { status: 'nao_validado', erro: 'falha ao preparar imagem: ' + e.message };
  }

  const isMultiPage = totalPaginas > 1;
  const paginasEsperadas = meta.total_paginas_esperado ? Number(meta.total_paginas_esperado) : null;

  const promptTexto = `
Você é um auditor rigoroso de documentos trabalhistas brasileiros.

${isMultiPage
  ? `O documento enviado tem ${totalPaginas} página(s) no total.${paginasEsperadas ? ` O template exige exatamente ${paginasEsperadas} páginas.` : ''}
As imagens abaixo são amostras de páginas selecionadas (cada uma identificada com "Página X de ${totalPaginas}").
Avalie a conformidade com base nas imagens e no total de páginas informado.`
  : 'Analise a IMAGEM abaixo e verifique se ela atende aos requisitos.'}

Responda APENAS com um JSON válido (sem markdown, sem comentários) no formato exato indicado.

REQUISITOS:

Seções esperadas (na ordem informada, todas obrigatórias salvo indicação):
${secoes.map(s => `- ordem ${s.ordem}: ${s.nome}${s.obrigatorio === false ? ' (opcional)' : ''}`).join('\n') || '(nenhuma)'}

Campos a extrair:
${campos.map(c => `- ${c.nome}${c.obrigatorio === false ? ' (opcional)' : ''}${c.regex ? ` (formato: ${c.regex})` : ''}`).join('\n') || '(nenhum)'}

Elementos visuais esperados:
${visuais.map(v => `- ${v.descricao}${v.obrigatorio === false ? ' (opcional)' : ''}`).join('\n') || '(nenhum)'}

Instruções extras:
${meta.instrucoes_extras || '(nenhuma)'}

FORMATO DE RESPOSTA (JSON puro):
{
  "total_paginas": ${totalPaginas},
  "secoes": [{"ordem": 1, "encontrada": true, "observacao": "..."}],
  "campos": [{"nome": "Nome", "encontrado": true, "valor": "..."}],
  "elementos_visuais": [{"descricao": "Assinatura", "encontrado": true}],
  "problemas": ["item específico que não atende"],
  "resumo": "frase curta sobre conformidade geral"
}
`.trim();

  // Monta content com imagens intercaladas de label de página
  const contentItems = [];
  for (const img of images) {
    if (img.pagina) contentItems.push({ type: 'text', text: `--- Página ${img.pagina} de ${totalPaginas} ---` });
    contentItems.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } });
  }
  contentItems.push({ type: 'text', text: promptTexto });

  let texto;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60000);
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        system: 'Você é um auditor de documentos. Responda APENAS com JSON válido, sem markdown.',
        messages: [{ role: 'user', content: contentItems }],
      }),
    });
    clearTimeout(timer);
    if (!resp.ok) {
      const errText = await resp.text();
      return { status: 'nao_validado', erro: `Claude HTTP ${resp.status}: ${errText.slice(0, 200)}` };
    }
    const json = await resp.json();
    texto = json?.content?.[0]?.text || '';
    // Registra uso da API para billing interno
    try {
      const inputTok = json?.usage?.input_tokens || 0;
      const outputTok = json?.usage?.output_tokens || 0;
      // Haiku 4.5: $0.80/MTok input, $4.00/MTok output
      const costUsd = (inputTok * 0.0000008) + (outputTok * 0.000004);
      await db.query(
        `INSERT INTO ai_usage (model, input_tokens, output_tokens, cost_usd, status)
         VALUES ($1, $2, $3, $4, $5)`,
        ['claude-haiku-4-5-20251001', inputTok, outputTok, costUsd, 'ok'],
      );
    } catch (eUsage) {
      console.warn('[ai-usage] falha ao registrar:', eUsage.message);
    }
  } catch (e) {
    return { status: 'nao_validado', erro: 'falha ao chamar Claude: ' + e.message };
  }

  // Extrai JSON da resposta (tolerante a fences ```json ... ```)
  let parsed;
  try {
    const m = texto.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(m ? m[0] : texto);
  } catch {
    return { status: 'nao_validado', erro: 'Claude não retornou JSON válido', resposta: texto.slice(0, 300) };
  }

  // Calcula score: peso por categoria, considerando obrigatórios
  let totalPeso = 0, atendidoPeso = 0;
  const checaSec = (s, idx) => {
    const obr = secoes[idx]?.obrigatorio !== false;
    const peso = obr ? 2 : 1;
    totalPeso += peso;
    if (s.encontrada) atendidoPeso += peso;
  };
  const checaCampo = (c, idx) => {
    const obr = campos[idx]?.obrigatorio !== false;
    const peso = obr ? 2 : 1;
    totalPeso += peso;
    let ok = c.encontrado;
    // Verifica regex se houver
    if (ok && campos[idx]?.regex && c.valor) {
      try { ok = new RegExp(campos[idx].regex).test(c.valor); } catch {}
    }
    if (ok) atendidoPeso += peso;
  };
  const checaVis = (v, idx) => {
    const obr = visuais[idx]?.obrigatorio !== false;
    const peso = obr ? 2 : 1;
    totalPeso += peso;
    if (v.encontrado) atendidoPeso += peso;
  };
  (parsed.secoes || []).forEach(checaSec);
  (parsed.campos || []).forEach(checaCampo);
  (parsed.elementos_visuais || []).forEach(checaVis);
  const score = totalPeso > 0 ? Math.round((atendidoPeso / totalPeso) * 100) : 0;
  const status = score >= 90 ? 'conforme' : score >= 60 ? 'parcial' : 'nao_conforme';

  return {
    status,
    score,
    validadoEm: new Date().toISOString(),
    modelo: 'claude-haiku-4-5-20251001',
    secoes: parsed.secoes || [],
    campos: parsed.campos || [],
    elementos_visuais: parsed.elementos_visuais || [],
    problemas: parsed.problemas || [],
    resumo: parsed.resumo || '',
  };
}

// Roda validação em background e atualiza o JSONB do recurso quando termina.
// Não retorna nada — silencia erros pra não impactar o fluxo principal.
async function _validarDocBackground(recursoId, docId) {
  try {
    const rec = await repos.recursos.findById(recursoId);
    if (!rec) return;
    const docs = rec.documentos || [];
    const idx = docs.findIndex(d => d.id === docId);
    if (idx === -1) return;
    const doc = docs[idx];
    if (!doc.templateId) return;
    const tpl = await repos.docTemplates.findById(doc.templateId);
    if (!tpl) return;

    const arq = await db.getOne(
      `SELECT mime_type, data FROM recurso_doc_arquivos WHERE recurso_id = $1 AND doc_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [recursoId, docId]
    );
    if (!arq) return;

    const validacao = await _validarDocComTemplate(piiCrypto.decryptBuffer(arq.data), arq.mimeType, tpl);

    // Re-busca o recurso (pode ter mudado) e atualiza só o doc
    const recAtual = await repos.recursos.findById(recursoId);
    const docsAtual = recAtual.documentos || [];
    const idx2 = docsAtual.findIndex(d => d.id === docId);
    if (idx2 === -1) return;
    docsAtual[idx2] = { ...docsAtual[idx2], validacao, updatedAt: new Date().toISOString() };
    await repos.recursos.updateById(recursoId, {
      documentos: JSON.stringify(docsAtual),
      updatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('[validar-doc-bg] erro:', e.message);
  }
}

async function handleValidarDocumento(recursoId, docId, res) {
  try {
    const rec = await repos.recursos.findById(recursoId);
    if (!rec) return sendError(res, 404, 'Recurso não encontrado');
    const docs = rec.documentos || [];
    const idx = docs.findIndex(d => d.id === docId);
    if (idx === -1) return sendError(res, 404, 'Documento não encontrado');
    const doc = docs[idx];
    if (!doc.templateId) return sendError(res, 400, 'Documento não tem template associado');
    const tpl = await repos.docTemplates.findById(doc.templateId);
    if (!tpl) return sendError(res, 404, 'Template não encontrado');
    const arq = await db.getOne(
      `SELECT mime_type, data FROM recurso_doc_arquivos WHERE recurso_id = $1 AND doc_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [recursoId, docId]
    );
    if (!arq) return sendError(res, 400, 'Documento sem arquivo anexado');

    const validacao = await _validarDocComTemplate(piiCrypto.decryptBuffer(arq.data), arq.mimeType, tpl);
    docs[idx] = { ...doc, validacao, updatedAt: new Date().toISOString() };
    await repos.recursos.updateById(recursoId, {
      documentos: JSON.stringify(docs),
      updatedAt: new Date().toISOString(),
    });
    sendJson(res, { validacao });
  } catch (e) {
    console.error('[validar-doc]', e);
    sendError(res, 400, e.message);
  }
}

// ============ Arquivos de documentos de recursos (BYTEA no PG) ============
const ARQ_DOC_ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
];
const ARQ_DOC_MAX_BYTES = 10 * 1024 * 1024; // 10 MB por arquivo

function _slugifyForFilename(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // remove acentos
    .replace(/[^a-zA-Z0-9]+/g, '_')                       // não-alfanum → _
    .replace(/^_+|_+$/g, '');                             // trim _
}

// Formato: AAAA_MM_DD_TipoDoc_Nome_Pessoa.ext
function _buildArquivoFilename({ nomeRecurso, tipoDoc, filenameOriginal }) {
  const d = new Date();
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  const tipo   = _slugifyForFilename(tipoDoc) || 'Doc';
  const pessoa = _slugifyForFilename(nomeRecurso) || 'Pessoa';
  const m = String(filenameOriginal || '').match(/\.[a-zA-Z0-9]+$/);
  const ext = m ? m[0].toLowerCase() : '.bin';
  return `${ano}_${mes}_${dia}_${tipo}_${pessoa}${ext}`;
}

function handlePostRecursoDocArquivo(recursoId, docId, req, res) {
  const contentType = req.headers['content-type'] || '';
  const mBoundary = contentType.match(/boundary=(.+)$/);
  if (!mBoundary) return sendError(res, 400, 'Content-Type multipart esperado');
  const boundary = mBoundary[1].replace(/^"|"$/g, '');

  const chunks = [];
  let totalSize = 0;
  const MAX_TOTAL = ARQ_DOC_MAX_BYTES + 64 * 1024; // file + overhead multipart

  req.on('data', c => {
    totalSize += c.length;
    if (totalSize > MAX_TOTAL) {
      req.destroy();
      sendError(res, 413, `Arquivo muito grande (máximo ${Math.floor(ARQ_DOC_MAX_BYTES / 1024 / 1024)} MB)`);
    } else {
      chunks.push(c);
    }
  });

  req.on('end', async () => {
    try {
      const body = Buffer.concat(chunks);
      const parts = parseMultipart(body, boundary);
      const arq = parts.find(p => p.filename && p.data && p.data.length > 0);
      if (!arq) return sendError(res, 400, 'Nenhum arquivo enviado');
      // FIX C-02: bypass — sem '!arq.contentType', omitir o Content-Type no
      // multipart pulava o check inteiro e permitia subir HTML/SVG com script.
      if (!arq.contentType || !ARQ_DOC_ALLOWED_TYPES.includes(arq.contentType)) {
        return sendError(res, 400, `Tipo não permitido. Use: PDF, JPG ou PNG`);
      }
      if (arq.data.length > ARQ_DOC_MAX_BYTES) {
        return sendError(res, 413, `Arquivo excede ${Math.floor(ARQ_DOC_MAX_BYTES / 1024 / 1024)} MB`);
      }

      const rec = await repos.recursos.findById(recursoId);
      if (!rec) return sendError(res, 404, 'Recurso não encontrado');
      const docs = rec.documentos || [];
      const docIdx = docs.findIndex(d => d.id === docId);
      if (docIdx === -1) return sendError(res, 404, 'Documento não encontrado');
      const doc = docs[docIdx];

      // Renomeia: AAAA_MM_DD_Tipo_Nome.ext
      const filename = _buildArquivoFilename({
        nomeRecurso: rec.nome,
        tipoDoc: doc.tipoLabel || doc.tipo || 'Documento',
        filenameOriginal: arq.filename,
      });

      // Apaga arquivo anterior do mesmo doc (se existir) — substitui
      await db.query('DELETE FROM recurso_doc_arquivos WHERE recurso_id = $1 AND doc_id = $2', [recursoId, docId]);

      const arqId = generateId('arq');
      await db.query(
        `INSERT INTO recurso_doc_arquivos
         (id, recurso_id, doc_id, filename, filename_original, mime_type, size_bytes, data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        // data cifrado em repouso (LGPD); size_bytes guarda o tamanho original.
        [arqId, recursoId, docId, filename, arq.filename || null, arq.contentType || 'application/octet-stream', arq.data.length, piiCrypto.encryptBuffer(arq.data)]
      );

      // Atualiza JSONB do doc com referência ao arquivo (sem o BYTEA)
      docs[docIdx] = {
        ...doc,
        arquivo: {
          id: arqId,
          filename,
          filenameOriginal: arq.filename || null,
          mimeType: arq.contentType || 'application/octet-stream',
          sizeBytes: arq.data.length,
          uploadedAt: new Date().toISOString(),
        },
        nomeArquivo: filename, // mantém compat com campo legado
        updatedAt: new Date().toISOString(),
      };
      await repos.recursos.updateById(recursoId, {
        documentos: JSON.stringify(docs),
        updatedAt: new Date().toISOString(),
      });

      sendJson(res, { ok: true, arquivo: docs[docIdx].arquivo });

      // Trigger validação em background se houver template associado.
      // Não bloqueia a resposta — o frontend faz refresh e pega o validacao.
      if (docs[docIdx].templateId) {
        setImmediate(() => _validarDocBackground(recursoId, docId));
      }
    } catch (e) {
      sendError(res, 400, e.message);
    }
  });
}

async function handleGetRecursoDocArquivo(recursoId, docId, res) {
  try {
    const row = await db.getOne(
      `SELECT filename, mime_type, data FROM recurso_doc_arquivos
       WHERE recurso_id = $1 AND doc_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [recursoId, docId]
    );
    if (!row) return sendError(res, 404, 'Arquivo não encontrado');
    const fileData = piiCrypto.decryptBuffer(row.data); // decifra o arquivo em repouso (LGPD)
    res.writeHead(200, {
      'Content-Type': row.mimeType || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${encodeURIComponent(row.filename)}"`,
      'Content-Length': fileData.length,
      'Cache-Control': 'private, max-age=300',
    });
    res.end(fileData);
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handleDeleteRecursoDocArquivo(recursoId, docId, res) {
  try {
    const rec = await repos.recursos.findById(recursoId);
    if (!rec) return sendError(res, 404, 'Recurso não encontrado');
    await db.query('DELETE FROM recurso_doc_arquivos WHERE recurso_id = $1 AND doc_id = $2', [recursoId, docId]);
    // Remove referência do JSONB do doc
    const docs = rec.documentos || [];
    const dIdx = docs.findIndex(d => d.id === docId);
    if (dIdx !== -1) {
      const { arquivo, nomeArquivo, ...rest } = docs[dIdx];
      docs[dIdx] = { ...rest, updatedAt: new Date().toISOString() };
      await repos.recursos.updateById(recursoId, {
        documentos: JSON.stringify(docs),
        updatedAt: new Date().toISOString(),
      });
    }
    sendJson(res, { ok: true });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

module.exports = {
  handlePostRecursoDocArquivo, handleGetRecursoDocArquivo,
  handleDeleteRecursoDocArquivo, handleValidarDocumento,
};
