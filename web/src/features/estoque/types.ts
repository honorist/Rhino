/**
 * Tipos do almoxarifado / estoque — porte de js/views/Estoque.js.
 */

/** Almoxarifado — Central (sem contrato) ou de uma obra. */
export interface Almoxarifado {
  id: string;
  nome: string;
  contractId?: string | null;
  contractName?: string;
  endereco?: string;
}

/** Saldo de um item num almoxarifado. */
export interface Saldo {
  almoxId: string;
  qtd: number;
}

/** Item de estoque com seus saldos por almoxarifado. */
export interface EstoqueItem {
  id: string;
  codigo?: string;
  descricao: string;
  categoria?: string;
  unidade?: string;
  custoMedio?: number;
  estoqueMinimo?: number;
  notas?: string;
  saldos?: Saldo[];
}

export type MovTipo = 'entrada' | 'saida' | 'transferencia' | 'ajuste';

/** Movimentação de estoque. */
export interface Movimentacao {
  id: string;
  data?: string;
  tipo: MovTipo;
  itemId?: string;
  itemDesc?: string;
  unidade?: string;
  quantidade: number;
  custoUnit?: number;
  almoxarifadoOrigemId?: string;
  almoxarifadoDestinoId?: string;
  contractId?: string;
  contractName?: string;
  documento?: string;
  notas?: string;
}

/** Resposta de `GET /api/estoque/visao-geral`. */
export interface VisaoGeralResponse {
  almoxarifados: Almoxarifado[];
  itens: EstoqueItem[];
}

/** Payload de criação/edição de item. */
export interface ItemInput {
  codigo: string;
  descricao: string;
  categoria: string;
  unidade: string;
  estoqueMinimo: number;
  notas: string;
}
