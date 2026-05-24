import { useEffect, useRef, useState } from 'react';
import { useOnline } from '../hooks/useOnline';

/**
 * Banner inferior que avisa offline (vermelho, persistente) e online
 * (verde, some em 3s — só ao transicionar de offline→online).
 * Espelha o comportamento de js/offline.js.
 */
export default function OfflineBanner() {
  const online = useOnline();
  const [showOnlineBanner, setShowOnlineBanner] = useState(false);
  // Guarda o estado anterior para detectar a transição offline→online sem
  // mostrar o banner verde no mount inicial quando já estamos online.
  const prevOnlineRef = useRef<boolean>(online);

  useEffect(() => {
    const wasOnline = prevOnlineRef.current;
    prevOnlineRef.current = online;
    if (online && !wasOnline) {
      // Transição offline → online: mostrar verde por 3s
      setShowOnlineBanner(true);
      const id = window.setTimeout(() => setShowOnlineBanner(false), 3000);
      return () => window.clearTimeout(id);
    }
    if (online) {
      // já estava online; nada a mostrar
      setShowOnlineBanner(false);
    }
    return undefined;
  }, [online]);

  const visible = !online || showOnlineBanner;
  if (!visible) return null;

  const baseStyle: React.CSSProperties = {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    padding: '10px 16px',
    fontSize: 15,
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    transition: 'transform .3s ease',
    color: '#fff',
    background: online ? '#065F46' : '#991B1B',
  };

  return (
    <div id="rh-offline-bar" role="status" aria-live="polite" style={baseStyle}>
      {online
        ? '✅ Conexão restaurada — sincronizando…'
        : '⚠️ Sem conexão — as alterações serão salvas quando a rede voltar.'}
    </div>
  );
}
