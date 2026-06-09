'use strict';
/**
 * @file Handlers do subsistema de Recrutamento (US-05 a US-09).
 *
 * Fluxo:
 *  1. Encarregado cria solicitação com 1+ vagas (cargo + qtd).
 *  2. RH adiciona candidatos a cada vaga. Triagem: contatado → interessado.
 *  3. Antecedentes (pendente → ok / reprovado). Reprovado encerra candidato.
 *  4. Coleta de 4 documentos: rg, cpf, residencia, ctps. Só com OK em todos.
 *  5. Aprovação: cria recurso em `recursos` (status funcionario), copia docs,
 *     marca candidato como aprovado, incrementa vaga.qtd_preenchida e fecha
 *     solicitação quando todas as vagas atingirem qtd_total.
 *
 * Notificações in-app: ao criar solicitação (US-05), RH é notificado.
 */
const repos = require('../db/repos');
const db = require('../db');
const { sendJson, sendError } = require('../lib/http-respond');
const { generateId } = require('../lib/id');
const { podeAprovar } = require('../lib/recrutamento-docs');
const candidatoDocs = require('./candidato-documentos'); // tiposComArquivo (sem ciclo: não requer este módulo)

const STATUS_CANDIDATO_VALIDOS = [
  'contatado', 'interessado', 'sem_interesse',
  'reprovado_antecedentes', 'aprovado',
];
const ANTECEDENTES_VALIDOS = ['pendente', 'ok', 'reprovado'];
const DOC_TIPOS = ['rg', 'cpf', 'residencia', 'ctps', 'antecedentes'];

// ─── Notificações ──────────────────────────────────────────────────
async function notificarRh(tipo, titulo, mensagem, link, metadata) {
  try {
    await repos.notificacoes.create({
      id: generateId('not'),
      destinatario: 'rh',
      tipo,
      titulo,
      mensagem: mensagem ?? null,
      link: link ?? null,
      metadata: metadata ?? {},
    });
  } catch (e) {
    // Falha em notificar não bloqueia o fluxo principal — só loga.
    console.warn('[recrutamento] notificarRh falhou:', e?.message || e);
  }
}

