'use strict';
/**
 * @file Regras puras do BM estruturado (medição por itens sobre a planilha de
 * serviços do contrato). Sem I/O — testável com node:test (test/medicao.test.js).
 *
 * Regras (definidas com o usuário em 2026-07-20):
 *  - BR-MED-001: medição nunca ultrapassa o saldo contratado do serviço
 *    (excedente entra via aditivo que aumenta a qtd contratada).
 *  - BR-MED-002: preço unitário é SNAPSHOT do serviço no momento da medição.
 *  - BR-MED-003: retenção é um % fixo do contrato (`contracts.retencao_percent`,
 *    campo que já existia) aplicado a todo BM; o valor retido é sempre derivado
 *    (valor × pct), nunca armazenado — só o pct vira snapshot na NF.
 *  - BR-MED-004: saída com itens de medição tem valor derivado dos itens —
 *    o valor não pode ser editado diretamente.
 *  - BR-MED-005: qtd contratada de um serviço não pode ficar abaixo do já medido.
 *
 * Resultado de negócio como objeto ({ ok, errors }) — exceção é pra violação,
 * não pra ramo esperado (steering §5).
 */
const money = require('./money');

/** Tolerância de comparação de quantidades (3 casas decimais no banco). */
const QTD_EPS = 0.0005;

/** Arredonda quantidade para 3 casas (espelho do NUMERIC(15,3)). */
function roundQtd(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round((x + Number.EPSILON) * 1000) / 1000;
}

/**
 * Acumula a qtd medida por serviço a partir de linhas de `medicao_itens`.
 * @param {Array<{servicoId: string, qtd: unknown}>} itens
 * @returns {Record<string, number>} servicoId → qtd acumulada
 */
function acumularMedido(itens) {
  const acc = {};
  for (const item of Array.isArray(itens) ? itens : []) {
    if (!item || !item.servicoId) continue;
    acc[item.servicoId] = roundQtd((acc[item.servicoId] || 0) + (parseFloat(item.qtd) || 0));
  }
  return acc;
}

/**
 * Valida e calcula uma medição por itens (BR-MED-001/002).
 *
 * @param {object} params
 * @param {Array<{servicoId: string, qtd: unknown}>} params.itens    Itens pedidos.
 * @param {Array<object>} params.servicos                            Planilha do contrato.
 * @param {Record<string, number>} [params.medidoPorServico]         Acumulado atual.
 * @returns {{ ok: false, errors: {field: string, msg: string}[] } |
 *           { ok: true, itens: {servicoId: string, qtd: number, precoUnit: number, valor: number}[], total: number }}
 */
function computeMedicao({ itens, servicos, medidoPorServico = {} }) {
  const errors = [];
  if (!Array.isArray(itens) || itens.length === 0) {
    return { ok: false, errors: [{ field: 'itens', msg: 'itens: informe ao menos um serviço medido' }] };
  }
  const porId = new Map((servicos || []).map((s) => [s.id, s]));
  const vistos = new Set();
  const out = [];

  for (const item of itens) {
    const sid = item && item.servicoId;
    if (!sid || typeof sid !== 'string') {
      errors.push({ field: 'itens', msg: 'itens: servicoId é obrigatório em cada item' });
      continue;
    }
    if (vistos.has(sid)) {
      errors.push({ field: 'itens', msg: `itens: serviço repetido na mesma medição (${sid})` });
      continue;
    }
    vistos.add(sid);

    const servico = porId.get(sid);
    if (!servico) {
      errors.push({ field: 'itens', msg: `itens: serviço não encontrado na planilha do contrato (${sid})` });
      continue;
    }
    if (servico.ativo === false) {
      errors.push({ field: 'itens', msg: `itens: serviço inativo não pode ser medido (${servico.descricao})` });
      continue;
    }

    const qtd = roundQtd(parseFloat(item.qtd));
    if (!Number.isFinite(parseFloat(item.qtd)) || qtd <= 0) {
      errors.push({ field: 'itens', msg: `itens: quantidade deve ser maior que zero (${servico.descricao})` });
      continue;
    }

    // BR-MED-001: bloqueia excedente sobre o saldo contratado.
    const contratada = roundQtd(parseFloat(servico.qtdContratada) || 0);
    const medido = roundQtd(medidoPorServico[sid] || 0);
    const saldo = roundQtd(contratada - medido);
    if (qtd > saldo + QTD_EPS) {
      errors.push({
        field: 'itens',
        msg: `itens: medição ultrapassa o saldo contratado de "${servico.descricao}" — saldo disponível: ${saldo} ${servico.unidade || 'un'}. Excedente entra via aditivo.`,
      });
      continue;
    }

    // BR-MED-002: snapshot do preço do serviço no momento da medição.
    const precoUnit = money.parse(servico.precoUnit);
    out.push({ servicoId: sid, qtd, precoUnit, valor: money.round2(qtd * precoUnit) });
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, itens: out, total: money.sum(out, (i) => i.valor) };
}

