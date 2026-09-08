'use strict';
/**
 * @file Qualidade & Segurança — leitura unificada de Punch List, SSMA e
 * Ocorrências da obra. Regra pura, sem I/O, testável (test/ocorrencias-obra.test.js).
 *
 * POR QUE UNIFICAR SÓ A LEITURA
 * As três eram abas separadas que registram a mesma família de coisa — um
 * acidente cabia em três lugares diferentes, e o usuário não sabia onde lançar
 * o quê. Mas as tabelas NÃO foram fundidas, de propósito:
 *
 *  - `punch_itens`: `severidade`, fluxo de 4 estados, prazo, fotos em tabela
 *    própria com CASCADE.
 *  - `ssma_ocorrencias`: `gravidade` (outro nome pra mesma escala), fluxo de 3
 *    estados, e os campos LEGAIS `com_afastamento` / `dias_perdidos`, que
 *    alimentam TF e TG (indicadores de segurança do trabalho, NR/OSHA).
 *  - `contract_ocorrencias`: modelo mais pobre — o status é um booleano.
 *
 * Fundir tudo numa tabela exigiria colunas nullable ou um JSONB, e a query de
 * TF/TG passaria a precisar de `WHERE origem='ssma'` — exatamente o
 * discriminador que manter as três tabelas já dá de graça. Então: uma aba, três
 * tabelas, zero migration. As ESCRITAS continuam indo para a origem certa.
 *
 * Regras:
 *  - BR-QSMS-001: mapa de status nativo → `statusGrupo` comum
 *    (`aberto | em_andamento | encerrado`), já que as origens têm 4, 3 e 2
 *    estados. O status NATIVO é preservado no item: é ele que o formulário usa
 *    pra escrever de volta na tabela de origem.
 *  - BR-QSMS-002: o resumo unificado PRESERVA os agregados que já existiam —
 *    `resumo.qualidade` é literalmente `lib/punch#resumo` e `resumo.seguranca`
 *    é literalmente `lib/ssma#resumo`. Nada é reimplementado aqui, justamente
 *    pra que TF/TG não possam ser degradados por acidente.
 */

const punch = require('./punch');
const ssma = require('./ssma');

/** Os três grupos comuns, na ordem do fluxo. */
const STATUS_GRUPO = ['aberto', 'em_andamento', 'encerrado'];

/** Escala de severidade compartilhada pelas três origens (só o campo difere). */
const SEVERIDADES = ['baixa', 'media', 'alta', 'critica'];
const _SEV = new Set(SEVERIDADES);
const _SEV_RANK = { critica: 3, alta: 2, media: 1, baixa: 0 };

/**
 * Status nativo → grupo comum (BR-QSMS-001).
 *
 * Nota sobre o punch: 'resolvido' NÃO é encerrado. Quem executa marca
 * 'resolvido'; a qualidade confere e marca 'verificado'. O próprio
 * `lib/punch#resumo` conta como "aberto" tudo que não foi verificado — se aqui
 * 'resolvido' virasse 'encerrado', a aba unificada contradiria o resumo do
 * punch exibido ao lado dela.
 *
 * @param {'punch'|'ssma'|'geral'} origem
 * @param {string|boolean|undefined} status  status nativo (booleano em 'geral')
 * @returns {'aberto'|'em_andamento'|'encerrado'}
 */
function statusGrupoDe(origem, status) {
  if (origem === 'geral') return status === true ? 'encerrado' : 'aberto';
  if (origem === 'ssma') {
    const s = ssma.normalizarStatus(status);
    if (s === 'encerrado') return 'encerrado';
    if (s === 'em_investigacao') return 'em_andamento';
    return 'aberto';
  }
  const s = punch.normalizarStatus(status);
  if (s === 'verificado') return 'encerrado';
  if (s === 'em_andamento' || s === 'resolvido') return 'em_andamento';
  return 'aberto';
}

