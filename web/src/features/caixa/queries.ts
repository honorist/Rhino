import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';

/**
 * Importação de extrato OFX — POST /api/caixa/importar-ofx com corpo `text/plain`
 * (o cliente HTTP padrão envia JSON; aqui precisamos do texto cru do arquivo).
 * O CRUD do caixa usa os hooks padrão da fábrica (features/resources.ts).
 */

export interface OfxTransacao {
  data: string;
  memo?: string;
  valor: number;
  tipo: 'entrada' | 'saida';
  status: 'conciliado' | 'novo';
  match?: { description: string };
}

export interface OfxResultado {
  total: number;
  novos: number;
  transacoes: OfxTransacao[];
}

/** Envia o conteúdo de um arquivo OFX e devolve o resultado da conciliação. */
export function useImportarOfx() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ofxText: string): Promise<OfxResultado> => {
      const res = await fetch('/api/caixa/importar-ofx', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: ofxText,
        credentials: 'same-origin',
      });
      const raw = await res.text();
      const data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      if (!res.ok) {
        throw new Error(String(data.error ?? `HTTP ${res.status}`));
      }
      return data as unknown as OfxResultado;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.caixa });
    },
  });
}
