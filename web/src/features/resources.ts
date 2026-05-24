/**
 * Camada de dados dos 14 recursos CRUD padrão do Rhino — porte das slices do
 * `store.js` via a fábrica `createResource`.
 *
 * Cada recurso expõe: `useXxx` (lista) + `useCreateXxx` / `useUpdateXxx` /
 * `useRemoveXxx` (mutações). `clientes` fica em `features/clientes/` como
 * referência explícita; `contracts` e `dashboard` têm lógica própria.
 */
import { createResource } from '../lib/createResource';
import { queryKeys } from '../lib/queryKeys';
import type {
  BaseItem,
  CaixaEntry,
  Clausula,
  ContaPagar,
  Fornecedor,
  Investimento,
  Manutencao,
  NotaFiscal,
  Proposta,
  Recurso,
  Socio,
  SolicitacaoCompra,
  TipoBase,
  Veiculo,
} from '../types/domain';

const caixa = createResource<CaixaEntry>({
  key: queryKeys.caixa,
  path: '/api/caixa',
  envelope: 'entries',
});
export const {
  useList: useCaixa,
  useCreate: useCreateCaixa,
  useUpdate: useUpdateCaixa,
  useRemove: useRemoveCaixa,
} = caixa;

const base = createResource<BaseItem>({
  key: queryKeys.base,
  path: '/api/base',
  envelope: 'items',
});
export const {
  useList: useBase,
  useCreate: useCreateBase,
  useUpdate: useUpdateBase,
  useRemove: useRemoveBase,
} = base;

const tiposBase = createResource<TipoBase>({
  key: queryKeys.tiposBase,
  path: '/api/tipos-base',
  envelope: 'tipos',
});
export const {
  useList: useTiposBase,
  useCreate: useCreateTipoBase,
  useUpdate: useUpdateTipoBase,
  useRemove: useRemoveTipoBase,
} = tiposBase;

const socios = createResource<Socio>({
  key: queryKeys.socios,
  path: '/api/socios',
  envelope: 'socios',
});
export const {
  useList: useSocios,
  useCreate: useCreateSocio,
  useUpdate: useUpdateSocio,
  useRemove: useRemoveSocio,
} = socios;

const investimentos = createResource<Investimento>({
  key: queryKeys.investimentos,
  path: '/api/investimentos',
  envelope: 'investimentos',
});
export const {
  useList: useInvestimentos,
  useCreate: useCreateInvestimento,
  useUpdate: useUpdateInvestimento,
  useRemove: useRemoveInvestimento,
} = investimentos;

const notasFiscais = createResource<NotaFiscal>({
  key: queryKeys.notasFiscais,
  path: '/api/notas-fiscais',
  envelope: 'notas_fiscais',
});
export const {
  useList: useNotasFiscais,
  useCreate: useCreateNotaFiscal,
  useUpdate: useUpdateNotaFiscal,
  useRemove: useRemoveNotaFiscal,
} = notasFiscais;

const fornecedores = createResource<Fornecedor>({
  key: queryKeys.fornecedores,
  path: '/api/fornecedores',
  envelope: 'fornecedores',
});
export const {
  useList: useFornecedores,
  useCreate: useCreateFornecedor,
  useUpdate: useUpdateFornecedor,
  useRemove: useRemoveFornecedor,
} = fornecedores;

const contasPagar = createResource<ContaPagar>({
  key: queryKeys.contasPagar,
  path: '/api/contas-pagar',
  envelope: 'contas',
});
export const {
  useList: useContasPagar,
  useCreate: useCreateContaPagar,
  useUpdate: useUpdateContaPagar,
  useRemove: useRemoveContaPagar,
} = contasPagar;

const recursos = createResource<Recurso>({
  key: queryKeys.recursos,
  path: '/api/recursos',
  envelope: 'recursos',
});
export const {
  useList: useRecursos,
  useCreate: useCreateRecurso,
  useUpdate: useUpdateRecurso,
  useRemove: useRemoveRecurso,
} = recursos;

const solicitacoesCompra = createResource<SolicitacaoCompra>({
  key: queryKeys.solicitacoesCompra,
  path: '/api/solicitacoes-compra',
  envelope: 'solicitacoes',
});
export const {
  useList: useSolicitacoesCompra,
  useCreate: useCreateSolicitacaoCompra,
  useUpdate: useUpdateSolicitacaoCompra,
  useRemove: useRemoveSolicitacaoCompra,
} = solicitacoesCompra;

const manutencoes = createResource<Manutencao>({
  key: queryKeys.manutencoes,
  path: '/api/manutencoes',
  envelope: 'manutencoes',
});
export const {
  useList: useManutencoes,
  useCreate: useCreateManutencao,
  useUpdate: useUpdateManutencao,
  useRemove: useRemoveManutencao,
} = manutencoes;

const veiculos = createResource<Veiculo>({
  key: queryKeys.veiculos,
  path: '/api/veiculos',
  envelope: 'veiculos',
});
export const {
  useList: useVeiculos,
  useCreate: useCreateVeiculo,
  useUpdate: useUpdateVeiculo,
  useRemove: useRemoveVeiculo,
} = veiculos;

const propostas = createResource<Proposta>({
  key: queryKeys.propostas,
  path: '/api/propostas',
  envelope: 'propostas',
});
export const {
  useList: usePropostas,
  useCreate: useCreateProposta,
  useUpdate: useUpdateProposta,
  useRemove: useRemoveProposta,
} = propostas;

const clausulas = createResource<Clausula>({
  key: queryKeys.clausulas,
  path: '/api/clausulas',
  envelope: 'clausulas',
});
export const {
  useList: useClausulas,
  useCreate: useCreateClausula,
  useUpdate: useUpdateClausula,
  useRemove: useRemoveClausula,
} = clausulas;
