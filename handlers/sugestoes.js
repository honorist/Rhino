'use strict';
/**
 * @file Canal de Sugestões dos Colaboradores (RaiaPro História 2).
 *
 * Qualquer usuário autenticado cria sugestões. Gerentes (super admin ou perfil
 * com 'edit:#/sugestoes') movem o status — pendente → em_analise → aprovada →
 * descartada — com comentário; descarte exige justificativa. As aprovadas formam
 * um backlog público interno. Anexo (1 foto) opcional em BYTEA (via lib/multipart).
 *
 * Notificações in-app (repos.notificacoes): gestores ao criar; autor ao mudar
 * status. Falha de notificação nunca bloqueia o fluxo principal (try/catch).
 */
const db = require('../db');
const repos = require('../db/repos');
const perms = require('../lib/permissions');
const { sendJson, sendError } = require('../lib/http-respond');
const { generateId } = require('../lib/id');
const { parseMultipart, isAllowedImageMagic, IMAGE_MIMES } = require('../lib/multipart');

const STATUS_VALIDOS = ['pendente', 'em_analise', 'aprovada', 'descartada'];
const STATUS_LABEL = { pendente: 'Pendente', em_analise: 'Em análise', aprovada: 'Aprovada', descartada: 'Descartada' };
const ANEXO_MAX_BYTES = 8 * 1024 * 1024;

/** Gerente = super admin OU perfil com 'edit:#/sugestoes'. */
function _podeGerir(user) {
  return perms.can(user, 'sugestoes', 'edit');
}

/** Notifica todos os gestores (super admin + perfis com edit:#/sugestoes) por user_id. */
async function _notificarGestores(tipo, titulo, mensagem, metadata) {
  try {
    const gestores = await db.getMany(`
      SELECT u.id FROM users u
      LEFT JOIN niveis_acesso n ON n.id = u.nivel_acesso_id
      WHERE u.nivel_acesso_id IS NULL
         OR u.nivel_acesso_id = 'admin'
         OR n.abas @> '["edit:#/sugestoes"]'::jsonb
    `);
    for (const g of gestores) {
      await repos.notificacoes.create({
        id: generateId('not'), destinatario: g.id, tipo, titulo,
        mensagem: mensagem ?? null, link: '#/sugestoes', metadata: metadata ?? {},
      });
    }
  } catch (e) {
    console.warn('[sugestoes] notificarGestores falhou:', e?.message || e);
  }
}

/** Notifica o autor de uma sugestão (destinatario = user_id). */
async function _notificarAutor(autorId, tipo, titulo, mensagem, metadata) {
  if (!autorId) return;
  try {
    await repos.notificacoes.create({
      id: generateId('not'), destinatario: autorId, tipo, titulo,
      mensagem: mensagem ?? null, link: '#/sugestoes', metadata: metadata ?? {},
    });
  } catch (e) {
    console.warn('[sugestoes] notificarAutor falhou:', e?.message || e);
  }
}

