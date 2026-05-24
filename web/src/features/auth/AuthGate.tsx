import { useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import Spinner from '../../components/ui/Spinner';
import LgpdModal from './LgpdModal';
import Login from './Login';
import { usePerfilStore } from './perfilStore';
import ProfilePicker from './ProfilePicker';
import { useCurrentUser, useNiveisAcesso } from './queries';
import { ApiError } from '../../lib/api';

/**
 * Gate de autenticação. Decide o que renderizar baseado em quatro estados:
 *
 * 1. `currentUser` carregando → spinner (boot inicial)
 * 2. sem sessão (401 ou sem user) → <Login />
 * 3. user sem `acceptedTermsAt` → <LgpdModal />
 * 4. user.nivelAcessoId presente → auto-seleciona perfil (useEffect)
 * 5. sem perfil escolhido → <ProfilePicker />
 * 6. tudo pronto → renderiza `children` (o resto do App / Shell)
 *
 * Porte do bloco DOMContentLoaded em js/app.js (linhas ~1470-1507).
 */
export default function AuthGate({ children }: { children: ReactNode }) {
  const meQuery = useCurrentUser();
  const niveisQuery = useNiveisAcesso();
  const perfil = usePerfilStore((s) => s.current);
  const setPerfil = usePerfilStore((s) => s.set);
  const navigate = useNavigate();

  const isUnauth =
    meQuery.error instanceof ApiError && meQuery.error.isUnauthorized;

  const user = meQuery.data?.user;
  const userNivelId = user?.nivelAcessoId ?? null;
  const niveis = niveisQuery.data?.niveis;

  // Auto-seleção de perfil quando o user já tem nivelAcessoId atrelado.
  useEffect(() => {
    if (!user || perfil || !userNivelId || !niveis) return;
    const nivel = niveis.find((n) => n.id === userNivelId);
    if (nivel) setPerfil(nivel);
  }, [user, perfil, userNivelId, niveis, setPerfil]);

  // 1. Boot — esperando a primeira resposta
  if (meQuery.isPending && !isUnauth) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Spinner />
      </div>
    );
  }

  // 2. Sem sessão
  if (!user) {
    return <Login onPortalClick={() => navigate('/portal')} />;
  }

  // 3. LGPD pendente
  if (!user.acceptedTermsAt) {
    return <LgpdModal />;
  }

  // 4. Auto-seleção em curso (effect roda no próximo tick) — evita flash do picker
  if (!perfil && userNivelId && niveis) {
    const match = niveis.find((n) => n.id === userNivelId);
    if (match) {
      // Effect ainda não rodou; mostra spinner pra evitar piscada.
      return (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Spinner />
        </div>
      );
    }
  }

  // 5. ProfilePicker
  if (!perfil) {
    return <ProfilePicker />;
  }

  // 6. Pronto — passa para o restante do app
  return <>{children}</>;
}
