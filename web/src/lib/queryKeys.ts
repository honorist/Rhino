/**
 * Fábrica de query keys do TanStack Query.
 * Uma chave por "slice" do store.js antigo — invalidar a chave dispara refetch.
 */
export const queryKeys = {
  contracts: ['contracts'] as const,
  caixa: ['caixa'] as const,
  base: ['base'] as const,
  tiposBase: ['tipos-base'] as const,
  socios: ['socios'] as const,
  investimentos: ['investimentos'] as const,
  notasFiscais: ['notas-fiscais'] as const,
  clientes: ['clientes'] as const,
  fornecedores: ['fornecedores'] as const,
  contasPagar: ['contas-pagar'] as const,
  recursos: ['recursos'] as const,
  solicitacoesCompra: ['solicitacoes-compra'] as const,
  manutencoes: ['manutencoes'] as const,
  veiculos: ['veiculos'] as const,
  propostas: ['propostas'] as const,
  clausulas: ['clausulas'] as const,
  rdos: ['rdos'] as const,
  docTemplates: ['doc-templates'] as const,
  estoqueVisao: ['estoque', 'visao'] as const,
  estoqueMovs: ['estoque', 'movimentacoes'] as const,
  atividades: (contractId: string) => ['atividades', contractId] as const,
  audit: (params?: Record<string, string>) => ['audit', params ?? {}] as const,
  folha: (competencia: string) => ['folha', competencia] as const,
  users: ['users'] as const,
  niveisAcesso: ['niveis-acesso'] as const,
  currentUser: ['auth', 'me'] as const,
  cobrancaHistorico: ['cobranca', 'historico'] as const,
  cobrancaProjecao: ['cobranca', 'projecao'] as const,
  aiUsage: ['ai-usage'] as const,
  dashboard: (params?: Record<string, string>) =>
    ['dashboard', params ?? {}] as const,
  apresentacao: ['app-settings', 'proposta_apresentacao'] as const,
  caseLogos: ['case-logos'] as const,
} as const;
