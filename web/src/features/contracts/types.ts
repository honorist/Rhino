import type { DomainRecord } from '../../types/domain';

/** Estados de um contrato. */
export type ContractStatus =
  | 'prospeccao'
  | 'nao_iniciado'
  | 'nao_aprovado'
  | 'ativo'
  | 'pausado'
  | 'concluido'
  | 'cancelado';

/** Item do orçamento de um contrato. */
export interface BudgetItem {
  id?: string;
  description?: string;
  type?: string;
  value?: number;
  notes?: string;
}

/**
 * Contrato. Campos de listagem/edição tipados na migração de Contratos.js;
 * o detalhe (ContratoDetail) acessa campos extras via index signature.
 */
export interface Contract {
  id: string;
  name: string;
  client: string;
  clientId?: string | null;
  contractNumber?: string;
  status: ContractStatus;
  value?: number;
  startDate?: string;
  endDate?: string;
  tendencyDate?: string;
  endereco?: string;
  lat?: number | string | null;
  lng?: number | string | null;
  clientDocument?: string;
  clientEmail?: string;
  clientPhone?: string;
  retencaoPercent?: number;
  notes?: string;
  organograma?: unknown[];
  rdos?: unknown[];
  budget?: BudgetItem[];
  [key: string]: unknown;
}

/** Etapa do cronograma físico-financeiro de um contrato. */
export interface Atividade {
  id: string;
  nome: string;
  dataInicioPlan?: string | null;
  dataFimPlan?: string | null;
  dataFimReal?: string | null;
  pesoPct?: number;
  execPct?: number;
  custoPlan?: number;
  notas?: string;
}

/** Linha de mão de obra de um RDO (MOI/MOD/Terceiros). */
export interface RdoMaoObra {
  cargo?: string;
  empresa?: string;
  qtd?: number;
  quantidade?: number;
  /**
   * Total de horas (compat — mantém retrocompatibilidade com dados antigos).
   * Em novos lançamentos é derivado de horasNormais + horasExtras.
   */
  horas?: number;
  /** US-03: horas normais (default 9). */
  horasNormais?: number;
  /** US-03: horas extras (default 0). */
  horasExtras?: number;
}

/** Equipamento registrado num RDO. */
export interface RdoEquipamento {
  nome?: string;
  qtd?: number;
  quantidade?: number;
  horasOperando?: number;
  horas?: number;
}

/** Atividade executada num RDO. */
export interface RdoAtividade {
  descricao?: string;
  nome?: string;
  pctExecutado?: number;
  pct?: number;
}

/** Foto anexada a um RDO. */
export interface RdoFoto {
  id?: string;
  url?: string;
  legenda?: string;
}

/**
 * RDO — Relatório Diário de Obra. Aninhado em `Contract.rdos`. Estrutura
 * profunda; campos pouco usados ficam acessíveis pela index signature.
 */
export interface Rdo {
  id: string;
  numero?: number | string;
  data?: string;
  diaSemana?: string;
  osNumero?: string;
  ordemCompra?: string;
  periodoTrabalho?: string;
  moi?: RdoMaoObra[];
  mod?: RdoMaoObra[];
  terc?: RdoMaoObra[];
  equipamentos?: RdoEquipamento[];
  atividades?: RdoAtividade[];
  fotos?: RdoFoto[];
  tempo?: unknown;
  prazo?: Record<string, unknown>;
  seguranca?: Record<string, unknown>;
  fiscalizacaoComentarios?: string;
  [key: string]: unknown;
}

/** Nível hierárquico no organograma da obra. */
export type NivelOrg = 'encarregado' | 'lider_area' | 'profissional';

/** Membro do organograma de um contrato. */
export interface OrgMembro {
  id: string;
  recursoId: string;
  nivel: NivelOrg;
  supervisorId?: string | null;
  cargo?: string;
  area?: string | null;
}

/** Aditivo de contrato (alteração de valor/prazo/escopo). */
export interface Aditivo {
  id: string;
  numero?: string;
  tipo?: 'valor' | 'prazo' | 'escopo';
  descricao?: string;
  valorDelta?: number;
  diasDelta?: number;
  data?: string;
  aprovado?: boolean;
}

/** Marco do checklist do contrato. */
export interface Marco {
  id: string;
  titulo: string;
  descricao?: string;
  prazo?: string;
  ordem?: number;
  concluido?: boolean;
  concluidoEm?: string;
}

/** Ocorrência registrada num contrato. */
export interface Ocorrencia {
  id: string;
  data?: string;
  tipo?: string;
  severidade?: 'baixa' | 'media' | 'alta' | 'critica';
  descricao?: string;
  encerrada?: boolean;
}

/** Saída (despesa/medição) vinculada a um contrato. */
export type Saida = DomainRecord;

export type ContractInput = Partial<Omit<Contract, 'id'>>;
export type SaidaInput = Partial<Omit<Saida, 'id'>>;
