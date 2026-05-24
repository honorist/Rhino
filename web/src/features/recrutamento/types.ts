/**
 * Tipos do subsistema Recrutamento (US-05 a US-09).
 * Espelham os repos do backend (camelCase pós-conversão do db).
 */

export type SolicitacaoStatus = 'aberta' | 'preenchida' | 'cancelada';
export type CandidatoStatus =
  | 'contatado'
  | 'interessado'
  | 'sem_interesse'
  | 'reprovado_antecedentes'
  | 'aprovado';
export type AntecedentesStatus = 'pendente' | 'ok' | 'reprovado';

export interface DocumentoAnexo {
  filename: string;
  storagePath: string;
  mimeType?: string | null;
  size?: number | null;
  uploadedAt: string;
}

/** Os 4 documentos obrigatórios + antecedentes (US-08). */
export type TipoDocumento = 'rg' | 'cpf' | 'residencia' | 'ctps' | 'antecedentes';

export interface Candidato {
  id: string;
  vagaId: string;
  nome: string;
  cpf?: string | null;
  telefone?: string | null;
  email?: string | null;
  status: CandidatoStatus;
  antecedentesStatus: AntecedentesStatus;
  documentos: Partial<Record<TipoDocumento, DocumentoAnexo>>;
  recursoId?: string | null;
  observacoes?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface Vaga {
  id: string;
  solicitacaoId: string;
  cargo: string;
  qtdTotal: number;
  qtdPreenchida: number;
  candidatos?: Candidato[];
  createdAt?: string;
}

export interface Solicitacao {
  id: string;
  contractId?: string | null;
  solicitanteId?: string | null;
  solicitanteNome?: string | null;
  status: SolicitacaoStatus;
  observacoes?: string | null;
  createdAt: string;
  updatedAt?: string;
  closedAt?: string | null;
  vagas?: Vaga[];
}

export interface VagaInput {
  cargo: string;
  qtdTotal: number;
}

export interface SolicitacaoInput {
  contractId?: string | null;
  observacoes?: string;
  vagas: VagaInput[];
}

// ─── Labels e cores para UI ─────────────────────────────────────────
export const STATUS_CANDIDATO_LABEL: Record<CandidatoStatus, string> = {
  contatado: 'Contatado',
  interessado: 'Interessado',
  sem_interesse: 'Sem interesse',
  reprovado_antecedentes: 'Reprovado nos antecedentes',
  aprovado: 'Aprovado',
};

export const STATUS_CANDIDATO_COR: Record<CandidatoStatus, string> = {
  contatado: '#3182CE',
  interessado: '#16A34A',
  sem_interesse: '#64748B',
  reprovado_antecedentes: '#DC2626',
  aprovado: '#0F766E',
};

export const STATUS_SOLICITACAO_LABEL: Record<SolicitacaoStatus, string> = {
  aberta: 'Aberta',
  preenchida: 'Preenchida',
  cancelada: 'Cancelada',
};

export const STATUS_SOLICITACAO_COR: Record<SolicitacaoStatus, string> = {
  aberta: '#D97706',
  preenchida: '#16A34A',
  cancelada: '#64748B',
};

export const ANTECEDENTES_LABEL: Record<AntecedentesStatus, string> = {
  pendente: 'Pendente',
  ok: 'Aprovado',
  reprovado: 'Reprovado',
};

export const DOCUMENTOS_OBRIGATORIOS: TipoDocumento[] = ['rg', 'cpf', 'residencia', 'ctps'];

export const DOC_LABEL: Record<TipoDocumento, string> = {
  rg: 'RG',
  cpf: 'CPF',
  residencia: 'Comprovante de residência',
  ctps: 'CTPS digital',
  antecedentes: 'Antecedentes criminais',
};
