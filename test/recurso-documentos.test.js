'use strict';
/**
 * Handler de Documentos de Recurso (handlers/recurso-documentos.js), com
 * `db`/`repos`/`piiCrypto` dublados — nada toca o Postgres, upload simulado
 * via test/helpers/multipart.js. A validação por IA (`_validarDocComTemplate`,
 * privada) faz conversão PDF→imagem e chama Claude Vision — pesada demais pra
 * mockar aqui; os testes cobrem os caminhos de orquestração que ATRAVESSAM
 * ela sem precisar de rede/lib de imagem: sem ANTHROPIC_API_KEY (o ambiente
 * de teste não define a variável) ela sempre devolve `nao_validado` cedo,
 * ANTES de tentar processar a imagem — path real, não um mock da função.
 *  - upload: valida Content-Type/tamanho/MIME allowlist (FIX C-02: sem
 *    Content-Type é bloqueado, não um bypass); renomeia o arquivo pro padrão
 *    AAAA_MM_DD_Tipo_Nome.ext; substitui o arquivo anterior do mesmo doc
 *    (DELETE antes do INSERT); cifra o binário (piiCrypto.encryptBuffer);
 *  - GET decifra o binário; DELETE remove o binário E a referência no JSONB;
 *  - PUT documento blinda campos controlados pelo servidor (id/validacao/
 *    createdAt não são sobrescrevíveis via mass-assignment);
 *  - status agrega vencidos/vencendo/vigentes/pendentes só dos funcionários
 *    ATIVOS (candidato/ex-funcionário não contam).
 */
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const db = require('../db');
const repos = require('../db/repos');
const piiCrypto = require('../lib/crypto-pii');
const h = require('../handlers/recurso-documentos');
const { fakeMultipartReq, PNG_BYTES, PDF_BYTES } = require('./helpers/multipart');

function fakeRes() {
  const res = {
    status: null,
    body: null,
    headers: null,
    writeHead(s, hd) { res.status = s; res.headers = { ...(res.headers || {}), ...(hd || {}) }; },
    end(payload) { res.body = Buffer.isBuffer(payload) ? payload : (payload ? JSON.parse(payload) : null); },
  };
  return res;
}

const orig = {
  getOne: db.getOne, query: db.query,
  recursos: repos.recursos, docTemplates: repos.docTemplates,
  encryptBuffer: piiCrypto.encryptBuffer, decryptBuffer: piiCrypto.decryptBuffer,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
};
let recursos, dbQueries, arquivoRow;

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  dbQueries = [];
  arquivoRow = null;
  recursos = {
    rec1: { id: 'rec1', nome: 'João Silva', status: 'funcionario', documentos: [{ id: 'doc1', tipo: 'nr10', tipoLabel: 'NR-10', templateId: null }] },
  };
  db.getOne = async (sql, params) => {
    dbQueries.push({ sql, params });
    if (/FROM recurso_doc_arquivos/.test(sql)) return arquivoRow;
    return null;
  };
  db.query = async (sql, params) => { dbQueries.push({ sql, params }); return { rows: [] }; };
  repos.recursos = {
    findById: async (id) => recursos[id] || null,
    findAll: async () => Object.values(recursos),
    updateById: async (id, patch) => {
      Object.assign(recursos[id], patch);
      if (typeof patch.documentos === 'string') recursos[id].documentos = JSON.parse(patch.documentos);
      return recursos[id];
    },
  };
  repos.docTemplates = { findById: async (id) => (id === 'tpl1' ? { id: 'tpl1', metadata: { campos: [{ nome: 'Nome', obrigatorio: true }] } } : null) };
  piiCrypto.encryptBuffer = (buf) => Buffer.concat([Buffer.from('ENC:'), buf]);
  piiCrypto.decryptBuffer = (buf) => buf.slice(4); // remove o prefixo 'ENC:'
});

afterEach(() => {
  Object.assign(db, { getOne: orig.getOne, query: orig.query });
  Object.assign(repos, { recursos: orig.recursos, docTemplates: orig.docTemplates });
  Object.assign(piiCrypto, { encryptBuffer: orig.encryptBuffer, decryptBuffer: orig.decryptBuffer });
  if (orig.ANTHROPIC_API_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = orig.ANTHROPIC_API_KEY;
});

function waitEnd(req) {
  return new Promise((resolve) => req.once('end', () => setImmediate(resolve)));
}

// ---------------- upload (handlePostRecursoDocArquivo) ----------------

test('upload — sem Content-Type multipart devolve 400 sincronamente', async () => {
  const res = fakeRes();
  h.handlePostRecursoDocArquivo('rec1', 'doc1', { headers: {} }, res);
  assert.equal(res.status, 400);
});

test('upload — sem Content-Type no arquivo devolve 400 (FIX C-02: não é bypass)', async () => {
  const res = fakeRes();
  const req = fakeMultipartReq([{ name: 'file', filename: 'x.html', data: '<script>evil</script>' }]);
  h.handlePostRecursoDocArquivo('rec1', 'doc1', req, res);
  await waitEnd(req);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /Tipo não permitido/);
});

