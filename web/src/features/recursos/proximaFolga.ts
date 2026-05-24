/**
 * Cálculo da próxima folga e normalização de cargos — núcleo testável da
 * tela de Recursos. Porte de `_calcProximaFolga` / `_normalizeCargo`.
 */
import type { Recurso } from '../../types/domain';

const DIA_MS = 86_400_000;

/**
 * Padroniza um cargo/função: colapsa espaços e aplica sentence-case
 * ("PEDREIRO", " pedreiro " → "Pedreiro"). Usado para exibir e deduplicar.
 */
export function normalizeCargo(value: unknown): string {
  const v = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!v) return '';
  return (
    v.charAt(0).toLocaleUpperCase('pt-BR') +
    v.slice(1).toLocaleLowerCase('pt-BR')
  );
}

/** Próxima folga calculada a partir do ciclo de trabalho. */
export interface ProximaFolga {
  dataProxima: string;
  diasRestantes: number;
}

/**
 * Calcula a data da próxima folga: ciclo de trabalho a partir do início na
 * obra (ou do fim da última folga registrada). `null` se sem alocação.
 */
export function calcProximaFolga(
  recurso: Recurso,
  now: Date = new Date(),
): ProximaFolga | null {
  const aloc = recurso.alocacaoAtual;
  if (!aloc?.dataInicio) return null;

  const ciclo = Number(aloc.cicloTrabalho) || 21;
  const inicio = new Date(`${aloc.dataInicio}T12:00:00`);

  const folgas = [...(recurso.folgas ?? [])].sort(
    (a, b) =>
      new Date(b.dataInicio).getTime() - new Date(a.dataInicio).getTime(),
  );
  const ultima = folgas[0];

  let base = inicio;
  if (ultima?.dataFim) {
    base = new Date(`${ultima.dataFim}T12:00:00`);
  }

  const proxima = new Date(base);
  proxima.setDate(proxima.getDate() + ciclo);

  const hoje = new Date(now);
  hoje.setHours(0, 0, 0, 0);
  const diasRestantes = Math.ceil(
    (proxima.getTime() - hoje.getTime()) / DIA_MS,
  );

  return {
    dataProxima: proxima.toISOString().slice(0, 10),
    diasRestantes,
  };
}
