import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

/** Tamanho do modal — controla max-width. */
export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'max-w-[560px]',
  md: 'max-w-[800px]',
  lg: 'max-w-[1040px]',
  xl: 'max-w-[1280px]',
};

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Conteúdo do rodapé (botões de ação). */
  footer?: ReactNode;
  /** Tamanho do modal (default md = 680px). xl = 1120px (RDO form, etc). */
  size?: ModalSize;
  /** Subtítulo opcional abaixo do title (contexto curto). */
  description?: ReactNode;
}

/**
 * Diálogo modal — Radix UI por baixo (focus trap, ESC, click-outside,
 * portal e ARIA tudo nativo). API preservada da versão anterior.
 *
 * Espaçamento generoso: header 24px, content 24-32px, footer 20-24px com
 * separadores claros. Title em 18px/semibold para hierarquia visível.
 */
export default function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  size = 'md',
  description,
}: ModalProps) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
            'w-[92vw] max-h-[90vh] flex flex-col',
            'bg-card text-card-foreground rounded-xl shadow-2xl border border-border',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            SIZE_CLASS[size],
          )}
        >
          {/* Header: 28px vertical, 32px horizontal, separador inferior */}
          <div className="flex items-start justify-between gap-4 px-8 pt-7 pb-6 border-b border-border">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-[18px] font-semibold leading-tight text-foreground">
                {title}
              </Dialog.Title>
              {description && (
                <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close
              className="shrink-0 -mr-2 -mt-1 rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Fechar"
            >
              <X size={20} />
            </Dialog.Close>
          </div>

          {/* Content: 28px horizontal, 24px vertical; rolável quando passa
              do max-h. `space-y-5` dá gap consistente entre form-rows e
              outros blocos sem depender do margin-bottom do .form-group. */}
          <div className="flex-1 overflow-y-auto px-8 py-7 [&>form]:space-y-6">
            {children}
          </div>

          {/* Footer: 20px vertical, 28px horizontal, separador superior.
              gap-3 entre botões alinhados à direita. */}
          {footer && (
            <div className="flex items-center justify-end gap-3 px-8 py-6 border-t border-border bg-muted/30 rounded-b-xl">
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