test('upload — Content-Type fora da allowlist devolve 400', async () => {
  const res = fakeRes();
  const req = fakeMultipartReq([{ name: 'file', filename: 'x.svg', contentType: 'image/svg+xml', data: PNG_BYTES }]);
  h.handlePostRecursoDocArquivo('rec1', 'doc1', req, res);
  await waitEnd(req);
  assert.equal(res.status, 400);
});

test('upload — recurso inexistente devolve 404', async () => {
  const res = fakeRes();
  const req = fakeMultipartReq([{ name: 'file', filename: 'x.pdf', contentType: 'application/pdf', data: PDF_BYTES }]);
  h.handlePostRecursoDocArquivo('recX', 'doc1', req, res);
  await waitEnd(req);
  assert.equal(res.status, 404);
});

test('upload — documento inexistente no recurso devolve 404', async () => {
  const res = fakeRes();
  const req = fakeMultipartReq([{ name: 'file', filename: 'x.pdf', contentType: 'application/pdf', data: PDF_BYTES }]);
  h.handlePostRecursoDocArquivo('rec1', 'docX', req, res);
  await waitEnd(req);
  assert.equal(res.status, 404);
});

test('upload — sucesso: renomeia o arquivo, cifra o binário, substitui o anterior', async () => {
  const res = fakeRes();
  const req = fakeMultipartReq([{ name: 'file', filename: 'certificado.pdf', contentType: 'application/pdf', data: PDF_BYTES }]);
  h.handlePostRecursoDocArquivo('rec1', 'doc1', req, res);
  await waitEnd(req);
  assert.equal(res.status, 200);
  assert.match(res.body.arquivo.filename, /^\d{4}_\d{2}_\d{2}_NR_10_Joao_Silva\.pdf$/);
  assert.equal(res.body.arquivo.filenameOriginal, 'certificado.pdf');
  assert.equal(res.body.arquivo.sizeBytes, PDF_BYTES.length);

  const del = dbQueries.find((q) => /DELETE FROM recurso_doc_arquivos/.test(q.sql));
  const ins = dbQueries.find((q) => /INSERT INTO recurso_doc_arquivos/.test(q.sql));
  assert.ok(del, 'deve apagar o arquivo anterior do mesmo doc antes de inserir');
  assert.ok(ins);
  assert.equal(dbQueries.indexOf(del) < dbQueries.indexOf(ins), true, 'DELETE deve vir antes do INSERT');
  // O binário gravado passou por encryptBuffer (prefixo 'ENC:' do dublê).
  const dataParam = ins.params[7];
  assert.ok(Buffer.isBuffer(dataParam) && dataParam.slice(0, 4).toString() === 'ENC:');

  // JSONB do doc foi atualizado com a referência ao arquivo.
  const docAtual = recursos.rec1.documentos.find((d) => d.id === 'doc1');
  assert.equal(docAtual.nomeArquivo, res.body.arquivo.filename);
  assert.equal(docAtual.arquivo.id, res.body.arquivo.id);
});

test('upload — nome de pessoa/tipo sem acentos vira slug ASCII no filename', async () => {
  recursos.rec1.nome = 'José da Conceição';
  recursos.rec1.documentos[0].tipoLabel = 'ASO — Exame Médico';
  const res = fakeRes();
  const req = fakeMultipartReq([{ name: 'file', filename: 'x.png', contentType: 'image/png', data: PNG_BYTES }]);
  h.handlePostRecursoDocArquivo('rec1', 'doc1', req, res);
  await waitEnd(req);
  assert.equal(res.status, 200);
  assert.doesNotMatch(res.body.arquivo.filename, /[íçãóé]/i);
});

// ---------------- GET / DELETE arquivo ----------------

test('GET arquivo — inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handleGetRecursoDocArquivo('rec1', 'doc1', res);
  assert.equal(res.status, 404);
});

