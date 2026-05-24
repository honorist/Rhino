/**
 * Mapa entidade-do-backend → query keys do TanStack Query a invalidar.
 * Núcleo puro do realtime (sem React/EventSource) — testável.
 *
 * Espelha o VIEW_BY_ENTITY de js/realtime.js, mas em vez de checar se
 * a view ativa é a alvo, invalida as queries (o react-query refaz fetch
 * só se a tela montada estiver usando).
 */

/** QueryKey base — array de strings. */
export type QueryKey = readonly (string | number)[];

/** Para cada entidade, retorna a lista de keys a invalidar. */
export function keysForEntity(entity: string): QueryKey[] {
  switch (entity) {
    case 'contracts':
      // contratos afetam dashboard/relatórios também — dashboard usa key
      // ['dashboard', params] mas a invalidação por prefixo cobre.
      return [['contracts'], ['dashboard'], ['atividades']];
    case 'clientes':
      return [['clientes']];
    case 'fornecedores':
      return [['fornecedores']];
    case 'contas-pagar':
      return [['contas-pagar'], ['caixa']];
    case 'notas-fiscais':
      return [['notas-fiscais'], ['caixa'], ['contracts']];
    case 'caixa':
      return [['caixa']];
    case 'socios':
      return [['socios']];
    case 'investimentos':
      return [['investimentos']];
    case 'base':
      return [['base']];
    case 'recursos':
      return [['recursos']];
    case 'organograma':
      return [['contracts'], ['recursos']];
    case 'rdos':
      return [['rdos'], ['contracts']];
    case 'propostas':
      return [['propostas']];
    case 'clausulas':
      return [['clausulas']];
    case 'manutencoes':
      return [['manutencoes']];
    case 'veiculos':
      return [['veiculos']];
    case 'solicitacoes-compra':
      return [['solicitacoes-compra']];
    case 'users':
      return [['users']];
    default:
      return [];
  }
}
