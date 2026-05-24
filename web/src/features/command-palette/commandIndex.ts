/**
 * Indexa rotas + ações globais. Núcleo puro do CommandPalette — testável
 * sem React. Espelha getCommandIndex() de js/polish.js.
 */
import { ROUTES } from '../../routes/config';

export interface CommandItem {
  /** Texto principal exibido. */
  label: string;
  /** Texto secundário (categoria). */
  hint: string;
  /** Caractere/emoji curto. */
  icon: string;
  /** Ação ao confirmar (Enter/click). */
  run: () => void;
}

interface BuildArgs {
  navigate: (path: string) => void;
  toggleTheme: () => void;
  toggleHighContrast?: () => void;
}

/** Monta a lista completa de comandos disponíveis. */
export function buildCommandIndex({
  navigate,
  toggleTheme,
  toggleHighContrast,
}: BuildArgs): CommandItem[] {
  const items: CommandItem[] = [];

  // Rotas — exclui detalhes (:id) e rotas contextuais sem label no menu.
  for (const r of ROUTES) {
    if (r.path.includes(':id')) continue;
    const label = r.label ?? r.title;
    if (!label) continue;
    items.push({
      label,
      hint: 'Ir para',
      icon: '→',
      run: () => navigate(r.path),
    });
  }

  // Ações globais
  items.push({
    label: 'Alternar tema (claro/escuro)',
    hint: 'Tema',
    icon: '◐',
    run: toggleTheme,
  });
  items.push({
    label: 'Abrir Manual do Usuário',
    hint: 'Ajuda',
    icon: '?',
    run: () => navigate('/manual'),
  });
  if (toggleHighContrast) {
    items.push({
      label: 'Alternar alto contraste',
      hint: 'Acessibilidade',
      icon: '◑',
      run: toggleHighContrast,
    });
  }

  return items;
}

/** Normaliza string para busca: minúscula + sem acentos. */
export function normalize(s: unknown): string {
  return (s == null ? '' : String(s))
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Filtra a lista por query usando label + hint. */
export function filterCommands(items: readonly CommandItem[], query: string): CommandItem[] {
  const q = normalize(query.trim());
  if (!q) return [...items];
  return items.filter(
    (it) => normalize(it.label).includes(q) || normalize(it.hint).includes(q),
  );
}