/**
 * Saldo por serviço da planilha (contratado × medido acumulado).
 *
 * `valorMedidoPorServico` é a soma dos **snapshots** (`medicao_itens.valor`).
 * Sem ele, o valor medido seria recalculado por `qtd × preço ATUAL` — e um
 * reajuste da planilha reescreveria retroativamente o que já foi faturado,
 * violando BR-MED-002: a tela passaria a mostrar um valor medido que não existe
 * em BM nenhum. `valorContratado`/`saldoValor` seguem no preço vigente de
 * propósito: reprecificar o saldo *a executar* é o comportamento correto.
 *
 * @param {Array<object>} servicos
 * @param {Record<string, number>} medidoPorServico        servicoId → qtd acumulada
 * @param {Record<string, number>|null} valorMedidoPorServico  servicoId → Σ snapshots
 * @returns {Array<object>} planilha enriquecida com qtdMedida/saldoQtd/valores/avancoPct
 */
function saldoPorServico(servicos, medidoPorServico = {}, valorMedidoPorServico = null) {
  return (servicos || []).map((s) => {
    const contratada = roundQtd(parseFloat(s.qtdContratada) || 0);
    const preco = money.parse(s.precoUnit);
    const medida = roundQtd(medidoPorServico[s.id] || 0);
    const valorContratado = money.round2(contratada * preco);
    const valorMedido = valorMedidoPorServico
      ? money.round2(valorMedidoPorServico[s.id] || 0)
      : money.round2(medida * preco);
    return {
      ...s,
      qtdMedida: medida,
      saldoQtd: roundQtd(contratada - medida),
      valorContratado,
      valorMedido,
      saldoValor: money.round2(valorContratado - valorMedido),
      avancoPct: contratada > 0 ? money.round2((medida / contratada) * 100) : 0,
    };
  });
}

/**
 * Retenção contratual sobre um valor de BM (BR-MED-003).
 * Percentual inválido ou fora de [0,100] → 0 (sem retenção).
 * @param {unknown} valor
 * @param {unknown} retencaoPct
 * @returns {{ pct: number, retencao: number, liquido: number }}
 */
function computeRetencao(valor, retencaoPct) {
  const v = money.parse(valor);
  let pct = parseFloat(retencaoPct);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) pct = 0;
  const retencao = money.round2((v * pct) / 100);
  return { pct, retencao, liquido: money.round2(v - retencao) };
}

/**
 * BR-MED-004: uma saída estruturada (com itens de medição) não admite edição
 * direta de valor — o valor deriva dos itens.
 * @param {{ value?: unknown }} mudancas   Campos do PUT (já validados).
 * @param {number} valorAtual              Valor atual da saída.
 * @param {boolean} temItens               A saída possui medicao_itens?
 * @returns {{ ok: boolean, msg?: string }}
 */
function podeEditarSaida(mudancas, valorAtual, temItens) {
  if (!temItens) return { ok: true };
  const valorMudou =
    mudancas.value !== undefined &&
    Math.abs(parseFloat(mudancas.value) - (parseFloat(valorAtual) || 0)) > 0.001;
  if (valorMudou) {
    return {
      ok: false,
      msg: 'Saída de medição estruturada: o valor é calculado pelos itens medidos. Exclua a medição e lance novamente.',
    };
  }
  return { ok: true };
}

/**
 * BR-MED-005: valida alteração de um serviço da planilha contra o já medido.
 * @param {object} servico            Serviço atual.
 * @param {number} medidoAcumulado    Qtd já medida do serviço.
 * @param {object} mudancas           Campos do PUT (camelCase, já validados).
 * @returns {{ ok: boolean, errors: {field: string, msg: string}[] }}
 */
function validarServicoUpdate(servico, medidoAcumulado, mudancas) {
  const errors = [];
  if (mudancas.qtdContratada !== undefined) {
    const nova = roundQtd(parseFloat(mudancas.qtdContratada) || 0);
    const medido = roundQtd(medidoAcumulado || 0);
    if (nova + QTD_EPS < medido) {
      errors.push({
        field: 'qtdContratada',
        msg: `qtdContratada: não pode ficar abaixo do já medido (${medido} ${servico.unidade || 'un'})`,
      });
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Um serviço com medição acumulada não pode ser excluído (inativar em vez disso).
 * @param {number} medidoAcumulado
 * @returns {boolean}
 */
function podeExcluirServico(medidoAcumulado) {
  return roundQtd(medidoAcumulado || 0) <= QTD_EPS;
}

module.exports = {
  QTD_EPS,
  roundQtd,
  acumularMedido,
  computeMedicao,
  saldoPorServico,
  computeRetencao,
  podeEditarSaida,
  validarServicoUpdate,
  podeExcluirServico,
};
