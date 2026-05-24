/**
 * Tipos de domínio do Rhino.
 *
 * Na Fase 1 nascem como `DomainRecord` (id + campos não tipados). Cada um é
 * detalhado com seus campos reais ao migrar a view correspondente na Fase 3.
 */

/** Registro genérico — id garantido, demais campos ainda não tipados. */
export interface DomainRecord {
  id: string;
  [key: string]: unknown;
}

/** Lançamento do caixa — tipado na migração de Caixa.js (Fase 3). */
export interface CaixaEntry {
  id: string;
  type: 'entrada' | 'saida';
  description: string;
  value: number;
  date: string;
  category?: string;
  contractId?: string | null;
  contaPagarId?: string;
  nfId?: string;
  baseItemId?: string;
  formaPagamento?: string;
  notes?: string;
  createdAt?: string;
}

/** Nota fiscal / conta a receber — tipada na migração de NotasFiscais.js. */
export interface NotaFiscal {
  id: string;
  numero: string;
  valor: number;
  dataLimite: string;
  contractId?: string;
  prazoRecebimento?: number;
  emitida?: boolean;
  dataEmissaoReal?: string;
  observacoes?: string;
  caixaEntryId?: string;
}

/** Alocação de um item da BASE a um contrato. */
export interface BaseAllocation {
  contractId: string;
  value: number;
}

/** Configuração de recorrência de um item da BASE. */
export interface BaseRecurrence {
  active: boolean;
  startDate?: string;
  endDate?: string;
  frequency?: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
}

/** Item da BASE (centro de custo) — tipado na migração de Base.js. */
export interface BaseItem {
  id: string;
  description: string;
  type: string;
  value: number;
  date?: string;
  allocations: BaseAllocation[];
  notes?: string;
  metadata?: { recurrence?: BaseRecurrence };
}

/** Tipo de custo administrativo (gerido em Configuração). */
export interface TipoBase {
  id: string;
  key: string;
  label: string;
  icon?: string;
  cor?: string;
}

/** Fornecedor — tipado na migração de Fornecedores.js (Fase 3). */
export interface Fornecedor {
  id: string;
  nome: string;
  cnpj?: string;
  endereco?: string;
  telefone?: string;
  pessoaContato?: string;
  materiais?: string[];
  banco?: string;
  agencia?: string;
  conta?: string;
  chavePix?: string;
  notas?: string;
}

/** Sócio — tipado na migração de Socios.js (Fase 3). */
export interface Socio {
  id: string;
  name: string;
  document?: string;
  email?: string;
  phone?: string;
  participacao: number;
  notes?: string;
}

/** Origem de um aporte: de um sócio ou via caixa da empresa. */
export type AporteOrigem = 'socio' | 'caixa_empresa';

/** Destino de um aporte: para um contrato específico ou para a BASE. */
export type AporteDestino = 'contrato' | 'base';

/** Aporte de capital — tipado na migração de Investimentos.js (Fase 3). */
export interface Investimento {
  id: string;
  value: number;
  date: string;
  origem?: AporteOrigem;
  destino?: AporteDestino;
  socioId?: string | null;
  contractId?: string | null;
  baseType?: string;
  baseItemId?: string | null;
  caixaEntryId?: string | null;
  description?: string;
  type?: 'inicial' | 'aquisicao' | 'adicional';
}
/** Status de uma conta a pagar. */
export type ContaPagarStatus = 'pendente' | 'pago';

/** Conta a pagar — tipada na migração de ContasPagar.js (Fase 3). */
export interface ContaPagar {
  id: string;
  descricao: string;
  status: ContaPagarStatus;
  valor: number;
  numeroNF?: string;
  category?: string;
  fornecedorId?: string;
  contractId?: string;
  valorPago?: number;
  dataEmissao?: string;
  dataVencimento?: string;
  dataPagamento?: string;
  formaPagamento?: string;
  observacoes?: string;
  recorrente?: boolean;
  periodicidade?: string;
}
/** Validação por IA de um documento contra um template. */
export interface DocumentoValidacao {
  status: 'conforme' | 'parcial' | 'nao_conforme' | 'nao_validado';
  score?: number;
  resumo?: string;
  validadoEm?: string;
  modelo?: string;
  motivo?: string;
  erro?: string;
  problemas?: string[];
  secoes?: { ordem?: number | string; observacao?: string; encontrada: boolean }[];
  campos?: { nome: string; encontrado: boolean; valor?: string }[];
  elementos_visuais?: { descricao: string; encontrado: boolean }[];
}

