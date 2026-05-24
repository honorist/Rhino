/**
 * Cálculo da próxima manutenção de um veículo — combina os critérios de KM e
 * de meses de cada plano e alerta o que vencer primeiro. Porte de
 * `_proximaManut` de Frota.js. Função pura (núcleo testável).
 */
import type { Veiculo, VeiculoPlano } from '../../types/domain';

export type ManutStatus = 'vigente' | 'proximo' | 'vencido';

/** Plano mais urgente de um veículo e sua situação. */
export interface ProximaManut {
  plano: VeiculoPlano;
  /** KM restantes até a próxima execução (negativo = vencido). */
  kmRest: number | null;
  /** Dias restantes até a próxima execução (negativo = vencido). */
  diasRest: number | null;
  status: ManutStatus;
  label: string;
}

const DIA_MS = 86_400_000;

/**
 * Devolve o plano de manutenção mais próximo do vencimento, ou `null` se o
 * veículo não tem plano ativo com critérios suficientes.
 */
export function proximaManut(
  veiculo: Veiculo,
  now: Date = new Date(),
): ProximaManut | null {
  const planos = (veiculo.planos ?? []).filter((p) => p.ativo !== false);
  if (planos.length === 0) return null;

  const hoje = new Date(now);
  hoje.setHours(0, 0, 0, 0);
  const km = Number(veiculo.kmAtual) || 0;

  let melhor: {
    plano: VeiculoPlano;
    kmRest: number | null;
    diasRest: number | null;
    score: number;
  } | null = null;

  for (const p of planos) {
    let kmRest: number | null = null;
    let diasRest: number | null = null;

    if (p.intervaloKm && p.ultimoKm != null) {
      kmRest = Number(p.ultimoKm) + Number(p.intervaloKm) - km;
    } else if (p.intervaloKm && p.ultimoKm == null) {
      kmRest = Number(p.intervaloKm);
    }

    if (p.intervaloMeses && p.ultimaData) {
      const ult = new Date(`${p.ultimaData}T12:00:00`);
      const venc = new Date(ult);
      venc.setMonth(venc.getMonth() + Number(p.intervaloMeses));
      diasRest = Math.ceil((venc.getTime() - hoje.getTime()) / DIA_MS);
    } else if (p.intervaloMeses && !p.ultimaData) {
      diasRest = Number(p.intervaloMeses) * 30;
    }

    const urgencias: number[] = [];
    if (kmRest !== null) urgencias.push(kmRest);
    if (diasRest !== null) urgencias.push(diasRest);
    if (urgencias.length === 0) continue;

    const score = Math.min(...urgencias);
    if (!melhor || score < melhor.score) {
      melhor = { plano: p, kmRest, diasRest, score };
    }
  }

  if (!melhor) return null;

  const vencido =
    (melhor.kmRest !== null && melhor.kmRest <= 0) ||
    (melhor.diasRest !== null && melhor.diasRest <= 0);
  const proximo =
    (melhor.kmRest !== null && melhor.kmRest <= 500) ||
    (melhor.diasRest !== null && melhor.diasRest <= 30);
  const status: ManutStatus = vencido
    ? 'vencido'
    : proximo
      ? 'proximo'
      : 'vigente';

  let label = melhor.plano.descricao;
  if (melhor.kmRest !== null) {
    label += ` · ${melhor.kmRest >= 0 ? 'em' : 'venceu há'} ${Math.abs(
      melhor.kmRest,
    )} km`;
  }
  if (melhor.diasRest !== null) {
    label += ` · ${melhor.diasRest >= 0 ? 'em' : 'venceu há'} ${Math.abs(
      melhor.diasRest,
    )} dias`;
  }

  return {
    plano: melhor.plano,
    kmRest: melhor.kmRest,
    diasRest: melhor.diasRest,
    status,
    label,
  };
}
