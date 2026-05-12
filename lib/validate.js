'use strict';

// Validação estruturada de entrada — sem dependências externas.
// Uso: const { validateBody, schemas } = require('./validate');
//      const parsed = validateBody(schemas.saidaPost, body); // lança ValidationError em erro

class ValidationError extends Error {
  constructor(errors) {
    super(errors.map(e => e.msg).join('; '));
    this.name = 'ValidationError';
    this.fields = errors; // [{ field, msg }]
    this.statusCode = 400;
  }
}

// ─── primitivos ──────────────────────────────────────────────────────────────

function _isIsoDate(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));
}

function _parsePositiveNumber(v, field) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (!Number.isFinite(n)) return { error: { field, msg: `${field}: deve ser um número válido (recebido: ${JSON.stringify(v)})` } };
  if (n <= 0) return { error: { field, msg: `${field}: deve ser maior que zero` } };
  return { value: n };
}

function _parseNonNegativeNumber(v, field) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (!Number.isFinite(n)) return { error: { field, msg: `${field}: deve ser um número válido (recebido: ${JSON.stringify(v)})` } };
  if (n < 0) return { error: { field, msg: `${field}: deve ser >= 0` } };
  return { value: n };
}

function _parsePositiveInt(v, field) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || String(parseInt(v, 10)) !== String(v).trim()) {
    // aceita números float que sejam inteiros (ex: 30.0)
    const float = parseFloat(v);
    if (!Number.isFinite(float) || float !== Math.floor(float))
      return { error: { field, msg: `${field}: deve ser um inteiro positivo (recebido: ${JSON.stringify(v)})` } };
    if (float <= 0) return { error: { field, msg: `${field}: deve ser > 0` } };
    return { value: Math.round(float) };
  }
  if (n <= 0) return { error: { field, msg: `${field}: deve ser > 0` } };
  return { value: n };
}

function _parseDate(v, field) {
  if (!_isIsoDate(v)) return { error: { field, msg: `${field}: deve ser uma data válida no formato YYYY-MM-DD (recebido: ${JSON.stringify(v)})` } };
  return { value: v };
}

function _parseRequiredString(v, field) {
  if (!v || typeof v !== 'string' || !v.trim())
    return { error: { field, msg: `${field}: campo obrigatório` } };
  return { value: v.trim() };
}

// ─── schemas ─────────────────────────────────────────────────────────────────

const SAIDA_TYPES = new Set(['material', 'mao_de_obra', 'servico', 'equipamento', 'outros']);

