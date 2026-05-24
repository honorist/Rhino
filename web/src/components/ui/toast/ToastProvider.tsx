import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { ToastContext, type ToastKind } from './ToastContext';

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

const TOAST_TTL_MS = 4000;

/**
 * Provedor de toasts — substitui o `window.showToast` global do app antigo.
 * Renderiza a pilha de toasts (.toast-stack) ao fim da árvore.
 */
export default function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const show = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message, kind }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, TOAST_TTL_MS);
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast toast--${toast.kind}`}
            role="status"
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
