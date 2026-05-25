import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

/** Tamanho do modal — controla max-width. */
export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'max-w-[480px]',
  md: 'max-w-[680px]',
  lg: 'max-w-[920px]',
  xl: 'max-w-[1120px]',
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
 * Padrão shadcn/ui: header `p-6` com title `text-lg font-semibold` e
 * descrição em `text-sm muted`; content `p-6` com `space-y-4` controlando
 * o gap entre form-rows; footer `p-6` com `bg-muted/30` separando do body.
 *
 * Prefixo `!` é usado nos paddings/margins críticos para vencer o CSS
 * legado em empate de especificidade (`.modal-overlay`, `.modal`).
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
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
            'w-[92vw] max-h-[90vh] flex flex-col',
            '!bg-card !text-card-foreground !rounded-xl shadow-2xl !border !border-border',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            SIZE_CLASS[size],
          )}
        >
          {/* Header: 24px em todos os lados (padrão shadcn DialogHeader),
              separador inferior, gap-2 entre title e descrição. */}
          <div className="flex items-start justify-between gap-4 !p-6 !border-b !border-border">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Dialog.Title className="!text-lg !font-semibold leading-none tracking-tight text-foreground">
                {title}
              </Dialog.Title>
              {description && (
                <Dialog.Description className="text-sm text-muted-foreground leading-relaxed">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close
              className="shrink-0 -mr-2 -mt-1 rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Fechar"
            >
              <X size={18} aria-hidden="true" />
            </Dialog.Close>
          </div>

          {/* Body: 24px em todos os lados (padrão shadcn). `space-y-4`
              entre filhos diretos do form garante respiro consistente entre
              FormFields sem depender do margin-bottom legado de `.form-group`. */}
          <div className="flex-1 overflow-y-auto !p-6 [&>form]:!space-y-4 [&>form_.form-row]:!gap-4">
            {children}
          </div>

          {/* Footer: 24px horizontal / 16px vertical, `bg-muted/30` cria a
              banda sutil que separa visualmente as ações do conteúdo.
              `gap-2` é o padrão shadcn entre botões de footer. */}
          {footer && (
            <div className="flex items-center justify-end gap-2 !px-6 !py-4 !border-t !border-border bg-muted/30 rounded-b-xl">
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
