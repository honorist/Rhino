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
    // Logo extraída do Template.docx oficial Rhino (alta resolução)
    // Fallback para PNG se JPG não estiver presente
    PATH: path.join(__dirname, '..', 'assets', 'logo-rhino.jpg'),
    PATH_FALLBACK: path.join(__dirname, '..', 'assets', 'logo.png'),
    // Dimensões para o header do DOCX (px). Mantém proporção da logo Rhino vermelha.
    WIDTH_PX: 150,
    HEIGHT_PX: 60,
  },
  /**
   * Caminho do template DOTX/DOCX que serve de base para todas as propostas.
   * Contém header (logo + dados), footer (numeração), estilos e theme oficiais
   * da Rhino. O gerador apenas substitui o body do document.xml — todo o resto
   * é preservado intacto.
   */
  TEMPLATE_BASE_PATH: path.join(__dirname, '..', 'assets', 'proposta-template-base.docx'),
  CORES: {
    // Cores extraídas do theme1.xml do Template.docx Rhino oficial
    TITULO: '1F497D',          // azul escuro corporativo (Office theme accent1)
    TABELA_HEADER: '4F81BD',   // azul médio (accent1 derivado)
    TABELA_ALT: 'F2F2F2',      // cinza claro alternado
    RHINO_VERMELHO: 'C0504D',  // vermelho da marca (theme accent2)
    DESTAQUE: '9BBB59',        // verde (theme accent3)
    LARANJA: 'F79646',         // laranja (theme accent6)
  },
  FONTES: {
    // Fontes extraídas dos estilos do Template.docx
    // Ttulo1 (títulos de seção): Trebuchet MS Bold
    // Corpodetexto (corpo): Arial MT (fallback Arial)
    // PargrafodaLista (bullets): Tahoma
    TITULO: 'Trebuchet MS',
    CORPO: 'Arial MT',
    CORPO_FALLBACK: 'Arial',
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
  /**
   * Tokens que devem aparecer SEMPRE em NEGRITO MAIÚSCULO nos documentos.
   * Padrão jurídico/comercial brasileiro para destacar as partes do contrato.
   */
  TOKENS_NEGRITO_MAIUSCULO: [
    'contratada', 'contratadas',
    'contratante', 'contratantes',
    'rhino manutenções', 'rhino',
  ],
  /**
   * Quebra um texto em segmentos onde tokens como "Contratada" / "Contratante"
   * ficam isolados para serem renderizados em negrito maiúsculo.
   *
   * @param {string} texto
   * @returns {Array<{ text: string, highlight: boolean }>}
   */
  segmentarComDestaque(texto) {
    if (!texto) return [];
    // Regex que captura os tokens (case-insensitive, com word boundaries)
    const tokens = ['CONTRATANTES?', 'CONTRATADAS?'].join('|');
    const re = new RegExp(`\\b(${tokens})\\b`, 'gi');
    const segs = [];
    let lastIdx = 0;
    let m;
    while ((m = re.exec(texto)) !== null) {
      if (m.index > lastIdx) {
        segs.push({ text: texto.slice(lastIdx, m.index), highlight: false });
      }
      segs.push({ text: m[1].toUpperCase(), highlight: true });
      lastIdx = m.index + m[1].length;
    }
    if (lastIdx < texto.length) {
      segs.push({ text: texto.slice(lastIdx), highlight: false });
    }
    return segs.length === 0 ? [{ text: texto, highlight: false }] : segs;
  },
};
