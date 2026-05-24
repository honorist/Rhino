/**
 * Tipos do editor de Proposta (PropostaDetail) — porte de js/views/PropostaDetail.js
 * e dos submódulos js/views/proposta/*.
 *
 * `Proposta` (types/domain.ts) tipa os campos de listagem; aqui `PropostaDetalhe`
 * adiciona os campos editáveis das 8 abas do editor.
 */
import type { Proposta } from '../../types/domain';

/** Item da aba Escopo — `incluso=false` vira seção EXCLUSÕES no DOCX. */
export interface EscopoItem {
  id: string;
  texto: string;
  incluso: boolean;
  ordem?: number;
}

/** Cláusula inserida na aba Obrigações (cópia editável da biblioteca). */
export interface ObrigacaoItem {
  id: string;
  /** id da cláusula da biblioteca de origem, ou null se texto livre. */
  clausulaId: string | null;
  titulo: string;
  texto: string;
}

/** Fase da aba Cronograma. */
export interface FaseCronograma {
  id: string;
  fase: string;
  inicio: string | null;
  fim: string | null;
  duracaoDias: number;
  ordem?: number;
}

/** Linha de mão de obra (aba Investimento, tipo hh/ambos). */
export interface LinhaHH {
  id: string;
  cargo: string;
  qtd: number;
  horas: number;
  valorHora: number;
}

/** Linha de material (aba Investimento, tipo material/ambos). */
export interface LinhaMaterial {
  id: string;
  item: string;
  qtd: number;
  unid: string;
  valorUnit: number;
}

/** Categorias da aba Custo Interno. */
export type CustoCategoria =
  | 'mao_obra'
  | 'material'
  | 'equipamento'
  | 'frete'
  | 'impostos'
  | 'bdi'
  | 'lucro'
  | 'outros';

/** Item de custo interno (privado — não exportado no DOCX). */
export interface CustoItem {
  id: string;
  categoria: CustoCategoria;
  descricao: string;
  valor: number;
  percentual?: number | null;
}

/** Anexo da proposta (imagem ilustrativa ou PDF). */
export interface PropostaAnexo {
  id: string;
  nome: string;
  tipo: 'imagem' | 'pdf';
  secao: string;
  legenda?: string;
  sizeBytes?: number;
}

/**
 * Proposta completa, como devolvida por GET /api/propostas/:id e manipulada
 * pelo editor. Herda os campos de listagem de `Proposta`.
 */
export interface PropostaDetalhe extends Proposta {
  // ── Dados Gerais ──
  clienteDocumento?: string;
  clienteContato?: string;
  clienteCargo?: string;
  clienteEmail?: string;
  clienteTelefone?: string;
  clienteEndereco?: string;
  objetivo?: string;
  saudacao?: string;
  signatario?: string;
  signatarioCargo?: string;
  observacoes?: string;
  validadeDias?: number;
  garantiaMeses?: number | null;
  prazoExecucao?: string;
  condicoesPagamento?: string;
  // ── Coleções das abas ──
  escopo: EscopoItem[];
  obrigacoesContratada: ObrigacaoItem[];
  obrigacoesContratante: ObrigacaoItem[];
  cronograma: FaseCronograma[];
  investimentoHh: LinhaHH[];
  investimentoMat: LinhaMaterial[];
  custos: CustoItem[];
  anexos: PropostaAnexo[];
  metadata: Record<string, unknown>;
}

/** Patch parcial aplicado pelo autosave / pelas abas. */
export type PropostaPatch = Partial<PropostaDetalhe>;

/** Props comuns recebidas por cada aba do editor. */
export interface EditorTabProps {
  proposta: PropostaDetalhe;
  /** Aplica um patch e agenda o autosave (PUT debounced). */
  onChange: (patch: PropostaPatch) => void;
  /**
   * Aplica um patch só no estado local, sem autosave. Usado pelas abas que
   * persistem por endpoints próprios (Custo Interno, Anexos).
   */
  onLocalUpdate: (patch: PropostaPatch) => void;
}

/**
 * Normaliza a resposta do backend: campos JSONB chegam como objeto do Postgres,
 * mas mantemos defesa caso venham como string. Garante arrays sempre presentes.
 */
export function normalizeProposta(raw: Proposta): PropostaDetalhe {
  const parseJson = <T>(value: unknown, fallback: T): T => {
    if (Array.isArray(value) || (value !== null && typeof value === 'object')) {
      return value as T;
    }
    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as T;
      } catch {
        return fallback;
      }
    }
    return fallback;
  };

  const p = raw as Record<string, unknown>;
  return {
    ...(raw as PropostaDetalhe),
    escopo: parseJson<EscopoItem[]>(p.escopo, []),
    obrigacoesContratada: parseJson<ObrigacaoItem[]>(p.obrigacoesContratada, []),
    obrigacoesContratante: parseJson<ObrigacaoItem[]>(p.obrigacoesContratante, []),
    cronograma: parseJson<FaseCronograma[]>(p.cronograma, []),
    investimentoHh: parseJson<LinhaHH[]>(p.investimentoHh, []),
    investimentoMat: parseJson<LinhaMaterial[]>(p.investimentoMat, []),
    metadata: parseJson<Record<string, unknown>>(p.metadata, {}),
    custos: Array.isArray(p.custos) ? (p.custos as CustoItem[]) : [],
    anexos: Array.isArray(p.anexos) ? (p.anexos as PropostaAnexo[]) : [],
  };
}

let uidCounter = 0;
/** Gera um id local para itens novos (escopo, fases, linhas). */
export function localUid(prefix: string): string {
  uidCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${uidCounter.toString(36)}`;
}
