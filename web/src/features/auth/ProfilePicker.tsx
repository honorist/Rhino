import Spinner from '../../components/ui/Spinner';
import { usePerfilStore } from './perfilStore';
import { useNiveisAcesso } from './queries';

/**
 * Tela de seleção de perfil de acesso. Porte de showProfilePicker em js/app.js.
 * Aparece após login + LGPD enquanto !perfil. Auto-resolve quando o user tem
 * `nivelAcessoId` (lógica está em App.tsx).
 */
export default function ProfilePicker() {
  const { data, isLoading, error } = useNiveisAcesso();
  const setPerfil = usePerfilStore((s) => s.set);

  return (
    <div
      id="profilePicker"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-bg)',
      }}
    >
      <div style={{ width: '100%', maxWidth: 680, padding: 'var(--sp-xl)' }}>
        <div style={{ textAlign: 'center', marginBottom: 'var(--sp-xl)' }}>
          <img
            src="/assets/logo.png"
            alt="Rhino"
            style={{ height: 56, marginBottom: 'var(--sp-lg)', opacity: 0.9 }}
          />
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 var(--sp-sm)' }}>
            Selecione seu perfil
          </h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 15, margin: 0 }}>
            Escolha o nível de acesso para continuar
          </p>
        </div>

        {isLoading && (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Spinner />
          </div>
        )}

        {error && (
          <div role="alert" style={{ color: '#c33', textAlign: 'center', fontSize: 14 }}>
            Não foi possível carregar os níveis de acesso: {(error as Error).message}
          </div>
        )}

        {data && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 'var(--sp-md)',
            }}
          >
            {data.niveis.map((n) => (
              <button
                key={n.id}
                type="button"
                className="perfil-card"
                data-id={n.id}
                onClick={() => setPerfil(n)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--sp-md)',
                  padding: 'var(--sp-lg)',
                  borderRadius: 10,
                  background: 'var(--color-surface)',
                  border: '2px solid var(--color-border)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all .15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = n.cor;
                  e.currentTarget.style.background = n.cor + '18';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border)';
                  e.currentTarget.style.background = 'var(--color-surface)';
                }}
              >
                <span style={{ fontSize: 36, lineHeight: 1 }}>{n.icon}</span>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: n.cor }}>
                    {n.label}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
