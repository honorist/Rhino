import { useState } from 'react';
import Button from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { useForgotPassword, useLogin } from './queries';

/**
 * Tela de login + esqueci minha senha. Porte de showLoginModal em js/app.js.
 * Aparece em toda a viewport quando não há sessão (App.tsx faz o gate).
 */
export default function Login({
  onPortalClick,
}: {
  /** Callback opcional disparado ao clicar em "Área do Cliente". */
  onPortalClick?: () => void;
}) {
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  return (
    <div
      id="loginOverlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-bg)',
      }}
    >
      {mode === 'login' ? (
        <LoginForm onForgot={() => setMode('forgot')} onPortalClick={onPortalClick} />
      ) : (
        <ForgotForm onBack={() => setMode('login')} />
      )}
    </div>
  );
}

function LoginForm({
  onForgot,
  onPortalClick,
}: {
  onForgot: () => void;
  onPortalClick?: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const login = useLogin();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    try {
      await login.mutateAsync({ email, password });
    } catch (ex) {
      setError((ex as Error).message || 'Falha no login');
    }
  }

  return (
    <form
      id="loginForm"
      onSubmit={handleSubmit}
      style={{ width: '100%', maxWidth: 380, padding: 'var(--sp-xl)' }}
    >
      <div style={{ textAlign: 'center', marginBottom: 'var(--sp-xl)' }}>
        <img
          src="/assets/logo.png"
          alt="Rhino"
          style={{ height: 56, marginBottom: 'var(--sp-lg)', opacity: 0.9 }}
        />
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Acessar o Rhino</h1>
      </div>
      <div className="space-y-1.5">
        <label className="block text-sm font-medium leading-none text-foreground mb-1.5" htmlFor="login-email">
          Email
        </label>
        <Input
          id="login-email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <label className="block text-sm font-medium leading-none text-foreground mb-1.5" htmlFor="loginPwd">
          Senha
        </label>
        <div style={{ position: 'relative' }}>
          <Input
            id="loginPwd"
            name="password"
            type={showPwd ? 'text' : 'password'}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ paddingRight: 40 }}
          />
          <button
            id="togglePwd"
            type="button"
            aria-label={showPwd ? 'Ocultar senha' : 'Mostrar senha'}
            title={showPwd ? 'Ocultar senha' : 'Mostrar senha'}
            onClick={() => setShowPwd((v) => !v)}
            style={{
              position: 'absolute',
              right: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 6,
            }}
          >
            {showPwd ? '🙈' : '👁'}
          </button>
        </div>
      </div>
      {error && (
        <div
          id="loginError"
          role="alert"
          style={{ color: '#c33', fontSize: 13, marginBottom: 'var(--sp-md)' }}
        >
          {error}
        </div>
      )}
      <Button
        type="submit"
        style={{ width: '100%' }}
        disabled={login.isPending}
      >
        {login.isPending ? 'Entrando…' : 'Entrar'}
      </Button>
      <div style={{ textAlign: 'center', marginTop: 'var(--sp-md)' }}>
        <a
          href="#"
          id="goForgot"
          style={{ fontSize: 13, color: 'var(--color-primary)' }}
          onClick={(e) => {
            e.preventDefault();
            onForgot();
          }}
        >
          Esqueci minha senha
        </a>
      </div>
      <div
        style={{
          marginTop: 'var(--sp-lg)',
          borderTop: '1px solid var(--color-border)',
          paddingTop: 'var(--sp-lg)',
          textAlign: 'center',
        }}
      >
        <a
          href="/portal"
          id="goPortal"
          style={{ fontSize: 13, color: 'var(--color-text-muted)' }}
          onClick={(e) => {
            if (onPortalClick) {
              e.preventDefault();
              onPortalClick();
            }
          }}
        >
          Área do Cliente →
        </a>
      </div>
    </form>
  );
}

function ForgotForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const forgot = useForgotPassword();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    try {
      const j = await forgot.mutateAsync(email);
      setMsg({ text: j.message ?? 'Se o email existir, enviamos as instruções.', ok: true });
    } catch (ex) {
      setMsg({ text: (ex as Error).message, ok: false });
    }
  }

  return (
    <form
      id="forgotForm"
      onSubmit={handleSubmit}
      style={{ width: '100%', maxWidth: 380, padding: 'var(--sp-xl)' }}
    >
      <div style={{ textAlign: 'center', marginBottom: 'var(--sp-xl)' }}>
        <img
          src="/assets/logo.png"
          alt="Rhino"
          style={{ height: 56, marginBottom: 'var(--sp-lg)', opacity: 0.9 }}
        />
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 6px' }}>
          Esqueci minha senha
        </h1>
        <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 14 }}>
          Informe seu email pra receber o link de recuperação
        </p>
      </div>
      <div className="space-y-1.5">
        <label className="block text-sm font-medium leading-none text-foreground mb-1.5" htmlFor="forgot-email">
          Email
        </label>
        <Input
          id="forgot-email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      {msg && (
        <div
          id="forgotMsg"
          role="status"
          style={{
            fontSize: 13,
            marginBottom: 'var(--sp-md)',
            padding: '8px 12px',
            borderRadius: 6,
            background: msg.ok ? 'rgba(16,185,129,.1)' : 'rgba(220,38,38,.1)',
            color: msg.ok ? '#065f46' : '#7f1d1d',
          }}
        >
          {msg.text}
        </div>
      )}
      <Button
        type="submit"
        style={{ width: '100%' }}
        disabled={forgot.isPending}
      >
        {forgot.isPending ? 'Enviando…' : 'Enviar link'}
      </Button>
      <div style={{ textAlign: 'center', marginTop: 'var(--sp-md)' }}>
        <a
          href="#"
          id="backToLogin"
          style={{ fontSize: 13, color: 'var(--color-primary)' }}
          onClick={(e) => {
            e.preventDefault();
            onBack();
          }}
        >
          ← voltar ao login
        </a>
      </div>
    </form>
  );
}