// ─── Solicitações ──────────────────────────────────────────────────
async function listarSolicitacoes(req, res) {
  try {
    const { status } = req.query || {};
    const filtros = status ? { status } : {};
    const solicitacoes = await repos.solicitacoesContratacao.findAll(filtros);
    // Anexa as vagas de cada solicitação (lista pequena, JOIN simples ok).
    const ids = solicitacoes.map((s) => s.id);
    const vagas = ids.length
      ? await db.getMany(
          `SELECT * FROM vagas WHERE solicitacao_id = ANY($1::text[])`,
          [ids],
        )
      : [];
    const byId = new Map();
    for (const v of vagas) {
      const arr = byId.get(v.solicitacaoId) || [];
      arr.push(v);
      byId.set(v.solicitacaoId, arr);
    }
    const enriquecidas = solicitacoes.map((s) => ({
      ...s,
      vagas: byId.get(s.id) || [],
    }));
    sendJson(res, { solicitacoes: enriquecidas });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function obterSolicitacao(req, res, id) {
  try {
    const sol = await repos.solicitacoesContratacao.findById(id);
    if (!sol) return sendError(res, 404, 'Solicitação não encontrada');
    const vagas = await repos.vagas.findAll({ solicitacaoId: id });
    const vagaIds = vagas.map((v) => v.id);
    const candidatos = vagaIds.length
      ? await db.getMany(
          `SELECT * FROM candidatos WHERE vaga_id = ANY($1::text[]) ORDER BY created_at DESC`,
          [vagaIds],
        )
      : [];
    const candidatosByVaga = new Map();
    for (const c of candidatos) {
      const arr = candidatosByVaga.get(c.vagaId) || [];
      arr.push(c);
      candidatosByVaga.set(c.vagaId, arr);
    }
    sendJson(res, {
      solicitacao: {
        ...sol,
        vagas: vagas.map((v) => ({
          ...v,
          candidatos: candidatosByVaga.get(v.id) || [],
        })),
      },
    });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

/**
 * US-05: Encarregado cria solicitação com 1+ vagas (cargo + qtd_total).
 */
async function criarSolicitacao(req, body, res) {
  try {
    const user = req.user;
    if (!user) return sendError(res, 401, 'Não autenticado');
    const vagas = Array.isArray(body.vagas) ? body.vagas : [];
    if (vagas.length === 0)
      return sendError(res, 400, 'Informe ao menos uma vaga (cargo + qtd_total).');
    for (const v of vagas) {
      if (!v.cargo || !String(v.cargo).trim())
        return sendError(res, 400, 'Cada vaga precisa de cargo.');
      const qtd = Number(v.qtdTotal ?? v.qtd_total);
      if (!Number.isInteger(qtd) || qtd <= 0)
        return sendError(res, 400, `Qtd inválida pra cargo "${v.cargo}".`);
    }

    const sol = await repos.solicitacoesContratacao.create({
      id: generateId('sol'),
      contractId: body.contractId || null,
      solicitanteId: user.id,
      solicitanteNome: user.name || user.email,
      status: 'aberta',
      observacoes: body.observacoes || null,
      dataDesejadaObra: body.dataDesejadaObra || null,
    });
    const vagasCriadas = [];
    for (const v of vagas) {
      const novaVaga = await repos.vagas.create({
        id: generateId('vag'),
        solicitacaoId: sol.id,
        cargo: String(v.cargo).trim(),
        qtdTotal: Number(v.qtdTotal ?? v.qtd_total),
        qtdPreenchida: 0,
      });
      vagasCriadas.push(novaVaga);
    }

    // US-05 (notificação RH).
    await notificarRh(
      'recrutamento.nova_solicitacao',
      `Nova solicitação de contratação de ${sol.solicitanteNome}`,
      vagasCriadas
        .map((v) => `${v.qtdTotal}× ${v.cargo}`)
        .join(', '),
      `/recrutamento?solicitacao=${sol.id}`,
      { solicitacaoId: sol.id },
    );

    sendJson(res, { solicitacao: { ...sol, vagas: vagasCriadas } });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function cancelarSolicitacao(req, res, id) {
  try {
    const updated = await repos.solicitacoesContratacao.updateById(id, {
      status: 'cancelada',
      closedAt: new Date().toISOString(),
    });
    if (!updated) return sendError(res, 404, 'Solicitação não encontrada');
    sendJson(res, { solicitacao: updated });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

// ─── Candidatos ────────────────────────────────────────────────────

/** US-06: RH vincula candidato à vaga. */
async function adicionarCandidato(req, body, res, vagaId) {
  try {
    const vaga = await repos.vagas.findById(vagaId);
    if (!vaga) return sendError(res, 404, 'Vaga não encontrada');
    if (!body.nome || !String(body.nome).trim())
      return sendError(res, 400, 'Nome do candidato é obrigatório.');

    const status = body.status && STATUS_CANDIDATO_VALIDOS.includes(body.status)
      ? body.status
      : 'contatado';

    const cand = await repos.candidatos.create({
      id: generateId('cnd'),
      vagaId,
      nome: String(body.nome).trim(),
      cpf: body.cpf || null,
      telefone: body.telefone || null,
      email: body.email || null,
      status,
      antecedentesStatus: 'pendente',
      documentos: {},
      observacoes: body.observacoes || null,
    });
    sendJson(res, { candidato: cand });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

/** US-06: RH atualiza triagem (status do candidato). */
async function atualizarTriagem(req, body, res, candidatoId) {
  try {
    const cand = await repos.candidatos.findById(candidatoId);
    if (!cand) return sendError(res, 404, 'Candidato não encontrado');
    const novoStatus = body.status;
    if (!STATUS_CANDIDATO_VALIDOS.includes(novoStatus))
      return sendError(res, 400, `Status inválido: ${novoStatus}`);

    // Validação de transição: aprovado/reprovado_antecedentes são estados terminais.
    if (cand.status === 'aprovado')
      return sendError(res, 400, 'Candidato já aprovado.');

    const updated = await repos.candidatos.updateById(candidatoId, {
      status: novoStatus,
      observacoes: body.observacoes ?? cand.observacoes,
    });
    sendJson(res, { candidato: updated });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

/** US-07: RH registra resultado dos antecedentes criminais. */
async function atualizarAntecedentes(req, body, res, candidatoId) {
  try {
    const cand = await repos.candidatos.findById(candidatoId);
    if (!cand) return sendError(res, 404, 'Candidato não encontrado');

    if (cand.status !== 'interessado' && cand.antecedentesStatus === 'pendente')
      return sendError(
        res,
        400,
        'Antecedentes só podem ser registrados após o candidato confirmar interesse.',
      );

    const resultado = body.resultado;
    if (!ANTECEDENTES_VALIDOS.includes(resultado))
      return sendError(res, 400, `Resultado inválido: ${resultado}`);

    // Anexa o doc de antecedentes se vier no body
    const updates = { antecedentesStatus: resultado };
    if (body.documento) {
      updates.documentos = { ...(cand.documentos || {}), antecedentes: body.documento };
    }
    // Reprovado encerra o candidato.
    if (resultado === 'reprovado') {
      updates.status = 'reprovado_antecedentes';
    }

    const updated = await repos.candidatos.updateById(candidatoId, updates);
    sendJson(res, { candidato: updated });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

/** US-08: Anexa um documento ao candidato (rg/cpf/residencia/ctps/antecedentes). */
async function anexarDocumento(req, body, res, candidatoId, tipo) {
  try {
    if (!DOC_TIPOS.includes(tipo))
      return sendError(res, 400, `Tipo inválido: ${tipo}. Use: ${DOC_TIPOS.join(', ')}`);
    const cand = await repos.candidatos.findById(candidatoId);
    if (!cand) return sendError(res, 404, 'Candidato não encontrado');
    if (cand.antecedentesStatus !== 'ok' && tipo !== 'antecedentes')
      return sendError(
        res,
        400,
        'Documentos só podem ser anexados após aprovação dos antecedentes.',
      );
    if (!body.filename || !body.storagePath)
      return sendError(res, 400, 'documento.filename e documento.storagePath são obrigatórios');
    const docs = { ...(cand.documentos || {}) };
    docs[tipo] = {
      filename: body.filename,
      storagePath: body.storagePath,
      mimeType: body.mimeType || null,
      size: body.size || null,
      uploadedAt: new Date().toISOString(),
    };
    const updated = await repos.candidatos.updateById(candidatoId, {
      documentos: docs,
    });
    sendJson(res, { candidato: updated });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

/** US-09: Aprovação final — cria recurso em `recursos` + decrementa vaga + fecha solicitação. */
async function aprovarCandidato(req, body, res, candidatoId) {
  try {
    const cand = await repos.candidatos.findById(candidatoId);
    if (!cand) return sendError(res, 404, 'Candidato não encontrado');

    // Gate (regra pura, testada): antecedentes OK + os 4 docs obrigatórios com
    // ARQUIVO de fato armazenado (não só metadado fantasma no JSONB).
    const tiposArmazenados = await candidatoDocs.tiposComArquivo(candidatoId);
    const veredito = podeAprovar(cand, tiposArmazenados);
    if (!veredito.ok) return sendError(res, 400, veredito.motivo);

    const vaga = await repos.vagas.findById(cand.vagaId);
    if (!vaga) return sendError(res, 404, 'Vaga não encontrada');
    if (vaga.qtdPreenchida >= vaga.qtdTotal)
      return sendError(res, 400, 'Vaga já está totalmente preenchida.');

    // Lê os arquivos (BYTEA já cifrado) do candidato p/ copiar pro recurso.
    const arquivos = await db.getMany(
      `SELECT id, tipo, filename, filename_original, mime_type, size_bytes, data
         FROM candidato_doc_arquivos WHERE candidato_id = $1`,
      [candidatoId],
    );
    const arqByTipo = new Map(arquivos.map((a) => [a.tipo, a]));
    const docsJsonb = cand.documentos || {};

    // Monta os documentos do recurso (cada um com docId próprio + ref ao arquivo)
    // e a lista de cópias de BYTEA a inserir depois que o recurso existir.
    const ORDEM_DOCS = ['rg', 'cpf', 'residencia', 'ctps', 'antecedentes'];
    const recursoDocs = [];
    const copias = [];
    for (const tipo of ORDEM_DOCS) {
      const a = arqByTipo.get(tipo);
      if (!a) continue;
      const docId = generateId('doc');
      const arqId = generateId('arq');
      recursoDocs.push({
        id: docId,
        tipo: tipo.toUpperCase(),
        tipoLabel: tipo.toUpperCase(),
        arquivo: {
          id: arqId,
          filename: a.filename,
          filenameOriginal: a.filenameOriginal || null,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          uploadedAt: docsJsonb[tipo]?.uploadedAt || new Date().toISOString(),
        },
        nomeArquivo: a.filename,
      });
      copias.push({ docId, arqId, a });
    }

    // Cria o recurso (funcionário) — função vem da vaga (US-09 question #7).
    const recurso = await repos.recursos.create({
      id: generateId('rec'),
      nome: cand.nome,
      cpf: cand.cpf || null,
      telefone: cand.telefone || null,
      email: cand.email || null,
      profissao: vaga.cargo,
      status: 'funcionario',
      // JSONB exige string (pg serializa array JS como array Postgres, não JSON).
      documentos: JSON.stringify(recursoDocs),
    });

    // Copia os BYTEA p/ recurso_doc_arquivos (keyed por recurso_id + doc_id).
    // O buffer já está cifrado em repouso — copia-se como está (mesma chave LGPD).
    for (const { docId, arqId, a } of copias) {
      await db.query(
        `INSERT INTO recurso_doc_arquivos
         (id, recurso_id, doc_id, filename, filename_original, mime_type, size_bytes, data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [arqId, recurso.id, docId, a.filename, a.filenameOriginal || null, a.mimeType, a.sizeBytes, a.data],
      );
    }

    // Marca candidato como aprovado + linka recurso
    await repos.candidatos.updateById(candidatoId, {
      status: 'aprovado',
      recursoId: recurso.id,
    });

    // Incrementa vaga.qtd_preenchida
    const novaQtd = vaga.qtdPreenchida + 1;
    await repos.vagas.updateById(vaga.id, { qtdPreenchida: novaQtd });

    // Verifica se a solicitação pode ser fechada (todas as vagas atingiram total)
    const todasVagas = await repos.vagas.findAll({ solicitacaoId: vaga.solicitacaoId });
    const todasPreenchidas = todasVagas.every(
      (v) => (v.id === vaga.id ? novaQtd : v.qtdPreenchida) >= v.qtdTotal,
    );
    if (todasPreenchidas) {
      await repos.solicitacoesContratacao.updateById(vaga.solicitacaoId, {
        status: 'preenchida',
        closedAt: new Date().toISOString(),
      });
    }

    sendJson(res, { candidato: { ...cand, status: 'aprovado', recursoId: recurso.id }, recurso });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

// ─── Notificações in-app ───────────────────────────────────────────
async function listarNotificacoes(req, res) {
  try {
    const user = req.user;
    if (!user) return sendError(res, 401, 'Não autenticado');
    // Por enquanto: traz tudo destinado a 'rh' ou ao próprio usuário.
    // (Ampliar pra perfil/role quando F4-5b CommandPalette evoluir.)
    const rows = await db.getMany(
      `SELECT * FROM notificacoes
        WHERE destinatario IN ('rh', 'todos', $1)
        ORDER BY created_at DESC LIMIT 100`,
      [user.id],
    );
    sendJson(res, { notificacoes: rows });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function marcarLida(req, res, id) {
  try {
    const updated = await repos.notificacoes.updateById(id, {
      lida: true,
      readAt: new Date().toISOString(),
    });
    if (!updated) return sendError(res, 404, 'Notificação não encontrada');
    sendJson(res, { notificacao: updated });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

module.exports = {
  listarSolicitacoes,
  obterSolicitacao,
  criarSolicitacao,
  cancelarSolicitacao,
  adicionarCandidato,
  atualizarTriagem,
  atualizarAntecedentes,
  anexarDocumento,
  aprovarCandidato,
  listarNotificacoes,
  marcarLida,
};
