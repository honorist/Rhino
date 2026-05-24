/** Tipos do domínio Cobrança Mensal — porte de js/views/CobrancaMensal.js. */

/** Um contrato cobrado dentro de um mês, com seus dias ativos. */
export interface CobrancaDetalhe {
  name: string;
  diasAtivos: number;
  statusAtual?: string;
}

/**
 * Cobrança de um mês — usado tanto no histórico (mês fechado) quanto na
 * projeção do mês corrente (mesma forma de dados).
 */
export interface CobrancaMes {
  ano: number;
  mes: number;
  total: number;
  contratosAtivos: number;
  valorPorContrato: number;
  valorContratos: number;
  taxaFixa: number;
  faixa: string;
  detalhes?: CobrancaDetalhe[];
}

/** Envelope de GET /api/cobranca-mensal/historico. */
export interface CobrancaHistorico {
  meses: CobrancaMes[];
}

/** Bucket de uso da API Claude — mensal ou acumulado. */
export interface AiUsageBucket {
  calls?: number;
  input_tokens?: number;
  output_tokens?: number;
  cost_usd?: number;
}

/** Envelope de GET /api/ai-usage/stats. */
export interface AiUsageStats {
  monthly?: AiUsageBucket;
  allTime?: AiUsageBucket;
}
