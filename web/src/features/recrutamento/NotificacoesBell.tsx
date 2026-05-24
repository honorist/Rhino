import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useMarcarLida, useNotificacoes, type Notificacao } from './queries';

/**
 * Sininho de notificações na sidebar.
 * Mostra badge com a contagem de não-lidas. Click → dropdown com até 10
 * notificações. Click numa item → marca lida + navega ao link (se houver).
 *
 * Polling: useNotificacoes refetch a cada 60s (definido na query).
 */
export default function NotificacoesBell() {
  const navigate = useNavigate();
  const { data } = useNotificacoes();
  const marcarLida = useMarcarLida();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const lista = data?.notificacoes ?? [];
  const naoLidas = lista.filter((n) => !n.lida);
  const badge = naoLidas.length;

  // Fecha ao clicar fora.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    const id = window.setTimeout(() => document.addEventListener('click', onClick), 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('click', onClick);
    };
  }, [open]);

  function handleClick(n: Notificacao) {
    if (!n.lida) marcarLida.mutate(n.id);
    if (n.link) navigate(n.link);
    setOpen(false);
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className="theme-toggle-btn"
        onClick={() => setOpen((v) => !v)}
        title={badge > 0 ? `${badge} não lida${badge !== 1 ? 's' : ''}` : 'Notificações'}
        aria-label="Notificações"
        style={{ marginBottom: 4, position: 'relative' }}
      >
        <span className="theme-toggle-icon">
          <Bell size={16} />
        </span>
        <span style={{ fontWeight: 600 }}>Notificações</span>
        {badge > 0 && (
          <span
            style={{
              marginLeft: 'auto',
              background: '#DC2626',
              color: '#fff',
              borderRadius: 10,
              padding: '0 6px',
              fontSize: 11,
              fontWeight: 700,
              minWidth: 18,
              textAlign: 'center',
            }}
          >
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notificações"
          style={{
            position: 'absolute',
            bottom: '110%',
            left: 0,
            right: 0,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,.15)',
            maxHeight: '60vh',
            overflowY: 'auto',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              padding: '10px 12px',
              borderBottom: '1px solid var(--color-border)',
              fontWeight: 700,
              fontSize: 13,
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>Notificações</span>
            <span className="text-muted" style={{ fontWeight: 400 }}>
              {badge} não lida{badge !== 1 ? 's' : ''}
            </span>
          </div>
          {lista.length === 0 ? (
            <p
              className="text-muted"
              style={{ padding: 'var(--sp-md)', textAlign: 'center', fontSize: 13 }}
            >
              Sem notificações.
            </p>
          ) : (
            lista.slice(0, 10).map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => handleClick(n)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 12px',
                  border: 'none',
                  background: n.lida ? 'transparent' : 'rgba(49,130,206,.06)',
                  borderBottom: '1px solid var(--color-border)',
                  borderLeft: `3px solid ${n.lida ? 'transparent' : '#3182CE'}`,
                  cursor: 'pointer',
                  fontSize: 13,
                  color: 'var(--color-text)',
                }}
              >
                <div
                  style={{
                    fontWeight: n.lida ? 500 : 700,
                    marginBottom: 2,
                  }}
                >
                  {n.titulo}
                </div>
                {n.mensagem && (
                  <div
                    className="text-muted"
                    style={{ fontSize: 12, marginBottom: 2 }}
                  >
                    {n.mensagem}
                  </div>
                )}
                <div className="text-muted" style={{ fontSize: 11 }}>
                  {new Date(n.createdAt).toLocaleString('pt-BR')}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
