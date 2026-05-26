import type { ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu';

export interface RowAction {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  /** Marca a ação como destrutiva (Excluir, Cancelar etc.) — vermelho. */
  destructive?: boolean;
  /** Desabilita o item visualmente e a interação. */
  disabled?: boolean;
  /** Quando truthy, insere DropdownMenuSeparator antes deste item. */
  separated?: boolean;
}

interface RowActionMenuProps {
  actions: RowAction[];
  /** aria-label do trigger (botão de 3 pontos). Default: "Ações da linha". */
  label?: string;
}

/** Menu 3-pontos padrão para ações de linha de tabela. Substitui o pattern
 *  de múltiplos action-link inline, que consome espaço horizontal e dilui
 *  hierarquia. */
export function RowActionMenu({
  actions,
  label = 'Ações da linha',
}: RowActionMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-44"
        onClick={(e) => e.stopPropagation()}
      >
        {actions.map((action, i) => (
          <>
            {action.separated && i > 0 && (
              <DropdownMenuSeparator key={`sep-${i}`} />
            )}
            <DropdownMenuItem
              key={action.label}
              onClick={action.onClick}
              disabled={action.disabled}
              variant={action.destructive ? 'destructive' : 'default'}
            >
              {action.icon}
              {action.label}
            </DropdownMenuItem>
          </>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