// ─── Criar (qualquer usuário autenticado) ───
async function criar(req, body, res) {
  try {
    if (!req.user) return sendError(res, 401, 'Não autenticado');
    const titulo = String(body.titulo || '').trim();
    const descricao = String(body.descricao || '').trim();
    if (!titulo) return sendError(res, 400, 'Título é obrigatório');
    if (!descricao) return sendError(res, 400, 'Descrição é obrigatória');

    const now = new Date().toISOString();
    const id = generateId('sug');
    const autorNome = req.user.name || req.user.email || 'Usuário';
    await repos.sugestoes.create({
      id,
      autorId: req.user.id,
      autorNome,
      titulo,
      descricao,
      area: body.area ? String(body.area).trim() : null,
      status: 'pendente',
      historico: JSON.stringify([{ de: null, para: 'pendente', por: req.user.id, porNome: autorNome, comentario: null, em: now }]),
      createdAt: now,
      updatedAt: now,
    });
    _notificarGestores('sugestao.nova', 'Nova sugestão', `${autorNome}: ${titulo}`, { sugestaoId: id });
    sendJson(res, { ok: true, id });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// ─── Listar (role-aware): gerente vê todas; demais veem as próprias + backlog aprovado ───
async function listar(req, res) {
  try {
    if (!req.user) return sendError(res, 401, 'Não autenticado');
    const podeGerir = await _podeGerir(req.user);
    const statusFiltro = req.query?.status;
    let sugestoes;
    if (podeGerir) {
      sugestoes = statusFiltro && STATUS_VALIDOS.includes(statusFiltro)
        ? await repos.sugestoes.findAll({ status: statusFiltro })
        : await repos.sugestoes.findAll();
    } else {
      sugestoes = await db.getMany(
        `SELECT * FROM sugestoes WHERE autor_id = $1 OR status = 'aprovada' ORDER BY created_at DESC LIMIT 500`,
        [req.user.id]
      );
    }
    sendJson(res, { sugestoes, podeGerir });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

// ─── Mudar status (apenas gerente) ───
async function mudarStatus(req, body, res, id) {
  try {
    if (!req.user) return sendError(res, 401, 'Não autenticado');
    if (!(await _podeGerir(req.user))) return sendError(res, 403, 'Apenas gerentes podem alterar o status de sugestões');

    const novo = String(body.status || '').trim();
    if (!STATUS_VALIDOS.includes(novo)) return sendError(res, 400, 'Status inválido');

    const sug = await repos.sugestoes.findById(id);
    if (!sug) return sendError(res, 404, 'Sugestão não encontrada');

    const comentario = body.comentario ? String(body.comentario).trim() : '';
    const justificativa = body.justificativa ? String(body.justificativa).trim() : '';
    if (novo === 'descartada' && !justificativa) {
      return sendError(res, 400, 'Justificativa é obrigatória para descartar uma sugestão');
    }

    const now = new Date().toISOString();
    const gestorNome = req.user.name || req.user.email || 'Gestor';
    const historico = Array.isArray(sug.historico) ? sug.historico.slice() : [];
    historico.push({
      de: sug.status, para: novo, por: req.user.id, porNome: gestorNome,
      comentario: comentario || (novo === 'descartada' ? justificativa : null), em: now,
    });

    await repos.sugestoes.updateById(id, {
      status: novo,
      comentarioGestor: comentario || null,
      justificativaDescarte: novo === 'descartada' ? justificativa : (sug.justificativaDescarte || null),
      gestorId: req.user.id,
      historico: JSON.stringify(historico),
      updatedAt: now,
    });

    _notificarAutor(
      sug.autorId, 'sugestao.status',
      `Sua sugestão "${sug.titulo}" agora está: ${STATUS_LABEL[novo]}`,
      comentario || justificativa || null,
      { sugestaoId: id, status: novo }
    );

    sendJson(res, { ok: true });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// ─── Excluir (apenas gerente) ───
async function excluir(req, res, id) {
  try {
    if (!req.user) return sendError(res, 401, 'Não autenticado');
    if (!(await _podeGerir(req.user))) return sendError(res, 403, 'Apenas gerentes podem excluir sugestões');
    const sug = await repos.sugestoes.findById(id);
    if (!sug) return sendError(res, 404, 'Sugestão não encontrada');
    await repos.sugestoes.removeById(id); // anexo sai junto (FK ON DELETE CASCADE)
    sendJson(res, { ok: true });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// ─── Anexo (1 foto opcional) — upload multipart, despachado no createServer ───
function uploadAnexo(sugestaoId, req, res) {
  const contentType = req.headers['content-type'] || '';
  const m = contentType.match(/boundary=(.+)$/);
  if (!m) return sendError(res, 400, 'Content-Type multipart esperado');
  const boundary = m[1].replace(/^"|"$/g, '');
  const chunks = [];
  let total = 0;
  req.on('data', (c) => {
    total += c.length;
    if (total > ANEXO_MAX_BYTES + 64 * 1024) { req.destroy(); sendError(res, 413, 'Imagem muito grande (máx 8 MB)'); }
    else chunks.push(c);
  });
  req.on('end', async () => {
    try {
      const sug = await repos.sugestoes.findById(sugestaoId);
      if (!sug) return sendError(res, 404, 'Sugestão não encontrada');
      const parts = parseMultipart(Buffer.concat(chunks), boundary);
      const arq = parts.find((p) => p.filename && p.data && p.data.length > 0);
      if (!arq) return sendError(res, 400, 'Nenhuma imagem enviada');
      if (!arq.contentType || !IMAGE_MIMES.includes(arq.contentType)) return sendError(res, 400, 'Tipo não permitido (use JPG, PNG ou WEBP)');
      if (!isAllowedImageMagic(arq.data)) return sendError(res, 400, 'Arquivo não é uma imagem válida');
      if (arq.data.length > ANEXO_MAX_BYTES) return sendError(res, 413, 'Imagem excede 8 MB');

      // 1 foto por sugestão — substitui a anterior.
      await db.query('DELETE FROM sugestao_anexos WHERE sugestao_id = $1', [sugestaoId]);
      await db.query(
        `INSERT INTO sugestao_anexos (id, sugestao_id, nome, data, mime_type, size_bytes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [generateId('sga'), sugestaoId, arq.filename || 'foto', arq.data, arq.contentType, arq.data.length]
      );
      await repos.sugestoes.updateById(sugestaoId, { temAnexo: true, updatedAt: new Date().toISOString() });
      sendJson(res, { ok: true });
    } catch (e) {
      sendError(res, 400, e.message);
    }
  });
}

async function getAnexo(sugestaoId, res) {
  try {
    const row = await db.getOne(
      `SELECT nome, mime_type, data FROM sugestao_anexos WHERE sugestao_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [sugestaoId]
    );
    if (!row) return sendError(res, 404, 'Sem anexo');
    res.writeHead(200, {
      'Content-Type': row.mimeType || 'application/octet-stream',
      'Content-Length': row.data.length,
      'Cache-Control': 'private, max-age=300',
    });
    res.end(row.data);
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

module.exports = { criar, listar, mudarStatus, excluir, uploadAnexo, getAnexo };
