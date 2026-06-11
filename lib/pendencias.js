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

// Normaliza data vinda do banco: TIMESTAMPTZ chega como objeto Date (node-pg),
// DATE chega como string 'YYYY-MM-DD'. Devolve 'YYYY-MM-DD' ou null.
function isoDia(valor) {
  if (!valor) return null;
  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? null : valor.toISOString().slice(0, 10);
  }
  return String(valor).slice(0, 10);
}

// Dias corridos entre uma data-base (ISO ou timestamp) e hoje ('YYYY-MM-DD').
function diasCorridos(baseISO, hojeISO) {
  const baseDia = isoDia(baseISO);
  if (!baseDia || !hojeISO) return null;
  const base = new Date(baseDia + 'T12:00:00');
  const hoje = new Date(hojeISO + 'T12:00:00');
  if (Number.isNaN(base.getTime()) || Number.isNaN(hoje.getTime())) return null;
  return Math.floor((hoje - base) / 86400000);
}

// 5º dia útil do mês seguinte à competência 'YYYY-MM' — vencimento do saldo
// da folha. Sábado conta como útil; domingo e feriado nacional não (mesma
// regra do quintoDiaUtil do server.js). Datas em UTC para casar com o
// toISOString() do lib/feriados.
function vencimentoSaldoFolha(competencia) {
  const [ano, mes] = String(competencia || '')
    .split('-')
    .map(Number);
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
  const d = new Date(isoDia(iso) + 'T12:00:00');
  d.setDate(d.getDate() + (dias || 0));
  return feriados.toISO(d);
}

