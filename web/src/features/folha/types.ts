/** Tipos do domínio Folha de Pagamento — porte de js/views/FolhaPagamento.js. */

export type FolhaItemTipo = 'provento' | 'desconto';

/** Lançamento avulso (provento ou desconto) de um colaborador. */
export interface FolhaItem {
  id: string;
  tipo: FolhaItemTipo;
  descricao: string;
  valor: number;
}

/** Linha da folha — um colaborador numa competência. */
export interface FolhaRow {
  id: string;
  recursoId: string;
  recursoNome: string;
  contractId?: string | null;
  salarioBase: number;
  valorVale: number;
  valorSaldo: number;
  elegivelVale: boolean;
  valePago: boolean;
  saldoPago: boolean;
  itens: FolhaItem[];
}

/** Envelope de GET /api/folha-pagamento. */
export interface FolhaResponse {
  folha: FolhaRow[];
}

/** Parcela pagável de uma linha da folha. */
export type FolhaParcela = 'vale' | 'saldo';
