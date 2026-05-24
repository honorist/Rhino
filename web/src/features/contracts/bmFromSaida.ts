/**
 * Localiza, para uma saída específica, todos os dados que o BM precisa:
 * NF associada, saídas do mesmo BM, NFs anteriores e cronológicas do contrato.
 *
 * Núcleo puro do wiring do botão "Gerar BM" — testável sem jsPDF.
 * Espelha BM.gerarPorSaida() do js/bm.js.
 */
import type { BmInput, BmNf, BmSaidaItem } from './exportBmPdf';
import type { Contract } from './types';

/** Forma mínima esperada de uma saída/NF (records dinâmicos). */
type Reg = { [k: string]: unknown };

export interface BmLookupInput {
  contract: Contract;
  saidaId: string;
  saidas: readonly Reg[];
  notasFiscais: readonly Reg[];
}

/**
 * Resolve o `BmInput` a partir de uma saída clicada. Retorna `null` se a
 * saída não existe ou não pertence ao contrato.
 */
export function buildBmInputFromSaida(input: BmLookupInput): BmInput | null {
  const { contract, saidaId, saidas, notasFiscais } = input;
  const saida = saidas.find((s) => s.id === saidaId);
  if (!saida) return null;
  if (saida.contractId !== contract.id) return null;

  const nf = (notasFiscais.find((n) => n.id === saida.nfId) ?? null) as BmNf | null;

  // Cronológica por dataLimite (precoce → tardio).
  const nfsContrato: BmNf[] = (notasFiscais as Reg[])
    .filter((n) => n.contractId === contract.id)
    .slice()
    .sort((a, b) => {
      const da = String(a.dataLimite ?? '');
      const db = String(b.dataLimite ?? '');
      return da.localeCompare(db);
    }) as BmNf[];

  const idxEsta = nfsContrato.findIndex((n) => n.id === saida.nfId);
  const nfsAnteriores = idxEsta > 0 ? nfsContrato.slice(0, idxEsta) : [];

  // Todas as saídas que entram no MESMO BM (mesma NF), em ordem de criação.
  const saidasDoDia = (saida.nfId
    ? saidas
        .filter((s) => s.nfId === saida.nfId)
        .slice()
        .sort((a, b) => {
          const ca = String(a.createdAt ?? '');
          const cb = String(b.createdAt ?? '');
          return ca.localeCompare(cb);
        })
    : [saida]) as BmSaidaItem[];

  return {
    contract,
    saida: saida as BmSaidaItem,
    nf,
    nfsAnteriores,
    nfsContrato,
    saidasDoDia,
  };
}
