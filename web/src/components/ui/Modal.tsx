import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';

/** Tamanho do modal — controla max-width. */
export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'sm:max-w-[480px]',
  md: 'sm:max-w-[680px]',
  lg: 'sm:max-w-[920px]',
  xl: 'sm:max-w-[1120px]',
};

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  description?: ReactNode;
}

/**
 * @deprecated Usar Dialog composicional diretamente.
 * Ex.: <Dialog><DialogContent><DialogHeader><DialogTitle>...</DialogTitle></DialogHeader>...</DialogContent></Dialog>
 * Será removido em v1.4.0.
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
  if (import.meta.env.DEV) {
    console.warn(
      '[Modal] deprecated — usar <Dialog> composicional. Será removido em v1.4.0.',
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className={cn('p-0 gap-0 w-[92vw]', SIZE_CLASS[size])}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && (
            <DialogDescription>{description}</DialogDescription>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 [&>form]:space-y-4 [&>form_.form-row]:gap-4">
          {children}
        </div>

        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
