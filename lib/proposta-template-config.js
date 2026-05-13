/**
 * @file Constantes do template da proposta Rhino — dados FIXOS da empresa.
 *
 * Edite aqui para alterar identidade visual / contatos / signatário padrão.
 * Cada proposta pode sobrescrever signatário e signatário_cargo individualmente.
 */
const path = require('path');

module.exports = {
  EMPRESA: {
    NOME: 'Rhino Manutenções',
    EMAIL: 'rhinomanutencoes@gmail.com',
    TELEFONE: '67 99967-0207',
    CIDADE: 'Três Lagoas',
    UF: 'MS',
    CIDADE_UF: 'Três Lagoas/MS',
    FORO: 'Três Lagoas/MS',
  },
  SIGNATARIO_PADRAO: {
    NOME: 'Deyvison Veloso',
    CARGO: 'Diretor',
  },
  LOGO: {
    PATH: path.join(__dirname, '..', 'assets', 'logo.png'),
    // Dimensões em twips (1 cm = 567 twips) — logo ~3cm largura, 1.5cm altura
    WIDTH_PX: 120,
    HEIGHT_PX: 60,
  },
  CORES: {
    TITULO: '1F497D',        // azul escuro (sem #)
    TABELA_HEADER: '4F81BD', // azul médio
    TABELA_ALT: 'F2F2F2',    // cinza claro alternado
    RHINO_VERMELHO: 'C0504D', // detalhe da marca
    DESTAQUE: '9BBB59',      // verde sucesso (totais positivos)
  },
  FONTES: {
    TITULO: 'Trebuchet MS',
    CORPO: 'Arial',
    BULLET: 'Tahoma',
  },
  TAMANHOS: {
    TITULO_PT: 12,
    CORPO_PT: 11,
    PEQUENO_PT: 9,
  },
  PADRAO: {
    SAUDACAO: 'Em atendimento à solicitação de fornecimento, a Rhino Manutenções apresenta a seguinte proposta comercial para sua apreciação.',
    ENCERRAMENTO: 'Sem mais para o momento, ficamos ao vosso inteiro dispor para quaisquer esclarecimentos que se fizerem necessários.',
    CONDICOES_PAGAMENTO: '20% (vinte por cento) na mobilização, mediante apresentação de nota fiscal; 65% (sessenta e cinco por cento) conforme cronograma de medições aprovadas; 15% (quinze por cento) na entrega final e aceite técnico dos serviços.',
    VALIDADE_DIAS: 15,
  },
  /**
   * Formata data ISO (YYYY-MM-DD) como "DD de mês de AAAA" (pt-BR).
   */
  formatDataExtenso(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso + 'T00:00:00');
      const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
      return `${String(d.getDate()).padStart(2,'0')} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
    } catch { return iso; }
  },
  /**
   * Número completo da proposta no formato "PC_NN-AA Rev.NN".
   */
  formatNumeroCompleto(p) {
    const base = `PC_${p.numero}-${String(p.ano).padStart(2,'0')}`;
    return p.revisao > 0 ? `${base} Rev.${String(p.revisao).padStart(2,'0')}` : base;
  },
  /**
   * Formata BRL: 1234.56 → "R$ 1.234,56"
   */
  fmtBRL(v) {
    const n = Number(v) || 0;
    return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },
};
