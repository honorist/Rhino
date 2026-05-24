/**
 * Mapas de tradução técnico → português e helpers de exibição do log de
 * auditoria. Porte dos `_entityLabel` / `_actionVerb` / `_statusLabel` /
 * `_fieldLabel` / `_tempoRelativo` de js/views/Auditoria.js.
 */

const ENTITY_LABELS: Record<string, string> = {
  clientes: 'Cliente',
  fornecedores: 'Fornecedor',
  recursos: 'Colaborador',
  'recursos.folgas': 'Folga do colaborador',
  'recursos.documentos': 'Documento do colaborador',
  'recursos.passagem': 'Passagem (folga)',
  contracts: 'Contrato',
  'contracts.saidas': 'Medição (saída/BM)',
  'contracts.budget': 'Item de orçamento',
  'contracts.organograma': 'Membro da equipe',
  'contracts.rdos': 'RDO',
  caixa: 'Lançamento de caixa',
  'contas-pagar': 'Conta a pagar',
  'notas-fiscais': 'Nota fiscal (BM)',
  investimentos: 'Aporte',
  base: 'Item da BASE',
  'tipos-base': 'Tipo de custo',
  'niveis-acesso': 'Nível de acesso',
  'doc-templates': 'Template de documento',
  socios: 'Sócio',
  users: 'Usuário (login)',
  saidas: 'Medição (saída)',
};

/** Entidades oferecidas no filtro "Em qual tela". */
export const ENTIDADE_OPCOES = [
  'clientes',
  'fornecedores',
  'recursos',
  'contracts',
  'contracts.saidas',
  'contracts.budget',
  'contracts.organograma',
  'contracts.rdos',
  'caixa',
  'contas-pagar',
  'notas-fiscais',
  'investimentos',
  'base',
  'tipos-base',
  'niveis-acesso',
  'doc-templates',
  'users',
  'recursos.folgas',
  'recursos.documentos',
  'recursos.passagem',
  'socios',
] as const;

/** Nome amigável de uma entidade técnica. */
export function entityLabel(entity: string): string {
  return ENTITY_LABELS[entity] ?? entity ?? '—';
}

export interface ActionVerb {
  verbo: string;
  cor: string;
  bg: string;
}

const ACTION_VERBS: Record<string, ActionVerb> = {
  create: { verbo: 'Criou', cor: '#10b981', bg: 'rgba(16,185,129,.15)' },
  update: { verbo: 'Editou', cor: '#3b82f6', bg: 'rgba(59,130,246,.15)' },
  delete: { verbo: 'Excluiu', cor: '#dc2626', bg: 'rgba(220,38,38,.15)' },
  pagar: { verbo: 'Pagou', cor: '#22c55e', bg: 'rgba(34,197,94,.15)' },
  estornar: { verbo: 'Estornou', cor: '#f59e0b', bg: 'rgba(245,158,11,.15)' },
  emitir: { verbo: 'Emitiu', cor: '#6366f1', bg: 'rgba(99,102,241,.15)' },
  'cancelar-emissao': {
    verbo: 'Cancelou emissão',
    cor: '#f59e0b',
    bg: 'rgba(245,158,11,.15)',
  },
  passagem: {
    verbo: 'Comprou passagem',
    cor: '#a855f7',
    bg: 'rgba(168,85,247,.15)',
  },
};

/** Ações oferecidas no filtro "Tipo de ação". */
export const ACAO_OPCOES = [
  'create',
  'update',
  'delete',
  'pagar',
  'estornar',
  'emitir',
  'cancelar-emissao',
  'passagem',
] as const;

/** Verbo e cores de uma ação técnica. */
export function actionVerb(action: string): ActionVerb {
  return (
    ACTION_VERBS[action] ?? {
      verbo: action || '—',
      cor: 'var(--color-text)',
      bg: 'var(--color-bg)',
    }
  );
}

export interface StatusLabel {
  texto: string;
  cor: string;
}

/** Rótulo e cor do código HTTP de resultado. */
export function statusLabel(status: number): StatusLabel {
  if (status === 200) return { texto: 'Sucesso', cor: '#10b981' };
  if (status === 400) return { texto: 'Erro de validação', cor: '#dc2626' };
  if (status === 401) return { texto: 'Sem permissão', cor: '#dc2626' };
  if (status === 404) return { texto: 'Não encontrado', cor: '#f59e0b' };
  if (status === 429) return { texto: 'Limite atingido', cor: '#f59e0b' };
  if (status >= 400) return { texto: 'Erro', cor: '#dc2626' };
  if (status >= 300) return { texto: 'Aviso', cor: '#f59e0b' };
  return { texto: 'OK', cor: '#10b981' };
}

const FIELD_LABELS: Record<string, string> = {
  nome: 'Nome',
  name: 'Nome',
  email: 'Email',
  telefone: 'Telefone',
  phone: 'Telefone',
  cpf: 'CPF',
  cnpj: 'CNPJ',
  endereco: 'Endereço',
  address: 'Endereço',
  value: 'Valor',
  valor: 'Valor',
  valorPago: 'Valor pago',
  preco: 'Preço',
  status: 'Status',
  tipo: 'Tipo',
  type: 'Tipo',
  categoria: 'Categoria',
  category: 'Categoria',
  descricao: 'Descrição',
  description: 'Descrição',
  notes: 'Observações',
  observacoes: 'Observações',
  startDate: 'Início',
  endDate: 'Término',
  tendencyDate: 'Tendência',
  dataVencimento: 'Vencimento',
  dataEmissao: 'Emissão',
  dataPagamento: 'Pagamento',
  data_vencimento: 'Vencimento',
  data_emissao: 'Emissão',
  data_pagamento: 'Pagamento',
  contractNumber: 'Nº contrato',
  client: 'Cliente',
  clientId: 'Cliente',
  profissao: 'Profissão',
  salario: 'Salário',
  dataAdmissao: 'Admissão',
  contractId: 'Contrato',
  recursoId: 'Recurso',
  fornecedorId: 'Fornecedor',
  cargo: 'Cargo',
  nivel: 'Nível',
  area: 'Área',
  responsavel: 'Responsável',
  resultado: 'Resultado',
  emitida: 'Emitida',
  formaPagamento: 'Forma pagamento',
  forma_pagamento: 'Forma pagamento',
};

/** Nome amigável de um campo técnico (camelCase/snake_case → "Título"). */
export function fieldLabel(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

/** Tempo relativo legível ("há 5 min", "há 2 dias"). */
export function tempoRelativo(ts?: string): string {
  if (!ts) return '';
  const diff = Math.round((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return 'agora há pouco';
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86_400) return `há ${Math.floor(diff / 3600)} h`;
  if (diff < 604_800) return `há ${Math.floor(diff / 86_400)} dias`;
  return new Date(ts).toLocaleDateString('pt-BR');
}

/** Data e hora completas em pt-BR. */
export function formatDateTime(ts?: string): string {
  return ts ? new Date(ts).toLocaleString('pt-BR') : '—';
}
