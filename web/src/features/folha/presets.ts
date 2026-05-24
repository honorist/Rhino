/**
 * Itens comuns de folha e fórmulas de cálculo — lógica pura, porte de
 * `_PRESETS` / `_calcInss` de js/views/FolhaPagamento.js.
 */
import type { FolhaItemTipo } from './types';

/** Como o valor de um preset é obtido. */
export type PresetCalc =
  | 'hora' // (salário ÷ 220) × fator × horas
  | 'falta' // (salário ÷ 30) × dias
  | 'atraso' // (salário ÷ 220 ÷ 60) × minutos
  | 'sindical' // 2% do salário, teto R$ 70
  | 'inss' // tabela progressiva
  | 'livre' // descrição pronta, valor digitado
  | 'outro'; // descrição livre, valor digitado

export interface FolhaPreset {
  key: string;
  tipo: FolhaItemTipo;
  label: string;
  calc: PresetCalc;
  /** Multiplicador de hora extra (só para calc === 'hora'). */
  fator?: number;
}

export const PRESETS: FolhaPreset[] = [
  { key: 'he50', tipo: 'provento', label: 'Hora extra 50%', calc: 'hora', fator: 1.5 },
  { key: 'he60', tipo: 'provento', label: 'Hora extra 60%', calc: 'hora', fator: 1.6 },
  { key: 'he70', tipo: 'provento', label: 'Hora extra 70%', calc: 'hora', fator: 1.7 },
  { key: 'he100', tipo: 'provento', label: 'Hora extra 100%', calc: 'hora', fator: 2.0 },
  { key: 'plr', tipo: 'provento', label: 'Participação nos lucros', calc: 'livre' },
  { key: 'va', tipo: 'provento', label: 'Vale-alimentação', calc: 'livre' },
  { key: 'outro_p', tipo: 'provento', label: 'Outro provento', calc: 'outro' },
  { key: 'sind', tipo: 'desconto', label: 'Contribuição sindical', calc: 'sindical' },
  { key: 'inss', tipo: 'desconto', label: 'INSS', calc: 'inss' },
  { key: 'falta', tipo: 'desconto', label: 'Faltas', calc: 'falta' },
  { key: 'atraso', tipo: 'desconto', label: 'Atrasos', calc: 'atraso' },
  {
    key: 'dsr',
    tipo: 'desconto',
    label: 'Descanso Semanal Remunerado (D.S.R.)',
    calc: 'livre',
  },
  { key: 'outro_d', tipo: 'desconto', label: 'Outro desconto', calc: 'outro' },
];

export function findPreset(key: string): FolhaPreset | undefined {
  return PRESETS.find((p) => p.key === key);
}

/** Arredonda para 2 casas decimais. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * INSS progressivo do segurado empregado — tabela 2026 (Portaria
 * Interministerial MPS/MF nº 13, vigente desde 01/01/2026).
 * ATENÇÃO: a tabela muda todo ano — revisar limites e teto.
 */
export function calcInss(salario: number): number {
  const s = Math.min(Number(salario) || 0, 8475.55); // teto INSS 2026
  if (s <= 0) return 0;
  let inss = Math.min(s, 1621.0) * 0.075;
  if (s > 1621.0) inss += (Math.min(s, 2902.84) - 1621.0) * 0.09;
  if (s > 2902.84) inss += (Math.min(s, 4354.27) - 2902.84) * 0.12;
  if (s > 4354.27) inss += (s - 4354.27) * 0.14;
  return round2(inss);
}

/**
 * Valor sugerido de um preset. Para presets com quantidade (hora/falta/atraso)
 * usa `qtd`; para sindical/inss ignora `qtd`. Retorna `null` quando o valor é
 * sempre digitado manualmente (livre/outro).
 */
export function presetSuggestion(
  preset: FolhaPreset,
  salario: number,
  qtd: number,
): number | null {
  const s = Number(salario) || 0;
  switch (preset.calc) {
    case 'sindical':
      return round2(Math.min(s * 0.02, 70));
    case 'inss':
      return calcInss(s);
    case 'hora':
      return round2((s / 220) * (preset.fator ?? 1) * qtd);
    case 'falta':
      return round2((s / 30) * qtd);
    case 'atraso':
      return round2((s / 220 / 60) * qtd);
    default:
      return null;
  }
}

/** Monta a descrição final do lançamento a partir do preset e da quantidade. */
export function presetDescricao(
  preset: FolhaPreset,
  qtd: number,
  descricaoLivre: string,
): string {
  if (preset.calc === 'outro') return descricaoLivre.trim();
  if (preset.calc === 'hora' || preset.calc === 'falta' || preset.calc === 'atraso') {
    if (qtd <= 0) return preset.label;
    const unid =
      preset.calc === 'hora'
        ? `${qtd}h`
        : preset.calc === 'falta'
          ? `${qtd} ${qtd === 1 ? 'dia' : 'dias'}`
          : `${qtd} min`;
    return `${preset.label} (${unid})`;
  }
  return preset.label;
}
