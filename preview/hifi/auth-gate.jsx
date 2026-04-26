// Rhino Hi-fi — AuthGate: detecta sessão e mostra login se necessário

const Login = ({ onSuccess }) => {
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!r.ok) {
        const t = await r.text();
        let msg = t;
        try { msg = JSON.parse(t).error || t; } catch {}
        throw new Error(msg);
      }
      onSuccess?.();
    } catch (e) {
      setErr(e.message || 'Credenciais inválidas');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--paper-2)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-sans)', padding: 20,
    }}>
      <div className="card" style={{ width: 400, maxWidth: '100%', padding: 32, boxShadow: 'var(--shadow-pop)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 56, height: 56, background: 'var(--ink)', borderRadius: 12,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12,
          }}>
            <svg viewBox="0 0 32 32" width="32" height="32" fill="white">
              <path d="M3 19c0-2 1-4 3-5l1-2c0-2 2-4 5-4l2-1 4 1 3 1c2 0 4 1 5 3l3 1v3l-2 1-1 4-2 2v3h-4v-3h-7v3h-4v-4l-2-1z"/>
              <circle cx="22" cy="14.5" r="0.8" fill="#0c0d10"/>
            </svg>
          </div>
          <h1 className="h1" style={{ marginBottom: 4 }}>Rhino</h1>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>Gestão de contratos industriais</p>
        </div>

        <form onSubmit={submit}>
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label" style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 500 }}>Email</label>
            <input className="form-control" type="email" required autoFocus autoComplete="email"
              value={email} onChange={e => setEmail(e.target.value)} style={{ width: '100%' }}/>
          </div>
          <div className="form-group" style={{ marginBottom: 18 }}>
            <label className="form-label" style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 500 }}>Senha</label>
            <input className="form-control" type="password" required autoComplete="current-password"
              value={password} onChange={e => setPassword(e.target.value)} style={{ width: '100%' }}/>
          </div>

          {err && (
            <div style={{ background: 'var(--neg-soft)', color: 'var(--neg)', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{err}</div>
          )}

          <button type="submit" className="btn btn-primary" disabled={busy} style={{ width: '100%', padding: 10 }}>
            {busy ? 'Entrando…' : 'Entrar'}
          </button>

          <div style={{ textAlign: 'center', marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
            <a href="/legacy.html" style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}>
              Esqueci minha senha · Versão antiga do app
            </a>
          </div>
        </form>
      </div>
    </div>
  );
};

const AuthGate = ({ children }) => {
  const [state, setState] = React.useState('checking'); // checking | authed | guest
  const [user, setUser] = React.useState(null);

  const check = React.useCallback(() => {
    setState('checking');
    fetch('/api/auth/me')
      .then(r => {
        if (r.ok) return r.json();
        throw new Error('not_logged');
      })
      .then(d => {
        setUser(d.user);
        setState('authed');
      })
      .catch(() => {
        setUser(null);
        setState('guest');
      });
  }, []);

  React.useEffect(() => {
    check();
  }, [check]);

  if (state === 'checking') {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-sans)', color: 'var(--muted)', fontSize: 14,
      }}>
        Carregando…
      </div>
    );
  }
  if (state === 'guest') {
    return <Login onSuccess={check}/>;
  }
  return children;
};

window.Login = Login;
window.AuthGate = AuthGate;
