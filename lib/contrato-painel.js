'use strict';
/**
 * @file Painel da obra — responde "como está esta obra hoje?" e, sobretudo,
 * "o que precisa de mim agora?".
 *
 * Motivo de existir: os seis sinais abaixo JÁ eram calculados no sistema, mas
 * cada um dentro da sua aba (RDO, Punch, SSMA, EVM, Data book, Equipe). Quem
 * abria a obra de manhã precisava passear por seis telas pra descobrir se algo
 * precisava dele — e a aba de aterrissagem mostrava só dinheiro. Aqui os seis
 * viram uma lista ordenada por urgência, cada item com o link pra aba certa JÁ
 * filtrada.
 *
 * Função pura: recebe tudo pronto (inclusive `hojeISO`), não faz I/O e não lê
 * o relógio. Mesmo molde de lib/pendencias.js#calcularCobranca.
 *
 * Regras:
 *  - BR-PAINEL-001: RDO em atraso conta DIAS ÚTEIS via lib/feriados.js, que
 *    conhece feriado nacional. A versão que rodava no cliente
 *    (js/views/contrato/rdos.js) só pulava fim de semana, então acusava atraso
 *    em feriado. Obra que ainda não começou, ou já encerrada, não é cobrada.
 *  - BR-PAINEL-002: SPI/CPI só viram ação quando existe cronograma. Sem etapas
 *    o EVM devolve zeros, e alarmar com isso seria o mesmo erro do "0,00
 *    vermelho" que a aba EVM já evita.
 *  - BR-PAINEL-003: documento de colaborador só conta se a pessoa está NESTA
 *    obra (via organograma) — o painel é da obra, não da empresa.
 */
const feriados = require('./feriados');
const { avaliarMargem } = require('./dre');

/** Ordem de urgência. Define a ordenação da lista de ações. */
const SEVERIDADES = ['critico', 'alto', 'medio', 'baixo'];
const _peso = (s) => {
  const i = SEVERIDADES.indexOf(s);
  return i === -1 ? SEVERIDADES.length : i;
};

/** Documento vencendo dentro desta janela já avisa (mesma régua do RH). */
const DIAS_AVISO_DOC = 30;
/** A partir daqui a entrega está próxima e o data book vira cobrança. */
const DIAS_ENTREGA_PROXIMA = 30;
/** Abaixo disto, SPI/CPI deixam de ser ruído e viram ação. */
const LIMIAR_INDICE = 0.95;

/** Normaliza data vinda do banco: DATE vira string, TIMESTAMPTZ vira Date. */
function isoDia(valor) {
  if (!valor) return null;
  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? null : valor.toISOString().slice(0, 10);
  }
  return String(valor).slice(0, 10);
}

