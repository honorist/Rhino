/**
 * @file Repositório de `propostas` — Propostas Comerciais Rhino.
 *
 * Estende CRUD com:
 * - `proximoNumero(ano)`: gera próximo número sequencial PC_NN dentro do ano.
 * - `findAllWithChildren`: junta custos + anexos numa única chamada (1+2 queries paralelas).
 * - `findByIdWithChildren`: single proposta + custos + anexos (sem o `data` binário).
 * - `getEnvelope`: shape `{ propostas }` consumido pelo frontend.
 * - `createWithContract`: TRANSAÇÃO — cria proposta + contrato em prospecção (vínculo metadata).
 * - `aceitar`: TRANSAÇÃO — proposta `aceita` + contrato vinculado `ativo`.
 * - `duplicarNovaRevisao`: copia proposta como nova revisão (revisao+1).
 */
const db = require('../index');
const { createRepo } = require('./_factory');
const crypto = require('crypto');

const base = createRepo('propostas', { orderBy: 'ano DESC, numero DESC, revisao DESC' });

function generateId(prefix) {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(4).toString('hex');
  return `${prefix}_${timestamp}${random}`;
}

/**
 * Gera o próximo número sequencial PC_NN dentro do ano informado.
 * Padding 2 dígitos. Considera todas as revisões (mesmo numero conta como já usado).
 *
 * @param {number} ano  Ano com 2 dígitos (ex: 26 para 2026)
 * @returns {Promise<string>}  Número padded ("08", "12", ...)
 */
async function proximoNumero(ano) {
  const row = await db.getOne(
    `SELECT COALESCE(MAX(CAST(numero AS INTEGER)), 0) + 1 AS prox
       FROM propostas
      WHERE ano = $1`,
    [ano]
  );
  const n = row ? row.prox : 1;
  return String(n).padStart(2, '0');
}

/**
 * Lista todas as propostas com custos e anexos (metadata sem `data` binário).
 * 1 query master + 2 paralelas (custos, anexos-meta) + join in-memory via Map.
 *
 * @returns {Promise<object[]>}
 */
async function findAllWithChildren() {
  const propostas = await db.getMany(
    `SELECT * FROM propostas ORDER BY ano DESC, CAST(numero AS INTEGER) DESC, revisao DESC`
  );
  if (!propostas.length) return [];

  const ids = propostas.map((p) => p.id);
  const ph = ids.map((_, i) => `$${i + 1}`).join(', ');

  const [custos, anexos] = await Promise.all([
    db.getMany(
      `SELECT * FROM proposta_custos WHERE proposta_id IN (${ph}) ORDER BY ordem ASC, created_at ASC`,
      ids
    ),
    db.getMany(
      `SELECT id, proposta_id, tipo, nome, mime_type, size_bytes, legenda, secao, ordem, created_at
         FROM proposta_anexos
        WHERE proposta_id IN (${ph})
        ORDER BY secao, ordem ASC, created_at ASC`,
      ids
    ),
  ]);

  const custosByProp = new Map();
  const anexosByProp = new Map();
  for (const c of custos) {
    if (!custosByProp.has(c.propostaId)) custosByProp.set(c.propostaId, []);
    custosByProp.get(c.propostaId).push(c);
  }
  for (const a of anexos) {
    if (!anexosByProp.has(a.propostaId)) anexosByProp.set(a.propostaId, []);
    anexosByProp.get(a.propostaId).push(a);
  }

  return propostas.map((p) => ({
    ...p,
    custos: custosByProp.get(p.id) || [],
    anexos: anexosByProp.get(p.id) || [],
  }));
}

/**
 * Single proposta com filhos (sem binário dos anexos).
 *
 * @param {string} id
 * @returns {Promise<object | null>}
 */