test('GET arquivo — devolve o binário decifrado com Content-Disposition inline', async () => {
  arquivoRow = { filename: 'x.pdf', mimeType: 'application/pdf', data: Buffer.concat([Buffer.from('ENC:'), PDF_BYTES]) };
  const res = fakeRes();
  await h.handleGetRecursoDocArquivo('rec1', 'doc1', res);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, PDF_BYTES);
  assert.match(res.headers['Content-Disposition'], /inline/);
  assert.equal(res.headers['X-Content-Type-Options'], 'nosniff');
});

test('DELETE arquivo — recurso inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handleDeleteRecursoDocArquivo('recX', 'doc1', res);
  assert.equal(res.status, 404);
});

test('DELETE arquivo — remove o binário e a referência arquivo/nomeArquivo do JSONB (mantém o resto do doc)', async () => {
  recursos.rec1.documentos[0].arquivo = { id: 'arq1', filename: 'x.pdf' };
  recursos.rec1.documentos[0].nomeArquivo = 'x.pdf';
  const res = fakeRes();
  await h.handleDeleteRecursoDocArquivo('rec1', 'doc1', res);
  assert.equal(res.status, 200);
  assert.ok(dbQueries.some((q) => /DELETE FROM recurso_doc_arquivos/.test(q.sql)));
  const docAtual = recursos.rec1.documentos.find((d) => d.id === 'doc1');
  assert.equal(docAtual.arquivo, undefined);
  assert.equal(docAtual.nomeArquivo, undefined);
  assert.equal(docAtual.tipo, 'nr10'); // o resto do doc permanece
});

// ---------------- Validação (handleValidarDocumento) ----------------

test('validar — recurso inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handleValidarDocumento('recX', 'doc1', res);
  assert.equal(res.status, 404);
});

test('validar — documento inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handleValidarDocumento('rec1', 'docX', res);
  assert.equal(res.status, 404);
});

test('validar — documento sem templateId devolve 400', async () => {
  const res = fakeRes();
  await h.handleValidarDocumento('rec1', 'doc1', res);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /não tem template associado/);
});

test('validar — template inexistente devolve 404', async () => {
  recursos.rec1.documentos[0].templateId = 'tplX';
  const res = fakeRes();
  await h.handleValidarDocumento('rec1', 'doc1', res);
  assert.equal(res.status, 404);
});

test('validar — sem arquivo anexado devolve 400', async () => {
  recursos.rec1.documentos[0].templateId = 'tpl1';
  const res = fakeRes();
  await h.handleValidarDocumento('rec1', 'doc1', res);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /sem arquivo anexado/);
});

test('validar — sem ANTHROPIC_API_KEY devolve status "nao_validado" e grava no doc', async () => {
  recursos.rec1.documentos[0].templateId = 'tpl1';
  arquivoRow = { mimeType: 'application/pdf', data: Buffer.concat([Buffer.from('ENC:'), PDF_BYTES]) };
  const res = fakeRes();
  await h.handleValidarDocumento('rec1', 'doc1', res);
  assert.equal(res.status, 200);
  assert.equal(res.body.validacao.status, 'nao_validado');
  assert.match(res.body.validacao.motivo, /ANTHROPIC_API_KEY/);
  const docAtual = recursos.rec1.documentos.find((d) => d.id === 'doc1');
  assert.equal(docAtual.validacao.status, 'nao_validado');
});

test('validar — template sem secoes/campos/elementos_visuais configurados devolve "nao_validado" (sem chamar a IA)', async () => {
  process.env.ANTHROPIC_API_KEY = 'sk-test';
  repos.docTemplates.findById = async (id) => (id === 'tpl1' ? { id: 'tpl1', metadata: {} } : null);
  recursos.rec1.documentos[0].templateId = 'tpl1';
  arquivoRow = { mimeType: 'application/pdf', data: Buffer.concat([Buffer.from('ENC:'), PDF_BYTES]) };
  const res = fakeRes();
  await h.handleValidarDocumento('rec1', 'doc1', res);
  assert.equal(res.status, 200);
  assert.equal(res.body.validacao.status, 'nao_validado');
  assert.match(res.body.validacao.motivo, /sem padrão de validação configurado/);
});

