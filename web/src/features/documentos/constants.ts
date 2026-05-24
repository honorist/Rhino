/** Tipos de documento padrão e sua periodicidade (meses). Porte de Frota.js. */
export interface TipoDoc {
  key: string;
  label: string;
  full: string;
  meses: number;
}

export const TIPOS_DOC: TipoDoc[] = [
  { key: 'ASO', label: 'ASO', full: 'Atestado de Saúde Ocupacional', meses: 12 },
  { key: 'PGR', label: 'PGR', full: 'Prog. Gerenciamento de Riscos', meses: 24 },
  { key: 'PCMSO', label: 'PCMSO', full: 'Prog. Controle Médico de Saúde', meses: 12 },
  { key: 'NR10', label: 'NR-10', full: 'Segurança em Eletricidade', meses: 24 },
  { key: 'NR12', label: 'NR-12', full: 'Segurança em Máquinas', meses: 24 },
  { key: 'NR18', label: 'NR-18', full: 'Construção Civil', meses: 12 },
  { key: 'NR20', label: 'NR-20', full: 'Líquidos Combustíveis', meses: 12 },
  { key: 'NR33', label: 'NR-33', full: 'Espaço Confinado', meses: 12 },
  { key: 'NR35', label: 'NR-35', full: 'Trabalho em Altura', meses: 24 },
  { key: 'CIPA', label: 'CIPA', full: 'Comissão Interna de Prevenção', meses: 12 },
  { key: 'BRIGADA', label: 'Brigada', full: 'Brigada de Incêndio', meses: 12 },
  { key: 'CNH', label: 'CNH', full: 'Habilitação', meses: 60 },
  { key: 'OUTRO', label: 'Outro', full: 'Outro', meses: 12 },
];