/** Arquivo anexado a um documento. */
export interface DocumentoArquivo {
  filename: string;
  mimeType?: string;
  sizeBytes?: number;
}

/** Documento de conformidade de um colaborador (ASO, NR-35, etc.). */
export interface Documento {
  id: string;
  tipo: string;
  tipoLabel?: string;
  templateId?: string | null;
  dataEmissao?: string;
  dataVencimento?: string;
  responsavel?: string;
  resultado?: string;
  observacoes?: string;
  arquivo?: DocumentoArquivo | null;
  validacao?: DocumentoValidacao | null;
}

/** Template de documento configurável (Configuração → Templates). */
export interface DocTemplate {
  id: string;
  nome: string;
  tipoDocumento?: string;
  empresaId?: string | null;
  periodicidadeMeses?: number;
  /** Corpo de texto do template, com variáveis {{...}}. */
  body?: string;
}

/** Alocação atual de um colaborador a um contrato. */
export interface AlocacaoRecurso {
  contractId?: string;
  dataInicio?: string;
  cicloTrabalho?: number;
  cicloFolga?: number;
}

/** Passagem aérea de uma folga (ida ou volta). */
export interface Passagem {
  comprada?: boolean;
  valor?: number;
  companhia?: string;
  numeroVoo?: string;
  origem?: string;
  destino?: string;
  dataVoo?: string;
  horario?: string;
  financiadoPor?: 'caixa' | 'contrato';
  contractIdPagador?: string | null;
}

/** Folga de campo de um colaborador. */
export interface Folga {
  id: string;
  dataInicio: string;
  dataFim?: string;
  observacoes?: string;
  passagemIda?: Passagem;
  passagemVolta?: Passagem;
}

export type RecursoStatus = 'funcionario' | 'candidato' | 'ex_funcionario';

/**
 * Colaborador / recurso humano. Tipado parcialmente na migração de
 * Documentos.js (Onda D); a migração de Recursos.js pode expandir.
 */
export interface Recurso {
  id: string;
  nome: string;
  profissao?: string;
  status?: RecursoStatus;
  cpf?: string;
  dataNascimento?: string;
  genero?: string;
  telefone?: string;
  email?: string;
  endereco?: string;
  dataAdmissao?: string;
  salario?: number;
  pis?: string;
  cnh?: string;
  notas?: string;
  contractId?: string | null;
  lat?: number | string | null;
  lng?: number | string | null;
  rdoCategoria?: '' | 'moi' | 'mod';
  elegivelVale?: boolean;
  dataDesligamento?: string;
  motivoDesligamento?: string;
  obsDesligamento?: string;
  documentos?: Documento[];
  folgas?: Folga[];
  alocacaoAtual?: AlocacaoRecurso | null;
  [key: string]: unknown;
}
/** Estados do fluxo de uma solicitação de compra. */
export type SolStatus =
  | 'pendente_avaliacao'
  | 'pendente_aprovacao'
  | 'aprovada'
  | 'comprada'
  | 'recebida'
  | 'rejeitada'
  | 'cancelada';

/** Cotação de um item de solicitação de compra. */
export interface SolCotacao {
  fornecedorId: string;
  fornecedorNome: string;
  precoUnit: number;
  link?: string;
  observacoes?: string;
}

/** Item de uma solicitação de compra. */
export interface SolItem {
  descricao: string;
  qtd: number;
  observacoes?: string;
  tipo?: 'compra' | 'aluguel';
  cotacoes?: SolCotacao[];
  cotacaoEscolhidaIdx?: number;
  /** Preço unitário consolidado após a avaliação. */
  precoUnit?: number;
}

/**
 * Solicitação de compra — fluxo solicitar → avaliar → aprovar → comprar →
 * receber. Tipada na migração de SolicitacoesCompra.js (Onda D).
 */