const schemas = {
  // POST /api/contracts/:id/saidas
  saidaPost(body) {
    const errors = [];
    const out = {};

    const value = _parsePositiveNumber(body.value, 'value');
    if (value.error) errors.push(value.error); else out.value = value.value;

    const date = _parseDate(body.date || new Date().toISOString().split('T')[0], 'date');
    if (date.error) errors.push(date.error); else out.date = date.value;

    if (body.type !== undefined && !SAIDA_TYPES.has(body.type)) {
      errors.push({ field: 'type', msg: `type: valor inválido "${body.type}" — use: ${[...SAIDA_TYPES].join(', ')}` });
    } else {
      out.type = body.type || 'material';
    }

    out.description = body.description || '';

    return { errors, out };
  },

  // PUT /api/saidas/:id
  saidaPut(body) {
    const errors = [];
    const out = {};

    if (body.value !== undefined) {
      const value = _parsePositiveNumber(body.value, 'value');
      if (value.error) errors.push(value.error); else out.value = value.value;
    }
    if (body.date !== undefined) {
      const date = _parseDate(body.date, 'date');
      if (date.error) errors.push(date.error); else out.date = date.value;
    }
    if (body.type !== undefined) {
      if (!SAIDA_TYPES.has(body.type)) {
        errors.push({ field: 'type', msg: `type: valor inválido "${body.type}"` });
      } else {
        out.type = body.type;
      }
    }
    if (body.description !== undefined) out.description = body.description;

    return { errors, out };
  },

  // POST /api/notas-fiscais
  notaFiscalPost(body) {
    const errors = [];
    const out = {};

    const numero = _parseRequiredString(body.numero, 'numero');
    if (numero.error) errors.push(numero.error); else out.numero = numero.value;

    const contractId = _parseRequiredString(body.contractId, 'contractId');
    if (contractId.error) errors.push(contractId.error); else out.contractId = contractId.value;

    const dataLimite = _parseDate(body.dataLimite, 'dataLimite');
    if (dataLimite.error) errors.push(dataLimite.error); else out.dataLimite = dataLimite.value;

    const valor = _parseNonNegativeNumber(body.valor ?? 0, 'valor');
    if (valor.error) errors.push(valor.error); else out.valor = valor.value;

    if (body.prazoRecebimento !== undefined) {
      const prazo = _parsePositiveInt(body.prazoRecebimento, 'prazoRecebimento');
      if (prazo.error) errors.push(prazo.error); else out.prazoRecebimento = prazo.value;
    } else {
      out.prazoRecebimento = 30;
    }

    out.observacoes = body.observacoes || '';

    return { errors, out };
  },

  // PUT /api/notas-fiscais/:id
  notaFiscalPut(body) {
    const errors = [];
    const out = {};

    if (body.valor !== undefined) {
      const valor = _parseNonNegativeNumber(body.valor, 'valor');
      if (valor.error) errors.push(valor.error); else out.valor = valor.value;
    }
    if (body.prazoRecebimento !== undefined) {
      const prazo = _parsePositiveInt(body.prazoRecebimento, 'prazoRecebimento');
      if (prazo.error) errors.push(prazo.error); else out.prazoRecebimento = prazo.value;
    }
    if (body.dataLimite !== undefined) {
      if (body.dataLimite !== null) {
        const dl = _parseDate(body.dataLimite, 'dataLimite');
        if (dl.error) errors.push(dl.error); else out.dataLimite = dl.value;
      } else {
        out.dataLimite = null;
      }
    }
    if (body.dataEmissaoReal !== undefined) {
      if (body.dataEmissaoReal !== null) {
        const der = _parseDate(body.dataEmissaoReal, 'dataEmissaoReal');
        if (der.error) errors.push(der.error); else out.dataEmissaoReal = der.value;
      } else {
        out.dataEmissaoReal = null;
      }
    }
    if (body.numero !== undefined) out.numero = body.numero;
    if (body.contractId !== undefined) out.contractId = body.contractId;
    if (body.observacoes !== undefined) out.observacoes = body.observacoes;

    return { errors, out };
  },

  // POST /api/contas-pagar
  contaPagarPost(body) {
    const errors = [];
    const out = {};

    const descricao = _parseRequiredString(body.descricao, 'descricao');
    if (descricao.error) errors.push(descricao.error); else out.descricao = descricao.value;

    const valor = _parsePositiveNumber(body.valor, 'valor');
    if (valor.error) errors.push(valor.error); else out.valor = valor.value;

    const today = new Date().toISOString().split('T')[0];
    const dataEmissao = _parseDate(body.dataEmissao || today, 'dataEmissao');
    if (dataEmissao.error) errors.push(dataEmissao.error); else out.dataEmissao = dataEmissao.value;

    if (body.dataVencimento) {
      const dv = _parseDate(body.dataVencimento, 'dataVencimento');
      if (dv.error) errors.push(dv.error); else out.dataVencimento = dv.value;
    } else {
      out.dataVencimento = null;
    }

    out.fornecedorId = body.fornecedorId || null;
    out.numeroNF = body.numeroNF || '';
    out.contractId = body.contractId || null;
    out.category = body.category || 'fornecedor';
    out.observacoes = body.observacoes || '';
    out.recorrente = !!body.recorrente;
    out.periodicidade = body.periodicidade || null;
    out.recorrenciaOrigemId = body.recorrenciaOrigemId || null;

    return { errors, out };
  },
};

// ─── helper para usar nos handlers ───────────────────────────────────────────

function validateBody(schemaFn, body) {
  const { errors, out } = schemaFn(body);
  if (errors.length > 0) throw new ValidationError(errors);
  return out;
}

module.exports = { validateBody, schemas, ValidationError };
