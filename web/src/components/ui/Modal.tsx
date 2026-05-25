import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

/** Tamanho do modal — controla max-width. */
export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'max-w-[420px]',
  md: 'max-w-[640px]',
  lg: 'max-w-[900px]',
  xl: 'max-w-[1100px]',
};

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Conteúdo do rodapé (botões de ação). */
  footer?: ReactNode;
  /** Tamanho do modal (default md = 640px). xl = 1100px (RDO form, etc). */
  size?: ModalSize;
}

/**
 * Diálogo modal — Radix UI por baixo (focus trap, ESC, click-outside,
 * portal e ARIA tudo nativo). API preservada da versão anterior.
 */
export default function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  size = 'md',
}: ModalProps) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
            'w-[90vw] max-h-[92vh] flex flex-col',
            'bg-card text-card-foreground rounded-lg shadow-lg border border-border',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            SIZE_CLASS[size],
          )}
        >
          <div className="flex items-center justify-between p-4 border-b border-border">
            <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
            <Dialog.Close
              className="rounded-md p-1 text-muted-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Fechar"
            >
              <X size={18} />
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-auto p-4">{children}</div>
          {footer ? <div className="p-4 border-t border-border">{footer}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
