/**
 * Tipos do domínio RDO (Relatório Diário de Obra) — porte de js/views/RDOs.js
 * e do handler `handleGetRdosGlobal` (server.js).
 */

/** RDO na listagem flat global (`GET /api/rdos`). */
export interface Rdo {
  id: string;
  contractId: string;
  contractName: string;
  contractClient?: string;
  numero?: number | string;
  data?: string;
  osNumero?: string;
  updatedAt?: string;
}

/** Obra ativa sem RDO no último dia útil. */
export interface ObraSemRdo {
  contractId: string;
  name: string;
  client?: string;
  ultimoRdo: string | null;
}

/** Obra ativa atrasada (> 2 dias úteis sem RDO ou que nunca fez). */
export interface ObraAtrasada {
  contractId: string;
  name: string;
  client?: string;
  ultimoRdo: string | null;
  diasUteisSemRdo: number | null;
  nuncaFezRdo: boolean;
}

/** Ponto da série diária de aderência. */
export interface AderenciaDia {
  data: string;
  feitos: number;
  esperados: number;
  pct: number;
}

/** Estatísticas de aderência calculadas pelo backend. */
export interface RdoStats {
  ultimoDiaUtil: string;
  hoje: string;
  ehFimDeSemana: boolean;
  obrasAtivas: number;
  obrasSemRdoOntem: ObraSemRdo[];
  obrasAtrasadas: ObraAtrasada[];
  aderencia7d: number;
  diasUteisAvaliados: number;
  aderenciaDiaria: AderenciaDia[];
  aderenciaMes: number;
  diasUteisMes: number;
  feitosMes: number;
  esperadosMes: number;
}

/** Envelope de resposta de `GET /api/rdos`. */
export interface RdosResponse {
  rdos: Rdo[];
  stats: RdoStats;
}
