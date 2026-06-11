'use strict';
/**
 * @file Regra do painel "Cobrança por área" do Dashboard — o que está parado
 * em cada área (RH, Obras, Financeiro, Frota), há quantos dias e qual a
 * próxima ação. Funções puras: recebem listas + hoje, sem DB e sem relógio.
 *
 * Nome `pendencias` (e não `cobranca`) para não colidir com a view
 * CobrancaMensal (#/cobranca — mensalidade de clientes).
 */
const feriados = require('./feriados');
const { DOCS_OBRIGATORIOS } = require('./recrutamento-docs');

// Semáforo por dias parado: a pendência mais antiga define a cor da área.
const DIAS_VERMELHO = 7; // ≥7 dias → vermelho
const DIAS_AMARELO = 3; // 3–6 → amarelo; itens com <3 dias nem entram na lista

const CANDIDATO_EM_ANDAMENTO = ['contatado', 'interessado'];
const MANUTENCAO_PARADA = {
  solicitada: 'aguardando avaliação',
  pendente_aprovacao: 'aguardando aprovação',
};

// Dias corridos entre uma data-base (ISO ou timestamp) e hoje ('YYYY-MM-DD').
function diasCorridos(baseISO, hojeISO) {
  if (!baseISO || !hojeISO) return null;
  const base = new Date(String(baseISO).slice(0, 10) + 'T12:00:00');
  const hoje = new Date(hojeISO + 'T12:00:00');
  if (Number.isNaN(base.getTime()) || Number.isNaN(hoje.getTime())) return null;
  return Math.floor((hoje - base) / 86400000);
}

// 5º dia útil do mês seguinte à competência 'YYYY-MM' — vencimento do saldo
// da folha. Sábado conta como útil; domingo e feriado nacional não (mesma
// regra do quintoDiaUtil do server.js). Datas em UTC para casar com o
// toISOString() do lib/feriados.
function vencimentoSaldoFolha(competencia) {
  const [ano, mes] = String(competencia || '').split('-').map(Number);
  if (!ano || !mes) return null;
  const d = new Date(Date.UTC(ano, mes, 1)); // mes é 1-12 → índice = mês seguinte
  let uteis = 0;
  for (;;) {
    if (d.getUTCDay() !== 0 && !feriados.isFeriado(d)) {
      uteis++;
      if (uteis === 5) break;
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return feriados.toISO(d);
}

function addDias(iso, dias) {
  const d = new Date(String(iso).slice(0, 10) + 'T12:00:00');
  d.setDate(d.getDate() + (dias || 0));
  return feriados.toISO(d);
}

function addMeses(iso, meses) {
  const d = new Date(String(iso).slice(0, 10) + 'T12:00:00');
  d.setMonth(d.getMonth() + (meses || 0));
  return feriados.toISO(d);
}

// Monta a pendência se já estiver parada há ≥ DIAS_AMARELO; senão null.
function montarPendencia({ titulo, base, hojeISO, proximaAcao, href }) {
  const dias = diasCorridos(base, hojeISO);
  if (dias === null || dias < DIAS_AMARELO) return null;
  return { titulo, diasParado: dias, proximaAcao, href };
}

function fecharArea(id, nome, pendencias) {
  const lista = pendencias.slice().sort((a, b) => b.diasParado - a.diasParado);
  let cor = 'verde';
  if (lista.length) cor = lista[0].diasParado >= DIAS_VERMELHO ? 'vermelho' : 'amarelo';
  return { id, nome, cor, pendencias: lista };
}

function pendenciasRH() {
  return []; // Task 2
}

function pendenciasObras() {
  return []; // Task 3
}

function pendenciasFinanceiro({ hojeISO, contas = [] }) {
  const out = [];
  for (const c of contas) {
    if (c.status !== 'pendente' || !c.dataVencimento || c.dataVencimento >= hojeISO) continue;
    const p = montarPendencia({
      titulo: `Conta "${c.descricao || 'sem descrição'}" vencida`,
      base: c.dataVencimento,
      hojeISO,
      proximaAcao: 'Pagar ou renegociar',
      href: '#/contas-pagar',
    });
    if (p) out.push(p);
  }
  return out;
}

function pendenciasFrota() {
  return []; // Task 4
}

function calcularCobranca(input) {
  const i = Object.assign({}, input);
  if (!i.hojeISO) i.hojeISO = new Date().toISOString().slice(0, 10);
  return {
    areas: [
      fecharArea('rh', 'RH', pendenciasRH(i)),
      fecharArea('obras', 'Obras', pendenciasObras(i)),
      fecharArea('financeiro', 'Financeiro', pendenciasFinanceiro(i)),
      fecharArea('frota', 'Frota', pendenciasFrota(i)),
    ],
  };
}

module.exports = {
  DIAS_VERMELHO,
  DIAS_AMARELO,
  diasCorridos,
  vencimentoSaldoFolha,
  calcularCobranca,
};
