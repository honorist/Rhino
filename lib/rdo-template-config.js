'use strict';
/**
 * @file Constantes e helpers do template do RDO (modelo Passarelli / HH).
 * Mantém o estilo visual do documento em um só lugar. Espelha o papel de
 * lib/proposta-template-config.js, mas o formulário do RDO é DESENHADO no
 * código (sem imagem de fundo).
 */
const path = require('path');

module.exports = {
  EMPRESA: {
    NOME: 'Rhino Construções e Montagens',
  },
  LOGO: {
    PATH: path.join(__dirname, '..', 'assets', 'logo-rhino.jpg'),
    PATH_FALLBACK: path.join(__dirname, '..', 'assets', 'logo.png'),
  },
  CORES: {
    TITULO: '#1F497D',      // azul corporativo (cabeçalhos de seção)
    HEADER_BG: '#1F497D',   // fundo do header de tabela
    LINHA: '#C9CED6',       // bordas
    ZEBRA: '#F2F5F9',       // linha alternada
    TOTAL_BG: '#E3EAF4',    // linha de total
    TEXTO: '#222222',
    CINZA: '#666666',
  },
  /**
   * Legenda de condição climática (escala 1–4 do formulário Passarelli).
   */
  CLIMA_LEGENDA: [
    { i: 1, l: 'Bom' },
    { i: 2, l: 'Chuva/Vento Praticável' },
    { i: 3, l: 'Chuva/Vento Impraticável' },
    { i: 4, l: 'Molhado Prejudicado' },
  ],
  /**
   * Mapeia o clima do modelo antigo do Rhino (tempo + condições da área) para o
   * índice 1–4 do formulário. Retorna '' quando não houve expediente.
   * @param {{tempo?:string, condicoes?:string, indice?:number}} periodo
   * @returns {number|''}
   */
  climaIndice(periodo) {
    if (!periodo) return '';
    if (periodo.indice) return Number(periodo.indice);
    const t = periodo.tempo || '';
    const c = periodo.condicoes || '';
    if (t === 'sem_expediente' || t === 'nao_houve') return '';
    if (t === 'bom' || t === 'nublado') return 1;
    if (t === 'chuva') {
      if (c === 'inoperavel') return 3;
      return 2;
    }
    return 1;
  },
  /** Formata "YYYY-MM-DD" → "DD/MM/AAAA". */
  fmtData(iso) {
    if (!iso) return '';
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return String(iso);
    return `${m[3]}/${m[2]}/${m[1]}`;
  },
  /** Número com até 2 casas, sem zeros à direita (8 → "8", 8.5 → "8,5"). */
  fmtNum(n) {
    const r = Math.round((Number(n) || 0) * 100) / 100;
    return (Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/\.?0+$/, '')).replace('.', ',');
  },
};