export interface SolicitacaoCompra {
  id: string;
  numero?: string | number;
  status: SolStatus;
  solicitanteNome?: string;
  contractId?: string | null;
  justificativa?: string;
  itens: SolItem[];
  valorTotal?: number;
  almoxarifadoDestinoId?: string;
  avaliadorNome?: string;
  avaliadoEm?: string;
  aprovadorNome?: string;
  aprovadoEm?: string;
  compradorNome?: string;
  compradoEm?: string;
  recebedorNome?: string;
  recebidoEm?: string;
  fornecedorId?: string;
  numeroPedido?: string;
  contaPagarId?: string;
  dataPrevistaEntrega?: string;
  dataRecebimento?: string;
  nfRecebimento?: string;
  obsRecebimento?: string;
  motivoCancelamento?: string;
  canceladoEm?: string;
  motivoRejeicao?: string;
  createdAt?: string;
  [key: string]: unknown;
}
/** Estados do fluxo de aprovação de uma manutenção. */
export type ManutencaoStatus =
  | 'solicitada'
  | 'pendente_aprovacao'
  | 'aprovada'
  | 'retornado'
  | 'rejeitada'
  | 'cancelada';

/**
 * Manutenção de equipamento — fluxo solicitar → avaliar → aprovar → retornar.
 * Tipada na migração de Manutencao.js (Onda D).
 */
export interface Manutencao {
  id: string;
  equipamento: string;
  problema?: string;
  contractId?: string | null;
  observacoes?: string;
  status: ManutencaoStatus;
  solicitanteNome?: string;
  avaliadorNome?: string;
  oficina?: string;
  custoEstimado?: number;
  /** Custo final, registrado no retorno. */
  custo?: number;
  dataEnvio?: string;
  dataRetornoPrevista?: string;
  dataRetorno?: string;
  /** Motivo da rejeição. */
  motivo?: string;
}
/** Plano de manutenção preventiva de um veículo (por KM e/ou meses). */
export interface VeiculoPlano {
  id: string;
  descricao: string;
  intervaloKm?: number | null;
  intervaloMeses?: number | null;
  ultimoKm?: number | null;
  ultimaData?: string | null;
  ativo?: boolean;
}

/** Manutenção executada num veículo. */
export interface VeiculoManutencao {
  id: string;
  data?: string;
  tipo?: string;
  planoId?: string | null;
  descricao?: string;
  observacoes?: string;
  km?: number;
  custo?: number;
  fornecedorId?: string | null;
}

export type VeiculoStatus = 'ativo' | 'manutencao' | 'inativo';

/** Veículo da frota — tipado na migração de Frota.js (Onda D). */
export interface Veiculo {
  id: string;
  placa: string;
  tipo?: string;
  marca?: string;
  modelo?: string;
  ano?: number;
  kmAtual?: number;
  status?: VeiculoStatus;
  contractId?: string | null;
  endereco?: string;
  lat?: number | string | null;
  lng?: number | string | null;
  observacoes?: string;
  planos?: VeiculoPlano[];
  manutencoes?: VeiculoManutencao[];
}
export type PropostaStatus =
  | 'rascunho'
  | 'enviada'
  | 'aceita'
  | 'rejeitada'
  | 'expirada';
export type PropostaTipo = 'hh' | 'material' | 'ambos';

/**
 * Proposta comercial. Os campos de listagem são tipados; o editor
 * (PropostaDetail) acessa campos adicionais via index signature.
 */
export interface Proposta {
  id: string;
  numero: string;
  ano: number;
  revisao?: number;
  titulo?: string;
  tipo?: PropostaTipo;
  status?: PropostaStatus;
  valorTotal?: number;
  dataEmissao?: string;
  clienteId?: string;
  clienteEmpresa?: string;
  clienteNome?: string;
  referencia?: string;
  contratoId?: string;
  [key: string]: unknown;
}

/** Cláusula reutilizável da biblioteca — tipada na migração de Clausulas.js. */
export interface Clausula {
  id: string;
  titulo: string;
  texto: string;
  categoria: string;
  tags: string[];
  ativa: boolean;
  usoCount?: number;
}