test('validar — mimeType não suportado (nem pdf nem imagem) devolve "nao_validado"', async () => {
  process.env.ANTHROPIC_API_KEY = 'sk-test';
  recursos.rec1.documentos[0].templateId = 'tpl1';
  arquivoRow = { mimeType: 'text/plain', data: Buffer.concat([Buffer.from('ENC:'), Buffer.from('conteudo texto')]) };
  const res = fakeRes();
  await h.handleValidarDocumento('rec1', 'doc1', res);
  assert.equal(res.status, 200);
  assert.equal(res.body.validacao.status, 'nao_validado');
  assert.match(res.body.validacao.motivo, /Tipo de arquivo não suportado/);
});

// ---------------- Add/Put/Delete Documento (metadados) ----------------

test('addDocumento — recurso inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handleAddDocumento('recX', { tipo: 'aso' }, res);
  assert.equal(res.status, 404);
});

test('addDocumento — cria com validacao=null e devolve o envelope de recursos', async () => {
  const res = fakeRes();
  await h.handleAddDocumento('rec1', { tipo: 'aso', tipoLabel: 'ASO', dataVencimento: '2026-12-01' }, res);
  assert.equal(res.status, 200);
  assert.ok(res.body.recursos);
  const novo = recursos.rec1.documentos.find((d) => d.tipo === 'aso');
  assert.equal(novo.validacao, null);
  assert.ok(novo.id);
});

test('putDocumento — documento inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handlePutDocumento('rec1', 'docX', { tipo: 'x' }, res);
  assert.equal(res.status, 404);
});

test('putDocumento — blinda id/validacao/createdAt contra mass-assignment', async () => {
  recursos.rec1.documentos[0].validacao = { status: 'conforme', score: 95 };
  recursos.rec1.documentos[0].createdAt = '2026-01-01T00:00:00.000Z';
  const res = fakeRes();
  await h.handlePutDocumento('rec1', 'doc1', {
    id: 'doc-hackeado', validacao: { status: 'conforme', score: 100 }, createdAt: '2099-01-01', tipoLabel: 'NR-10 atualizado',
  }, res);
  assert.equal(res.status, 200);
  const docAtual = recursos.rec1.documentos.find((d) => d.id === 'doc1');
  assert.equal(docAtual.id, 'doc1'); // não virou 'doc-hackeado'
  assert.equal(docAtual.validacao.score, 95); // não foi forjado pra 100
  assert.equal(docAtual.createdAt, '2026-01-01T00:00:00.000Z'); // não mudou
  assert.equal(docAtual.tipoLabel, 'NR-10 atualizado'); // campo normal passa
});

test('deleteDocumento — recurso inexistente devolve 404', async () => {
  const res = fakeRes();
  await h.handleDeleteDocumento('recX', 'doc1', res);
  assert.equal(res.status, 404);
});

test('deleteDocumento — remove o doc do JSONB e o arquivo binário vinculado', async () => {
  const res = fakeRes();
  await h.handleDeleteDocumento('rec1', 'doc1', res);
  assert.equal(res.status, 200);
  assert.equal(recursos.rec1.documentos.length, 0);
  assert.ok(dbQueries.some((q) => /DELETE FROM recurso_doc_arquivos/.test(q.sql)));
});

// ---------------- Status agregado ----------------

test('status — só conta documentos de recursos com status="funcionario"', async () => {
  recursos.rec2 = { id: 'rec2', nome: 'Candidato X', status: 'candidato', documentos: [{ id: 'd1', dataVencimento: '2020-01-01' }] };
  const res = fakeRes();
  await h.handleGetDocumentosStatus(res);
  assert.equal(res.status, 200);
  assert.equal(res.body.totalAtivos, 1); // só rec1
  assert.equal(res.body.totalDocs, 1); // doc do rec2 (candidato) não conta
});

test('status — classifica vencido/vencendo/vigente/pendente corretamente', async () => {
  const hoje = new Date();
  const emDias = (n) => { const d = new Date(hoje); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  recursos.rec1.documentos = [
    { id: 'd1', dataVencimento: emDias(-5) },  // vencido
    { id: 'd2', dataVencimento: emDias(10) },  // vencendo (<=30)
    { id: 'd3', dataVencimento: emDias(90) },  // vigente
    { id: 'd4', dataVencimento: '' },          // pendente (sem data)
  ];
  const res = fakeRes();
  await h.handleGetDocumentosStatus(res);
  assert.equal(res.body.totalDocs, 4);
  assert.equal(res.body.vencidos, 1);
  assert.equal(res.body.vencendo, 1);
  assert.equal(res.body.vigentes, 1);
  assert.equal(res.body.pendentes, 1);
  assert.equal(res.body.colaboradoresComVencidos, 1);
});
