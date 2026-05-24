/**
 * Núcleo do formulário de RDO — constantes, cálculo de prazo e totais.
 * Porte de contrato/rdo-form.js (parte testável).
 */
import type { Contract } from './types';

const DIA = 86_400_000;

/** Opções de tempo (clima) por período. */
export const RDO_TEMPO_OPCOES = [
  { v: 'bom', l: 'Bom' },
  { v: 'chuva', l: 'Chuva' },
  { v: 'nao_houve', l: 'Não Houve' },
  { v: 'sem_expediente', l: 'Sem Expediente' },
] as const;

/** Opções de condição da área. */
export const RDO_COND_OPCOES = [
  { v: 'operavel', l: 'Operável' },
  { v: 'parcial', l: 'Op. Parcialmente' },
  { v: 'inoperavel', l: 'Inoperável' },
] as const;

/** Cargos sugeridos para mão de obra indireta. */
export const RDO_MOI_CARGOS = [
  'Engenheiro',
  'Téc. de Planejamento',
  'Topógrafo',
  'Aux. Administrativo',
  'Coord. de Segurança',
  'Téc. de Segurança',
  'Encarregado de Obras',
];

/** Cargos sugeridos para mão de obra direta. */
export const RDO_MOD_CARGOS = [
  'Pedreiro',
  'Carpinteiro',
  'Armador',
  'Ajudante',
  'Meio Oficial',
  'Montador',
  'Pintor',
  'Eletricista',
  'Serralheiro',
  'Bombeiro Hidráulico',
  'Operador Betoneira',
  'Motorista',
  'Soldador',
  'Caldeireiro',
  'Mecânico',
  'Montador de Andaime',
];

/** Tipos de equipamento sugeridos. */
export const RDO_EQP_TIPOS = [
  'Retroescavadeira',
  'Lixadeira',
  'Dumper',
  'Serra Circular',
  'Parafusadeira',
  'Martelete',
  'Caminhão Munck',
  'Maçarico',
  'Máquina de Solda',
  'Betoneira',
  'Plataforma',
  'Compactador',
  'Gerador',
  'Guincho',
];

const DIAS_SEMANA = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];

/** Nome do dia da semana de uma data ISO. */
export function diaSemanaFromISO(iso: string): string {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? '' : DIAS_SEMANA[d.getDay()];
}

function diasEntre(a: string, b: string): number {
  if (!a || !b) return 0;
  const da = new Date(`${a}T12:00:00`).getTime();
  const db = new Date(`${b}T12:00:00`).getTime();
  if (Number.isNaN(da) || Number.isNaN(db)) return 0;
  return Math.max(0, Math.round((db - da) / DIA));
}

/** Prazo do RDO calculado a partir do contrato e da data do relatório. */
export interface RdoPrazo {
  dataInicial: string;
  dataFinal: string;
  dataTendencia: string;
  contratual: number;
  decorrido: number;
  faltante: number;
  atraso: number;
  pctConcluida: number;
}

/** Calcula o bloco de prazo do RDO (datas e dias). */
export function calcPrazo(
  contract: Pick<Contract, 'startDate' | 'endDate' | 'tendencyDate'>,
  dataRdo: string,
  pctConcluida = 0,
): RdoPrazo {
  const inicio = contract.startDate ?? '';
  const fim = contract.endDate ?? '';
  const tendencia = contract.tendencyDate ?? fim;
  const contratual = diasEntre(inicio, fim);
  const decorrido = diasEntre(inicio, dataRdo);
  const faltante = tendencia
    ? diasEntre(dataRdo, tendencia)
    : Math.max(0, contratual - decorrido);
  const atraso =
    contract.tendencyDate && fim ? diasEntre(fim, contract.tendencyDate) : 0;
  return {
    dataInicial: inicio,
    dataFinal: fim,
    dataTendencia: contract.tendencyDate ?? '',
    contratual,
    decorrido,
    faltante,
    atraso,
    pctConcluida,
  };
}

/** Item de mão de obra do formulário. */
export interface MoForm {
  cargo: string;
  qtd: number;
  horas: number;
}
/** Item de terceirizado do formulário. */
export interface TercForm {
  empresa: string;
  cargo: string;
  qtd: number;
  horas: number;
}
/** Item de equipamento do formulário. */
export interface EqpForm {
  nome: string;
  qtd: number;
  horas: number;
}
/** Atividade do formulário. */
export interface AtvForm {
  area: string;
  descricao: string;
  pctConcluida: number;
  ocorrencias: string;
}

/** Estado completo do formulário de RDO. */
export interface RdoFormData {
  data: string;
  diaSemana: string;
  osNumero: string;
  periodoTrabalho: string;
  horaExtra: boolean;
  prazo: RdoPrazo;
  tempo: {
    manha: { tempo: string; condicoes: string };
    tarde: { tempo: string; condicoes: string };
    noiteAnt: { tempo: string; condicoes: string };
    precipitacao: number;
  };
  moi: MoForm[];
  mod: MoForm[];
  terc: TercForm[];
  equipamentos: EqpForm[];
  atividades: AtvForm[];
  seguranca: {
    temaDds: string;
    temaMeioAmbiente: string;
    acidente: string;
    diagnostico: string;
    comentarios: string;
  };
  fiscalizacaoComentarios: string;
}

/** Totais agregados do RDO (calculados ao salvar). */
export interface RdoTotais {
  moi: number;
  mod: number;
  terc: number;
  eqp: number;
  homensHora: number;
  equipamentoHora: number;
}

/** Calcula os totais de pessoas e horas do RDO. */
export function rdoTotais(d: RdoFormData): RdoTotais {
  const somaQtd = (arr: { qtd: number }[]) =>
    arr.reduce((s, x) => s + (Number(x.qtd) || 0), 0);
  const somaHH = (arr: { qtd: number; horas: number }[]) =>
    arr.reduce((s, x) => s + (Number(x.qtd) || 0) * (Number(x.horas) || 0), 0);
  return {
    moi: somaQtd(d.moi),
    mod: somaQtd(d.mod),
    terc: somaQtd(d.terc),
    eqp: somaQtd(d.equipamentos),
    homensHora: somaHH(d.moi) + somaHH(d.mod) + somaHH(d.terc),
    equipamentoHora: somaHH(d.equipamentos),
  };
}