async function findByIdWithChildren(id) {
  const proposta = await db.getOne(`SELECT * FROM propostas WHERE id = $1`, [id]);
  if (!proposta) return null;
  const [custos, anexos] = await Promise.all([
    db.getMany(
      `SELECT * FROM proposta_custos WHERE proposta_id = $1 ORDER BY ordem ASC, created_at ASC`,
      [id]
    ),
    db.getMany(
      `SELECT id, proposta_id, tipo, nome, mime_type, size_bytes, legenda, secao, ordem, created_at
         FROM proposta_anexos
        WHERE proposta_id = $1
        ORDER BY secao, ordem ASC, created_at ASC`,
      [id]
    ),
  ]);
  return { ...proposta, custos, anexos };
}

/**
 * Envelope no shape `{ propostas }` (consumido pelo frontend via Store).
 *
 * @returns {Promise<{ propostas: object[] }>}
 */
async function getEnvelope() {
  const propostas = await findAllWithChildren();
  return { propostas };
}

/**
 * TRANSAÇÃO — cria proposta e o contrato em prospecção vinculado.
 *
 * Fluxo:
 *  1. Gera número sequencial PC_NN-AA dentro da transação (lock via FOR UPDATE
 *     na linha "última do ano" se existir — evita race em criações concorrentes).
 *  2. Insere proposta com status='rascunho'.
 *  3. Insere contrato com status='prospeccao' (forçado).
 *  4. Atualiza proposta.contrato_id apontando para o contrato criado.
 *  5. metadata do contrato registra { propostaId, propostaNumero, propostaRevisao }.
 *
 * @param {object} propostaData
 * @returns {Promise<{ proposta: object, contract: object }>}
 */
