'use strict';
/**
 * @file Regras puras dos documentos de candidato (Recrutamento, US-08/US-09).
 *
 * Sem I/O, sem HTTP, sem banco: testáveis com `node:test`. O handler
 * (`handlers/candidato-documentos.js` / `handlers/recrutamento.js`) é só o
 * adaptador — chama estas funções e traduz o resultado em resposta HTTP.
 *
 * Resultado de negócio como objeto, não exceção (engineering.md §5): o ramo
 * "rejeitado" é dado (`{ ok:false, motivo }`), não erro. Exceção fica reservada
 * pra falha de verdade (banco fora, etc.).
 */

/** Tipos de documento aceitos por candidato. */
const DOC_TIPOS = ['rg', 'cpf', 'residencia', 'ctps', 'antecedentes'];

/** Os 4 documentos exigidos para aprovar (antecedentes é gate à parte). */
const DOCS_OBRIGATORIOS = ['rg', 'cpf', 'residencia', 'ctps'];

/** MIME types permitidos no upload — espelha os docs de recurso. */
const MIME_PERMITIDOS = [
  'application/pdf',
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
];

/** Tamanho máximo por arquivo (10 MB), igual aos docs de recurso. */
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Valida um upload de documento de candidato.
 *
 * @param {object} p
 * @param {string} p.tipo               rg|cpf|residencia|ctps|antecedentes
 * @param {string} p.mimeType           content-type do arquivo enviado
 * @param {number} p.sizeBytes          tamanho em bytes
 * @param {string} p.antecedentesStatus pendente|ok|reprovado
 * @returns {{ok:true}|{ok:false, motivo:string}}
 */
function validarUploadDoc({ tipo, mimeType, sizeBytes, antecedentesStatus } = {}) {
  if (!DOC_TIPOS.includes(tipo)) {
    return { ok: false, motivo: `Tipo inválido: ${tipo}. Use: ${DOC_TIPOS.join(', ')}` };
  }
  // Documentos (exceto antecedentes) só após antecedentes OK — regra herdada
  // do fluxo original (handlers/recrutamento.js anexarDocumento).
  if (tipo !== 'antecedentes' && antecedentesStatus !== 'ok') {
    return { ok: false, motivo: 'Documentos só podem ser anexados após aprovação dos antecedentes.' };
  }
  if (!mimeType || !MIME_PERMITIDOS.includes(mimeType)) {
    return { ok: false, motivo: 'Tipo de arquivo não permitido. Use PDF, JPG ou PNG.' };
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return { ok: false, motivo: 'Arquivo vazio.' };
  }
  if (sizeBytes > MAX_BYTES) {
    return { ok: false, motivo: `Arquivo excede ${Math.floor(MAX_BYTES / 1024 / 1024)} MB.` };
  }
  return { ok: true };
}

/**
 * Decide se um candidato pode ser aprovado (US-09).
 *
 * @param {object|null} cand              candidato (precisa de status + antecedentesStatus)
 * @param {string[]}    tiposComArquivo   tipos de doc que TÊM arquivo armazenado de fato
 * @returns {{ok:true}|{ok:false, motivo:string, faltando?:string[]}}
 */
function podeAprovar(cand, tiposComArquivo) {
  if (!cand) return { ok: false, motivo: 'Candidato não encontrado' };
  if (cand.status === 'aprovado') return { ok: false, motivo: 'Candidato já está aprovado.' };
  if (cand.antecedentesStatus !== 'ok') {
    return { ok: false, motivo: 'Antecedentes precisam estar OK para aprovar.' };
  }
  const presentes = new Set(tiposComArquivo || []);
  const faltando = DOCS_OBRIGATORIOS.filter((k) => !presentes.has(k));
  if (faltando.length > 0) {
    return { ok: false, motivo: `Documentos faltando: ${faltando.join(', ')}. Anexe antes de aprovar.`, faltando };
  }
  return { ok: true };
}

module.exports = {
  DOC_TIPOS,
  DOCS_OBRIGATORIOS,
  MIME_PERMITIDOS,
  MAX_BYTES,
  validarUploadDoc,
  podeAprovar,
};
