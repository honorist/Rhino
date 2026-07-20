'use strict';
/**
 * @file Regras puras da folha de pagamento. Sem I/O — testável com node:test
 * (test/folha.test.js).
 *
 * Extraído do server.js, onde convivia com os handlers e não tinha teste
 * nenhum — apesar de decidir DINHEIRO (valor do vale, desconto de INSS e a data
 * de vencimento do saldo do salário).
 *
 * ATENÇÃO — por que a folha NÃO reusa `lib/feriados.js` inteiro:
 *
 *  1. `feriados.feriadosDoAno` inclui Carnaval e Corpus Christi. Para a folha
 *     eles são PONTOS FACULTATIVOS, não feriados: incluí-los empurraria a data
 *     de pagamento para depois, mudando quando o trabalhador recebe.
 *  2. `feriados.isDiaUtil` trata sábado como não-útil. Na contagem do 5º dia
 *     útil da folha o SÁBADO CONTA (só domingo e feriado não contam).
 *
 * Só a matemática da Páscoa é genuinamente comum, e essa sim é reusada —
 * antes havia uma segunda cópia do algoritmo de Gauss dentro do server.js.
 *
 * CUIDADO com fuso: `easterDate` devolve data em UTC. Usar getters locais
 * (`getMonth`/`getDate`) num Date UTC dá off-by-one em fusos atrás de UTC —
 * no Brasil (UTC−3), `Date.UTC(2026,3,5)` lido com `getDate()` retorna 4.
 * Por isso aqui a aritmética da Sexta-feira Santa é toda em UTC.
 */
const { easterDate } = require('./feriados');

/** Adiantamento (vale) = 40% do salário. */
const VALE_PCT = 0.4;

/** Teto do salário de contribuição do INSS (2026). */
const INSS_TETO = 8475.55;

/**
 * Faixas progressivas do INSS do segurado empregado — tabela 2026 (Portaria
 * Interministerial MPS/MF nº 13). Ao atualizar a tabela, atualize também
 * `_calcInss` em js/views/FolhaPagamento.js, que espelha estes valores para
 * dar preview na tela sem ida ao servidor.
 */
const INSS_FAIXAS = [
  { ate: 1621.0, aliquota: 0.075 },
  { ate: 2902.84, aliquota: 0.09 },
  { ate: 4354.27, aliquota: 0.12 },
  { ate: Infinity, aliquota: 0.14 },
];

const MS_DIA = 86400000;

/**
 * Feriados nacionais que a FOLHA reconhece: os 9 fixos + Sexta-feira Santa.
 * Deliberadamente SEM Carnaval e Corpus Christi (facultativos) — ver o
 * cabeçalho deste arquivo.
 *
 * @param {number} ano
 * @returns {Set<string>} chaves no formato 'MM-DD'
 */
function feriadosFolha(ano) {
  const set = new Set([
    '01-01', // Confraternização Universal
    '04-21', // Tiradentes
    '05-01', // Dia do Trabalho
    '09-07', // Independência
    '10-12', // Nossa Senhora Aparecida
    '11-02', // Finados
    '11-15', // Proclamação da República
    '11-20', // Consciência Negra
    '12-25', // Natal
  ]);
  // Sexta-feira Santa = Páscoa − 2 dias. Aritmética em UTC (ver cabeçalho).
  const sexta = new Date(easterDate(ano).getTime() - 2 * MS_DIA);
  const mm = String(sexta.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(sexta.getUTCDate()).padStart(2, '0');
  set.add(`${mm}-${dd}`);
  return set;
}

/**
 * 5º dia útil do mês SEGUINTE à competência — vencimento do saldo do salário.
 *
 * Nesta contagem o SÁBADO CONTA como dia útil; não contam domingos nem os
 * feriados de `feriadosFolha`. (É a regra da folha, diferente de
 * `feriados.isDiaUtil` — ver o cabeçalho deste arquivo.)
 *
 * @param {string} competencia  'YYYY-MM'
 * @returns {string} data ISO 'YYYY-MM-DD'
 */
function quintoDiaUtil(competencia) {
  const [ano, mes] = String(competencia).split('-').map(Number);
  if (!Number.isFinite(ano) || !Number.isFinite(mes)) {
    throw new Error(`quintoDiaUtil: competência inválida: ${JSON.stringify(competencia)}`);
  }
  // `mes` é 1-12; como índice de mês (0-11) isto já aponta para o mês SEGUINTE.
  // Dezembro (12) vira índice 12, que o Date normaliza para janeiro do ano+1.
  const d = new Date(ano, mes, 1);
  const feriados = feriadosFolha(d.getFullYear());
  let uteis = 0;
  // Teto defensivo: sem ele um bug na condição viraria laço infinito no servidor.
  for (let guarda = 0; guarda < 62; guarda++) {
    const mmdd =
      String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    if (d.getDay() !== 0 && !feriados.has(mmdd)) {
      uteis++;
      if (uteis === 5) {
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${d.getFullYear()}-${mm}-${dd}`;
      }
    }
    d.setDate(d.getDate() + 1);
  }
  throw new Error(`quintoDiaUtil: não encontrou o 5º dia útil para ${competencia}`);
}

/**
 * INSS progressivo do segurado empregado, com teto.
 * Entrada inválida ou não-positiva → 0.
 *
 * @param {unknown} salario
 * @returns {number} desconto em reais (2 casas)
 */
function calcInss(salario) {
  const s = Math.min(parseFloat(salario) || 0, INSS_TETO);
  if (s <= 0) return 0;
  let inss = 0;
  let piso = 0;
  for (const faixa of INSS_FAIXAS) {
    if (s <= piso) break;
    inss += (Math.min(s, faixa.ate) - piso) * faixa.aliquota;
    piso = faixa.ate;
  }
  return Math.round(inss * 100) / 100;
}

/**
 * Valor do adiantamento (vale) de um salário.
 * @param {unknown} salario
 * @param {boolean} elegivel
 * @returns {number}
 */
function calcVale(salario, elegivel) {
  if (!elegivel) return 0;
  const s = parseFloat(salario) || 0;
  if (s <= 0) return 0;
  return Math.round(s * VALE_PCT * 100) / 100;
}

module.exports = {
  VALE_PCT,
  INSS_TETO,
  INSS_FAIXAS,
  feriadosFolha,
  quintoDiaUtil,
  calcInss,
  calcVale,
};