async function createWithContract(propostaData) {
  return db.withTransaction(async (client) => {
    const anoAtual = new Date().getFullYear() % 100;
    const ano = propostaData.ano || anoAtual;

    // Lock + cálculo de próximo número dentro da transação
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('propostas_numero_' || $1))`, [ano]);
    const rowMax = await client.query(
      `SELECT COALESCE(MAX(CAST(numero AS INTEGER)), 0) + 1 AS prox
         FROM propostas WHERE ano = $1`,
      [ano]
    );
    const proxN = (rowMax.rows[0] && rowMax.rows[0].prox) || 1;
    const numero = String(proxN).padStart(2, '0');

    const propostaId = generateId('prop');
    const contractId = generateId('ctr');

    // ── 1. Inserir proposta ──
    const propostaInsert = {
      id: propostaId,
      numero,
      ano,
      revisao: 0,
      proposta_pai_id: null,
      tipo: propostaData.tipo || 'ambos',
      cliente_id: propostaData.clienteId || null,
      cliente_nome: propostaData.clienteNome || null,
      cliente_empresa: propostaData.clienteEmpresa || null,
      cliente_contato: propostaData.clienteContato || null,
      cliente_cargo: propostaData.clienteCargo || null,
      cliente_email: propostaData.clienteEmail || null,
      cliente_telefone: propostaData.clienteTelefone || null,
      cliente_documento: propostaData.clienteDocumento || null,
      cliente_endereco: propostaData.clienteEndereco || null,
      referencia: propostaData.referencia || null,
      titulo: propostaData.titulo,
      objetivo: propostaData.objetivo || null,
      saudacao: propostaData.saudacao || null,
      escopo: JSON.stringify(propostaData.escopo || []),
      obrigacoes_contratada: JSON.stringify(propostaData.obrigacoesContratada || []),
      obrigacoes_contratante: JSON.stringify(propostaData.obrigacoesContratante || []),
      cronograma: JSON.stringify(propostaData.cronograma || cronogramaDefault()),
      investimento_hh: JSON.stringify(propostaData.investimentoHh || []),
      investimento_mat: JSON.stringify(propostaData.investimentoMat || []),
      valor_total: parseFloat(propostaData.valorTotal) || 0,
      condicoes_pagamento: propostaData.condicoesPagamento || condicoesPagamentoDefault(),
      prazo_execucao: propostaData.prazoExecucao || null,
      validade_dias: parseInt(propostaData.validadeDias, 10) || 15,
      garantia_meses: propostaData.garantiaMeses != null ? parseInt(propostaData.garantiaMeses, 10) : null,
      observacoes: propostaData.observacoes || null,
      signatario: propostaData.signatario || 'Deyvison Veloso',
      signatario_cargo: propostaData.signatarioCargo || 'Diretor',
      status: 'rascunho',
      metadata: JSON.stringify(propostaData.metadata || {}),
    };

    const propCols = Object.keys(propostaInsert);
    const propPh = propCols.map((_, i) => `$${i + 1}`);
    const propVals = propCols.map((k) => propostaInsert[k]);
    const propSql = `INSERT INTO propostas ("${propCols.join('","')}") VALUES (${propPh.join(',')}) RETURNING *`;
    const propRes = await client.query(propSql, propVals);
    const proposta = db.rowToCamel(propRes.rows[0]);

    // ── 2. Inserir contrato em prospecção ──
    const contractInsert = {
      id: contractId,
      name: propostaData.titulo,
      contract_number: `PC_${numero}-${String(ano).padStart(2, '0')}`,
      client: propostaData.clienteEmpresa || propostaData.clienteNome || 'A definir',
      client_id: propostaData.clienteId || null,
      client_document: propostaData.clienteDocumento || '',
      client_email: propostaData.clienteEmail || '',
      client_phone: propostaData.clienteTelefone || '',
      value: parseFloat(propostaData.valorTotal) || 0,
      currency: 'BRL',
      status: 'prospeccao',
      endereco: propostaData.clienteEndereco || '',
      notes: `Origem: Proposta ${propostaData.titulo} (PC_${numero}-${String(ano).padStart(2, '0')})`,
      budget: JSON.stringify([]),
      metadata: JSON.stringify({
        propostaId,
        propostaNumero: numero,
        propostaAno: ano,
        propostaRevisao: 0,
        origem: 'proposta',
      }),
    };
    const ctrCols = Object.keys(contractInsert);
    const ctrPh = ctrCols.map((_, i) => `$${i + 1}`);
    const ctrVals = ctrCols.map((k) => contractInsert[k]);
    const ctrSql = `INSERT INTO contracts ("${ctrCols.join('","')}") VALUES (${ctrPh.join(',')}) RETURNING *`;
    const ctrRes = await client.query(ctrSql, ctrVals);
    const contract = db.rowToCamel(ctrRes.rows[0]);

    // ── 3. Vincular proposta → contrato ──
    const linkRes = await client.query(
      `UPDATE propostas SET contrato_id = $1 WHERE id = $2 RETURNING *`,
      [contractId, propostaId]
    );

    return {
      proposta: db.rowToCamel(linkRes.rows[0]),
      contract,
    };
  });
}

/**
 * Cronograma default — 4 fases padrão da Rhino com datas vazias (editáveis).
 */
function cronogramaDefault() {
  return [
    { id: generateId('fase'), fase: 'Engenharia',     inicio: null, fim: null, duracaoDias: 0, ordem: 0 },
    { id: generateId('fase'), fase: 'Aquisições',     inicio: null, fim: null, duracaoDias: 0, ordem: 1 },
    { id: generateId('fase'), fase: 'Instalação',     inicio: null, fim: null, duracaoDias: 0, ordem: 2 },
    { id: generateId('fase'), fase: 'Comissionamento', inicio: null, fim: null, duracaoDias: 0, ordem: 3 },
  ];
}

/**
 * Texto padrão de condições de pagamento (20/65/15).
 */
function condicoesPagamentoDefault() {
  return '20% (vinte por cento) na mobilização, mediante apresentação de nota fiscal; 65% (sessenta e cinco por cento) conforme cronograma de medições aprovadas; 15% (quinze por cento) na entrega final e aceite técnico dos serviços.';
}

/**
 * TRANSAÇÃO — marca proposta como aceita E ativa o contrato vinculado.
 *
 * @param {string} propostaId
 * @returns {Promise<{ proposta: object, contract: object | null }>}
 */
async function aceitar(propostaId) {
  return db.withTransaction(async (client) => {
    const lockRes = await client.query(
      `SELECT * FROM propostas WHERE id = $1 FOR UPDATE`,
      [propostaId]
    );
    if (!lockRes.rows[0]) throw new Error('Proposta não encontrada');
    const cur = db.rowToCamel(lockRes.rows[0]);
    if (cur.status === 'aceita') return { proposta: cur, contract: null };

    const upd = await client.query(
      `UPDATE propostas
          SET status = 'aceita', data_aceite = NOW()
        WHERE id = $1
        RETURNING *`,
      [propostaId]
    );
    const proposta = db.rowToCamel(upd.rows[0]);

    let contract = null;
    if (proposta.contratoId) {
      const ctrRes = await client.query(
        `UPDATE contracts SET status = 'ativo' WHERE id = $1 RETURNING *`,
        [proposta.contratoId]
      );
      if (ctrRes.rows[0]) contract = db.rowToCamel(ctrRes.rows[0]);
    }
    return { proposta, contract };
  });
}

/**
 * TRANSAÇÃO — rejeita proposta. Mantém contrato em prospecção (não cancela
 * automaticamente para preservar histórico — usuário decide).
 */
async function rejeitar(propostaId, motivo) {
  return db.withTransaction(async (client) => {
    const upd = await client.query(
      `UPDATE propostas
          SET status = 'rejeitada', data_rejeicao = NOW(),
              metadata = metadata || jsonb_build_object('motivoRejeicao', $2::text)
        WHERE id = $1
        RETURNING *`,
      [propostaId, motivo || null]
    );
    return upd.rows[0] ? db.rowToCamel(upd.rows[0]) : null;
  });
}

/**
 * Marca proposta como enviada (registra timestamp).
 */
async function enviar(propostaId) {
  const upd = await db.query(
    `UPDATE propostas
        SET status = 'enviada', data_envio = NOW()
      WHERE id = $1
      RETURNING *`,
    [propostaId]
  );
  return upd.rows[0] ? db.rowToCamel(upd.rows[0]) : null;
}

/**
 * Duplica proposta como nova revisão (revisao+1, mesmo numero/ano).
 * Mantém vínculo via proposta_pai_id. NÃO cria novo contrato — o contrato
 * permanece vinculado à proposta original (em prospecção).
 *
 * @param {string} propostaId
 * @returns {Promise<object>}  Nova proposta duplicada.
 */
async function duplicarNovaRevisao(propostaId) {
  return db.withTransaction(async (client) => {
    const cur = await client.query(`SELECT * FROM propostas WHERE id = $1`, [propostaId]);
    if (!cur.rows[0]) throw new Error('Proposta não encontrada');
    const orig = cur.rows[0];

    const lockKey = `propostas_rev_${orig.numero}_${orig.ano}`;
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [lockKey]);

    const rowMax = await client.query(
      `SELECT COALESCE(MAX(revisao), 0) + 1 AS prox
         FROM propostas
        WHERE numero = $1 AND ano = $2`,
      [orig.numero, orig.ano]
    );
    const novaRev = rowMax.rows[0].prox;

    const novoId = generateId('prop');
    const cols = Object.keys(orig).filter(k => !['id','revisao','proposta_pai_id','status','data_envio','data_aceite','data_rejeicao','created_at','updated_at','contrato_id'].includes(k));
    const valuesSql = cols.map(k => `"${k}"`).join(', ');
    const placeholders = cols.map((_, i) => `$${i + 4}`).join(', ');
    const sql = `
      INSERT INTO propostas (id, revisao, proposta_pai_id, status, ${valuesSql})
      SELECT $1, $2, $3, 'rascunho', ${cols.map(k => `"${k}"`).join(', ')}
        FROM propostas WHERE id = $4
      RETURNING *
    `;
    const ins = await client.query(sql, [novoId, novaRev, propostaId, propostaId]);
    return db.rowToCamel(ins.rows[0]);
  });
}

module.exports = {
  ...base,
  proximoNumero,
  findAllWithChildren,
  findByIdWithChildren,
  getEnvelope,
  createWithContract,
  aceitar,
  rejeitar,
  enviar,
  duplicarNovaRevisao,
  cronogramaDefault,
  condicoesPagamentoDefault,
};
