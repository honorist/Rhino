/**
 * Compliance de RDO — núcleo testável. Porte do cálculo de alertas de
 * `renderRdoSection` (contrato/rdos.js): dias úteis sem registro.
 */
import type { Rdo, RdoMaoObra } from './types';

const n = (v: unknown): number => Number(v) || 0;

function isWeekend(d: Date): boolean {
  const x = d.getDay();
  return x === 0 || x === 6;
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Soma de pessoas (MOI + MOD + Terceiros) de um RDO. */
export function moTotal(rdo: Rdo): number {
  const soma = (arr?: RdoMaoObra[]): number =>
    (arr ?? []).reduce((s, x) => s + n(x.qtd ?? x.quantidade), 0);
  return soma(rdo.moi) + soma(rdo.mod) + soma(rdo.terc);
}

/** Resultado da verificação de compliance de RDO. */
export interface RdoComplianceResult {
  nivel: 'erro' | 'aviso' | 'info' | null;
  mensagem: string;
}

/**
 * Avalia se a obra está em dia com os RDOs. Considera apenas dias úteis e
 * só alerta para contratos ativos.
 */
export function rdoCompliance(
  rdos: Rdo[],
  contractStatus: string,
  now: Date = new Date(),
): RdoComplianceResult {
  const vazio: RdoComplianceResult = { nivel: null, mensagem: '' };
  const today = new Date(now);
  today.setHours(12, 0, 0, 0);
  const ehFimDeSemana = isWeekend(today);

  if (contractStatus !== 'ativo') return vazio;
  if (ehFimDeSemana) {
    return {
      nivel: 'info',
      mensagem: 'Hoje é fim de semana — RDO é ocasional, não obrigatório.',
    };
  }

  // Último dia útil anterior a hoje.
  const ultDiaUtil = new Date(today);
  ultDiaUtil.setDate(ultDiaUtil.getDate() - 1);
  while (isWeekend(ultDiaUtil)) ultDiaUtil.setDate(ultDiaUtil.getDate() - 1);
  const ultDiaUtilIso = toIso(ultDiaUtil);

  const ordenados = [...rdos].sort((a, b) =>
    String(b.data ?? '').localeCompare(String(a.data ?? '')),
  );
  const ultimoRdo = ordenados.length > 0 ? String(ordenados[0].data ?? '') : '';

  if (!ultimoRdo) {
    return {
      nivel: 'erro',
      mensagem:
        'Esta obra ainda não tem nenhum RDO registrado. Crie o primeiro.',
    };
  }

  // Conta dias úteis entre o último RDO e hoje.
  let diasUteisSem = 0;
  const cur = new Date(`${ultimoRdo}T12:00:00`);
  cur.setDate(cur.getDate() + 1);
  while (toIso(cur) <= toIso(today)) {
    if (!isWeekend(cur)) diasUteisSem++;
    cur.setDate(cur.getDate() + 1);
  }

  const fmtBr = (iso: string): string => {
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
  };

  if (ultimoRdo < ultDiaUtilIso) {
    return {
      nivel: 'erro',
      mensagem: `Sem RDO no último dia útil (${fmtBr(ultDiaUtilIso)}). Último RDO: ${fmtBr(ultimoRdo)} — ${diasUteisSem} dia(s) útil(eis) sem registrar.`,
    };
  }
  if (diasUteisSem > 2) {
    return {
      nivel: 'aviso',
      mensagem: `${diasUteisSem} dias úteis sem RDO. Último: ${fmtBr(ultimoRdo)}.`,
    };
  }
  return vazio;
}