// Soma meses no estilo do JS: dia 31 + mês de 28/30 dias "transborda" para o
// início do mês seguinte (setMonth nativo) — aceitável, a regra é "venceu?".
function addMeses(iso, meses) {
  const d = new Date(isoDia(iso) + 'T12:00:00');
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

function pendenciasRH({ hojeISO, solicitacoes = [], vagas = [], candidatos = [], folha = [] }) {
  const out = [];

  // Candidatos parados no funil. Dedup: no máximo UMA pendência por candidato —
  // a mais específica vence (aguardando documentos > parado no funil).
  for (const c of candidatos) {
    if (!CANDIDATO_EM_ANDAMENTO.includes(c.status)) continue;
    const docs = c.documentos || {};
    const faltamDocs = DOCS_OBRIGATORIOS.some((t) => !docs[t]);
    // "Aguardando documentos" só após antecedentes ok: antes disso a próxima
    // ação é destravar a triagem/antecedentes, não cobrar docs.
    const aguardaDoc = c.status === 'interessado' && c.antecedentesStatus === 'ok' && faltamDocs;
    const pend = montarPendencia({
      titulo: aguardaDoc
        ? `Candidato ${c.nome} aguardando documentos`
        : `Candidato ${c.nome} parado no funil (${c.status})`,
      base: c.updatedAt,
      hojeISO,
      proximaAcao: aguardaDoc ? 'Cobrar/validar documentos' : 'Avançar triagem/antecedentes',
      href: '#/recrutamento',
    });
    if (pend) out.push(pend);
  }

  // Vaga (solicitação de contratação) aberta sem nenhum candidato em andamento.
  // Vaga com candidato andando não é pendência por si só — o candidato é que é.
  const vagasPorSolicitacao = {};
  for (const v of vagas) {
    if (!vagasPorSolicitacao[v.solicitacaoId]) vagasPorSolicitacao[v.solicitacaoId] = [];
    vagasPorSolicitacao[v.solicitacaoId].push(v);
  }
  const vagasComCandidato = new Set();
  for (const c of candidatos) {
    if (CANDIDATO_EM_ANDAMENTO.includes(c.status)) vagasComCandidato.add(c.vagaId);
  }
  for (const s of solicitacoes) {
    if (s.status !== 'aberta') continue;
    const vs = vagasPorSolicitacao[s.id] || [];
    if (vs.some((v) => vagasComCandidato.has(v.id))) continue;
    const cargo = vs[0] && vs[0].cargo ? ` (${vs[0].cargo})` : '';
    const pend = montarPendencia({
      titulo: `Vaga aberta sem candidato${cargo}`,
      base: s.createdAt,
      hojeISO,
      proximaAcao: 'Buscar candidatos',
      href: '#/recrutamento',
    });
    if (pend) out.push(pend);
  }

  // Folha vencida: agregada por competência (cobrança é em lote, não por pessoa).
  const pendentesPorCompetencia = {};
  for (const f of folha) {
    const valePendente = (parseFloat(f.valorVale) || 0) > 0 && !f.valePago;
    if (!f.saldoPago || valePendente) {
      pendentesPorCompetencia[f.competencia] = (pendentesPorCompetencia[f.competencia] || 0) + 1;
    }
  }
  for (const [comp, n] of Object.entries(pendentesPorCompetencia)) {
    const pend = montarPendencia({
      titulo: `Folha ${comp}: ${n} pagamento(s) pendente(s)`,
      base: vencimentoSaldoFolha(comp),
      hojeISO,
      proximaAcao: 'Pagar folha',
      href: '#/folha-pagamento',
    });
    if (pend) out.push(pend);
  }

  return out;
}

function pendenciasObras({ hojeISO, nfs = [], contratos = [], ultimoRdoPorContrato = {} }) {
  const out = [];

  // NFs (medições/BM): não emitida com prazo vencido, ou emitida cujo
  // recebimento previsto (dataEmissaoReal + prazoRecebimento) já passou.
  // nf.emitida sem dataEmissaoReal: dados incompletos — ignorada de propósito
  // (sem base para calcular o recebimento previsto).
  for (const nf of nfs) {
    if (!nf.emitida && nf.dataLimite && nf.dataLimite < hojeISO) {
      const pend = montarPendencia({
        titulo: `NF ${nf.numero} não emitida (prazo vencido)`,
        base: nf.dataLimite,
        hojeISO,
        proximaAcao: 'Emitir NF',
        href: '#/notas-fiscais',
      });
      if (pend) out.push(pend);
    } else if (nf.emitida && nf.dataEmissaoReal && nf.prazoRecebimento != null) {
      const prevista = addDias(nf.dataEmissaoReal, nf.prazoRecebimento);
      if (prevista < hojeISO) {
        const pend = montarPendencia({
          titulo: `NF ${nf.numero} — recebimento previsto vencido`,
          base: prevista,
          hojeISO,
          proximaAcao: 'Cobrar o cliente',
          href: '#/notas-fiscais',
        });
        if (pend) out.push(pend);
      }
    }
  }

  // RDO é diário por obra ativa. Aqui diasParado é em DIAS ÚTEIS (mesma régua
  // do painel de aderência) — limiares 3/7 aplicam igual.
  for (const c of contratos) {
    if (c.status !== 'ativo') continue;
    const base = ultimoRdoPorContrato[c.id] || isoDia(c.createdAt);
    if (!base) continue;
    const diasUteis = feriados.diasUteisEntre(base, hojeISO);
    if (diasUteis == null || diasUteis < DIAS_AMARELO) continue;
    out.push({
      titulo: `Obra ${c.name} sem RDO há ${diasUteis} dia(s) útil(eis)`,
      diasParado: diasUteis,
      proximaAcao: 'Preencher RDO',
      href: `#/contratos/${c.id}`,
    });
  }

  return out;
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

function pendenciasFrota({ hojeISO, manutencoes = [], veiculos = [], veiculoPlanos = [] }) {
  const out = [];

  // Manutenções de equipamento paradas no fluxo de aprovação.
  for (const m of manutencoes) {
    const situacao = MANUTENCAO_PARADA[m.status];
    if (!situacao) continue;
    const pend = montarPendencia({
      titulo: `Manutenção de ${m.equipamento} ${situacao}`,
      base: m.updatedAt,
      hojeISO,
      proximaAcao: situacao === 'aguardando avaliação' ? 'Avaliar (compras)' : 'Aprovar (gerência)',
      href: '#/manutencao',
    });
    if (pend) out.push(pend);
  }

  // Planos de revisão por prazo (intervaloMeses). Planos só por km ficam fora:
  // km não se converte em "dias parado".
  const placaPorVeiculo = {};
  for (const v of veiculos) placaPorVeiculo[v.id] = v.placa || v.modelo || v.id;
  for (const pl of veiculoPlanos) {
    if (pl.ativo === false || !pl.intervaloMeses || !pl.ultimaData) continue;
    const vencimento = addMeses(pl.ultimaData, pl.intervaloMeses);
    if (vencimento >= hojeISO) continue;
    const pend = montarPendencia({
      titulo: `Revisão "${pl.descricao}" vencida — ${placaPorVeiculo[pl.veiculoId] || 'veículo'}`,
      base: vencimento,
      hojeISO,
      proximaAcao: 'Agendar revisão',
      href: '#/frota',
    });
    if (pend) out.push(pend);
  }

  return out;
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