function diasCorridos(deISO, ateISO) {
  const a = isoDia(deISO);
  const b = isoDia(ateISO);
  if (!a || !b) return null;
  const da = new Date(a + 'T12:00:00');
  const db = new Date(b + 'T12:00:00');
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return null;
  return Math.round((db - da) / 86400000);
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Monta uma ação no formato que a tela consome. */
function acao({ id, area, severidade, titulo, detalhe, quantidade, tab, filtro, contractId }) {
  const q = filtro ? `&f=${encodeURIComponent(filtro)}` : '';
  return {
    id,
    area,
    severidade,
    titulo,
    detalhe: detalhe || null,
    quantidade: quantidade ?? null,
    href: `#/contratos/${contractId}?tab=${tab}${q}`,
  };
}

/** Obra fora de execução (não começou, ou já acabou) não é cobrada de nada operacional. */
function emExecucao(contract, hojeISO) {
  const status = String(contract?.status || '').toLowerCase();
  if (['concluido', 'cancelado', 'pausado', 'prospeccao', 'nao_aprovado'].includes(status)) {
    return false;
  }
  const inicio = isoDia(contract?.startDate);
  if (inicio && inicio > hojeISO) return false;
  return true;
}

// ── Sinal 1: RDO (BR-PAINEL-001) ───────────────────────────────────────────
function acaoRdo({ contract, rdos, hojeISO }) {
  if (!emExecucao(contract, hojeISO)) return null;

  const datas = (rdos || []).map((r) => isoDia(r && r.data)).filter(Boolean).sort();
  const ultimo = datas.length ? datas[datas.length - 1] : null;
  const ultDiaUtil = feriados.ultimoDiaUtilAnterior(hojeISO);

  // Hoje sendo fim de semana/feriado, o RDO é ocasional — não se cobra.
  if (!feriados.isDiaUtil(feriados.parseISO(hojeISO))) return null;

  if (!ultimo) {
    return acao({
      id: 'rdo-nenhum',
      area: 'rdo',
      severidade: 'alto',
      titulo: 'Nenhum RDO registrado nesta obra',
      detalhe: 'A obra já começou e ainda não tem diário lançado.',
      quantidade: null,
      tab: 'rdo',
      contractId: contract.id,
    });
  }
  if (ultimo >= ultDiaUtil) return null; // em dia

  const diasUteisSem = feriados.diasUteisEntre(ultimo, hojeISO);
  return acao({
    id: 'rdo-atrasado',
    area: 'rdo',
    severidade: diasUteisSem >= 3 ? 'alto' : 'medio',
    titulo: `${diasUteisSem} dia(s) útil(eis) sem RDO`,
    detalhe: `Último RDO em ${ultimo}.`,
    quantidade: diasUteisSem,
    tab: 'rdo',
    contractId: contract.id,
  });
}

// ── Sinal 2: punch list ────────────────────────────────────────────────────
function acaoPunch({ contract, punchResumo }) {
  const r = punchResumo || {};
  const vencidos = num(r.vencidos);
  const aVencer = num(r.aVencer7d);

  if (vencidos > 0) {
    return acao({
      id: 'punch-vencidos',
      area: 'punch',
      severidade: 'alto',
      titulo: `${vencidos} pendência(s) de qualidade vencida(s)`,
      detalhe: aVencer > 0 ? `Mais ${aVencer} vence(m) em até 7 dias.` : null,
      quantidade: vencidos,
      tab: 'punch',
      filtro: 'vencidos',
      contractId: contract.id,
    });
  }
  if (aVencer > 0) {
    return acao({
      id: 'punch-a-vencer',
      area: 'punch',
      severidade: 'medio',
      titulo: `${aVencer} pendência(s) de qualidade vencem em 7 dias`,
      quantidade: aVencer,
      tab: 'punch',
      filtro: 'aberto',
      contractId: contract.id,
    });
  }
  return null;
}

// ── Sinal 3: SSMA ──────────────────────────────────────────────────────────
function acaoSsma({ contract, ssmaResumo }) {
  const r = ssmaResumo || {};
  const comAfastamento = num(r.comAfastamento);
  if (comAfastamento <= 0) return null;

  const diasPerdidos = num(r.diasPerdidos);
  return acao({
    id: 'ssma-afastamento',
    area: 'ssma',
    severidade: 'critico', // acidente com afastamento é o topo da lista, sempre
    titulo: `${comAfastamento} acidente(s) com afastamento`,
    detalhe: diasPerdidos > 0 ? `${diasPerdidos} dia(s) perdido(s) acumulado(s).` : null,
    quantidade: comAfastamento,
    tab: 'ssma',
    contractId: contract.id,
  });
}

// ── Sinal 4: desempenho EVM (BR-PAINEL-002) ────────────────────────────────
function acoesDesempenho({ contract, evm }) {
  const e = evm || {};
  // Sem etapas cadastradas o EVM devolve zeros — silêncio, não alarme.
  if (!Array.isArray(e.porAtividade) || e.porAtividade.length === 0) return [];

  const out = [];
  const spi = Number(e.spi);
  const cpi = Number(e.cpi);

  if (Number.isFinite(spi) && spi > 0 && spi < LIMIAR_INDICE) {
    out.push(
      acao({
        id: 'evm-spi',
        area: 'prazo',
        severidade: spi < 0.85 ? 'alto' : 'medio',
        titulo: `Obra atrasada (SPI ${spi.toFixed(2)})`,
        detalhe: 'O executado está abaixo do planejado para a data.',
        tab: 'evm',
        contractId: contract.id,
      })
    );
  }
  if (Number.isFinite(cpi) && cpi > 0 && cpi < LIMIAR_INDICE) {
    out.push(
      acao({
        id: 'evm-cpi',
        area: 'custo',
        severidade: cpi < 0.85 ? 'alto' : 'medio',
        titulo: `Custo acima do previsto (CPI ${cpi.toFixed(2)})`,
        detalhe: 'Cada real executado está custando mais que o orçado.',
        tab: 'evm',
        contractId: contract.id,
      })
    );
  }
  return out;
}

// ── Sinal 5: data book ─────────────────────────────────────────────────────
function acaoDatabook({ contract, dataBook, hojeISO }) {
  const d = dataBook || {};
  if (d.pronto !== false) return null;

  // Só cobra perto da entrega: obra no meio da execução não tem "pendência de
  // entrega", tem trabalho pela frente.
  const fim = isoDia(contract?.endDate);
  if (!fim) return null;
  const faltam = diasCorridos(hojeISO, fim);
  if (faltam === null || faltam > DIAS_ENTREGA_PROXIMA) return null;

  const pend = Array.isArray(d.pendencias) ? d.pendencias : [];
  return acao({
    id: 'databook-pendente',
    area: 'databook',
    severidade: faltam < 0 ? 'alto' : 'medio',
    titulo: faltam < 0 ? 'Prazo vencido e obra não está pronta para entrega' : 'Obra não está pronta para entrega',
    detalhe: pend.length ? pend[0] : null,
    quantidade: pend.length || null,
    tab: 'databook',
    contractId: contract.id,
  });
}

// ── Sinal 6: documentos da equipe (BR-PAINEL-003) ──────────────────────────
function acaoDocumentosEquipe({ contract, organograma, recursos, hojeISO }) {
  const daObra = new Set(
    (organograma || []).map((m) => m && m.recursoId).filter(Boolean)
  );
  if (daObra.size === 0) return null;

  const porId = new Map((recursos || []).filter((r) => r && r.id).map((r) => [r.id, r]));
  let vencidos = 0;
  let vencendo = 0;

  for (const recursoId of daObra) {
    const r = porId.get(recursoId);
    if (!r) continue;
    const docs = Array.isArray(r.documentos) ? r.documentos : [];
    for (const doc of docs) {
      const venc = isoDia(doc && doc.dataVencimento);
      if (!venc) continue;
      const dias = diasCorridos(hojeISO, venc);
      if (dias === null) continue;
      if (dias < 0) vencidos += 1;
      else if (dias <= DIAS_AVISO_DOC) vencendo += 1;
    }
  }

  if (vencidos > 0) {
    return acao({
      id: 'equipe-docs-vencidos',
      area: 'equipe',
      severidade: 'alto',
      titulo: `${vencidos} documento(s) vencido(s) na equipe da obra`,
      detalhe: vencendo > 0 ? `Mais ${vencendo} vence(m) em 30 dias.` : null,
      quantidade: vencidos,
      tab: 'equipe',
      contractId: contract.id,
    });
  }
  if (vencendo > 0) {
    return acao({
      id: 'equipe-docs-vencendo',
      area: 'equipe',
      severidade: 'baixo',
      titulo: `${vencendo} documento(s) da equipe vencem em 30 dias`,
      quantidade: vencendo,
      tab: 'equipe',
      contractId: contract.id,
    });
  }
  return null;
}

// ── Retrato da obra ────────────────────────────────────────────────────────
function montarPrazo(contract, hojeISO) {
  const inicio = isoDia(contract?.startDate);
  const fim = isoDia(contract?.endDate);
  const tendencia = isoDia(contract?.tendencyDate);
  const diasRestantes = fim ? diasCorridos(hojeISO, fim) : null;

  // Atraso projetado: quanto a tendência passou do prazo contratual.
  const atrasoDias = fim && tendencia ? Math.max(0, diasCorridos(fim, tendencia) || 0) : 0;

  let status = 'sem_prazo';
  if (fim) {
    if (atrasoDias > 0) status = 'atrasado';
    else if (diasRestantes !== null && diasRestantes < 0) status = 'vencido';
    else if (diasRestantes !== null && diasRestantes <= DIAS_ENTREGA_PROXIMA) status = 'proximo';
    else status = 'no_prazo';
  }
  return { inicio, fim, tendencia, diasRestantes, atrasoDias, status };
}

function montarMargem(dre) {
  const d = dre || {};
  const valor = d.margem ? num(d.margem.valor) : 0;
  const pct = d.margem ? num(d.margem.pct) : 0;
  const recebida = d.receita ? num(d.receita.recebida) : 0;
  const custoTotal = num(d.custoTotal);
  const aval = avaliarMargem({
    margemPct: pct,
    receitaRecebida: recebida,
    custoTotal,
  });
  return {
    valor,
    pct,
    status: aval.status,
    faltamPp: aval.faltamPp,
    faltamValor: aval.faltamValor,
    metaPct: aval.metaPct,
  };
}

function montarFaturamento(dre, contract) {
  const d = dre || {};
  return {
    contratado: num(d.contractValue ?? contract?.value),
    medido: d.receita ? num(d.receita.medida) : 0,
    // `emitido` é sinônimo de medido no DRE (base caixa não distingue os dois);
    // fica explícito pra tela não precisar adivinhar.
    emitido: d.receita ? num(d.receita.medida) : 0,
    recebido: d.receita ? num(d.receita.recebida) : 0,
    aMedir: d.saldoAMedir ? num(d.saldoAMedir.valor) : 0,
  };
}

/**
 * @param {object} entrada  Tudo já carregado — sem I/O aqui dentro.
 * @returns {{obra:object, acoes:object[], indicadores:object}}
 */
function calcularPainel(entrada) {
  const i = entrada || {};
  const contract = i.contract || {};
  const hojeISO = i.hojeISO || new Date().toISOString().slice(0, 10);

  const acoes = [
    acaoRdo({ contract, rdos: i.rdos, hojeISO }),
    acaoPunch({ contract, punchResumo: i.punchResumo }),
    acaoSsma({ contract, ssmaResumo: i.ssmaResumo }),
    ...acoesDesempenho({ contract, evm: i.evm }),
    acaoDatabook({ contract, dataBook: i.dataBook, hojeISO }),
    acaoDocumentosEquipe({
      contract,
      organograma: i.organograma,
      recursos: i.recursos,
      hojeISO,
    }),
  ]
    .filter(Boolean)
    .sort((a, b) => _peso(a.severidade) - _peso(b.severidade));

  const avanco = i.avanco || { pct: null, base: 'sem_dados' };
  const evm = i.evm || {};
  const punch = i.punchResumo || {};
  const ssma = i.ssmaResumo || {};
  const dataBook = i.dataBook || {};

  return {
    contractId: contract.id || null,
    contractName: contract.name || null,
    geradoEm: hojeISO,
    obra: {
      avancoFisico: { pct: avanco.pct ?? null, base: avanco.base || 'sem_dados' },
      prazo: montarPrazo(contract, hojeISO),
      margem: montarMargem(i.dre),
      faturamento: montarFaturamento(i.dre, contract),
    },
    acoes,
    indicadores: {
      spi: Number.isFinite(Number(evm.spi)) ? Number(evm.spi) : null,
      cpi: Number.isFinite(Number(evm.cpi)) ? Number(evm.cpi) : null,
      tf: ssma.tf ?? null,
      tg: ssma.tg ?? null,
      punch: {
        total: num(punch.total),
        abertos: num(punch.abertos),
        vencidos: num(punch.vencidos),
        aVencer7d: num(punch.aVencer7d),
      },
      ssma: {
        total: num(ssma.total),
        comAfastamento: num(ssma.comAfastamento),
        diasPerdidos: num(ssma.diasPerdidos),
      },
      databook: {
        pronto: dataBook.pronto ?? null,
        pendencias: Array.isArray(dataBook.pendencias) ? dataBook.pendencias.length : 0,
      },
    },
  };
}

module.exports = {
  calcularPainel,
  SEVERIDADES,
  DIAS_AVISO_DOC,
  DIAS_ENTREGA_PROXIMA,
  LIMIAR_INDICE,
};
