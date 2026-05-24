import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/** Tamanho do modal — controla max-width. */
export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_MAX_WIDTH: Record<ModalSize, string> = {
  sm: '420px',
  md: '640px',
  lg: '900px',
  xl: '1100px',
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
 * Diálogo modal — classes .modal-* do CSS atual, renderizado em portal.
 * Fecha com Esc ou clique no backdrop.
 */
export default function Modal({ open, title, onClose, children, footer, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="modal-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          width: '90vw',
          maxWidth: SIZE_MAX_WIDTH[size],
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>
        <div className="modal-content">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