/** Lê a primeira chave presente (aceita camelCase e o snake_case cru do banco). */
function _pick(obj, ...chaves) {
  for (const k of chaves) {
    if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

/** Normaliza severidade desconhecida para 'media' (mesma régua dos outros libs). */
function _severidade(v) {
  return _SEV.has(v) ? v : 'media';
}

/** Só a parte YYYY-MM-DD, pra comparar por dia. */
function _dia(v) {
  return v ? String(v).slice(0, 10) : '';
}

/**
 * Vencido: tem prazo no passado e ainda não está encerrado. Mesma regra do
 * BR-PUNCH-002, aplicada às três origens (SSMA também tem prazo;
 * contract_ocorrencias não tem, então nunca vence).
 */
function _vencido(prazo, statusGrupo, hojeISO) {
  if (!prazo || statusGrupo === 'encerrado') return false;
  return _dia(prazo) < _dia(hojeISO);
}

function _deOrigemPunch(it, hojeISO) {
  const status = punch.normalizarStatus(it && it.status);
  const statusGrupo = statusGrupoDe('punch', status);
  const prazo = _pick(it, 'prazo') || null;
  return {
    id: _pick(it, 'id'),
    origem: 'punch',
    tipo: _pick(it, 'tipo') || 'pendencia',
    titulo: _pick(it, 'titulo') || '',
    descricao: _pick(it, 'descricao') || '',
    severidade: _severidade(_pick(it, 'severidade')),
    status,
    statusGrupo,
    data: _pick(it, 'data', 'createdAt', 'created_at') || null,
    prazo,
    vencido: _vencido(prazo, statusGrupo, hojeISO),
    responsavelId: _pick(it, 'responsavelId', 'responsavel_id') || null,
    meta: {
      localizacao: _pick(it, 'localizacao') || '',
      fotos: _pick(it, 'fotos') || [],
      resolvidoEm: _pick(it, 'resolvidoEm', 'resolvido_em') || null,
      verificadoEm: _pick(it, 'verificadoEm', 'verificado_em') || null,
    },
  };
}

function _deOrigemSsma(oc, hojeISO) {
  const status = ssma.normalizarStatus(oc && oc.status);
  const statusGrupo = statusGrupoDe('ssma', status);
  const prazo = _pick(oc, 'prazo') || null;
  return {
    id: _pick(oc, 'id'),
    origem: 'ssma',
    tipo: ssma.normalizarTipo(_pick(oc, 'tipo')),
    // SSMA não tem título próprio: a descrição é o texto principal.
    titulo: '',
    descricao: _pick(oc, 'descricao') || '',
    // Aqui o campo se chama `gravidade`, mas a escala é a mesma.
    severidade: _severidade(_pick(oc, 'gravidade', 'severidade')),
    status,
    statusGrupo,
    data: _pick(oc, 'data') || null,
    prazo,
    vencido: _vencido(prazo, statusGrupo, hojeISO),
    responsavelId: _pick(oc, 'responsavelId', 'responsavel_id') || null,
    meta: {
      // Campos legais: alimentam TF/TG. Não podem se perder na unificação.
      comAfastamento: !!_pick(oc, 'comAfastamento', 'com_afastamento'),
      diasPerdidos: Number(_pick(oc, 'diasPerdidos', 'dias_perdidos')) || 0,
      causa: _pick(oc, 'causa') || '',
      acaoCorretiva: _pick(oc, 'acaoCorretiva', 'acao_corretiva') || '',
      encerradoEm: _pick(oc, 'encerradoEm', 'encerrado_em') || null,
    },
  };
}

function _deOrigemGeral(oc) {
  const encerrada = !!_pick(oc, 'encerrada');
  const statusGrupo = statusGrupoDe('geral', encerrada);
  return {
    id: _pick(oc, 'id'),
    origem: 'geral',
    tipo: _pick(oc, 'tipo') || 'geral',
    titulo: '',
    descricao: _pick(oc, 'descricao') || '',
    severidade: _severidade(_pick(oc, 'severidade')),
    // O status nativo desta origem é um booleano; expomos o rótulo equivalente
    // pra tela não ter que saber disso, mas o booleano vai em meta.
    status: encerrada ? 'encerrada' : 'aberta',
    statusGrupo,
    data: _pick(oc, 'data') || null,
    prazo: null,
    vencido: false,
    responsavelId: null,
    meta: { encerrada },
  };
}

/**
 * Ordem de exibição: primeiro o que cobra ação. Vencido no topo, depois o que
 * está em aberto, depois por severidade e por data mais recente.
 */
function _ordenar(a, b) {
  if (a.vencido !== b.vencido) return a.vencido ? -1 : 1;
  const aEnc = a.statusGrupo === 'encerrado';
  const bEnc = b.statusGrupo === 'encerrado';
  if (aEnc !== bEnc) return aEnc ? 1 : -1;
  const sev = (_SEV_RANK[b.severidade] || 0) - (_SEV_RANK[a.severidade] || 0);
  if (sev !== 0) return sev;
  return String(b.data || '').localeCompare(String(a.data || ''));
}

/**
 * Junta as três origens numa lista só e devolve o resumo agregado.
 *
 * @param {object} entrada
 * @param {object[]} [entrada.punchItens]
 * @param {object[]} [entrada.ssmaOcorrencias]
 * @param {object[]} [entrada.contractOcorrencias]
 * @param {string} entrada.hojeISO  data de referência (injetada — função pura)
 * @param {number} [entrada.hht]    homem-hora trabalhado, base de TF/TG
 * @returns {{ itens: object[], resumo: object }}
 */
function unificar({ punchItens, ssmaOcorrencias, contractOcorrencias, hojeISO, hht } = {}) {
  const pun = Array.isArray(punchItens) ? punchItens : [];
  const ssm = Array.isArray(ssmaOcorrencias) ? ssmaOcorrencias : [];
  const ger = Array.isArray(contractOcorrencias) ? contractOcorrencias : [];

  const itens = [
    ...pun.map((it) => _deOrigemPunch(it, hojeISO)),
    ...ssm.map((oc) => _deOrigemSsma(oc, hojeISO)),
    ...ger.map((oc) => _deOrigemGeral(oc)),
  ].sort(_ordenar);

  return {
    itens,
    resumo: {
      total: itens.length,
      porOrigem: { punch: pun.length, ssma: ssm.length, geral: ger.length },
      abertos: itens.filter((i) => i.statusGrupo !== 'encerrado').length,
      vencidos: itens.filter((i) => i.vencido).length,
      // BR-QSMS-002: reuso literal, não reimplementação. É o que garante que
      // TF/TG e as contagens do punch continuem valendo exatamente o mesmo.
      qualidade: punch.resumo(pun, hojeISO),
      seguranca: ssma.resumo(ssm, hht),
    },
  };
}

module.exports = { unificar, statusGrupoDe, STATUS_GRUPO, SEVERIDADES };
