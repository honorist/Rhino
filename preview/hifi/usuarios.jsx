// Rhino Hi-fi — Usuários (admin)

const ModalUsuario = ({ onClose, onSaved, niveis = [] }) => (
  <Modal title="+ Novo usuário" onClose={onClose} width={560}>
    <Form
      submitLabel="Criar usuário"
      onCancel={onClose}
      layout="grid-2"
      fields={[
        { name: 'name', label: 'Nome', required: true, full: true },
        { name: 'email', label: 'Email', type: 'email', required: true },
        { name: 'password', label: 'Senha', type: 'password', required: true, help: 'Mínimo 6 caracteres' },
        { name: 'nivelAcessoId', label: 'Nível de acesso', type: 'select', full: true,
          options: niveis.map(n => ({ value: n.id, label: n.nome || n.label || n.key })) },
      ]}
      onSubmit={async (v) => {
        await apiSubmit('POST', '/api/users', v);
        showToast('Usuário criado!');
        onSaved?.();
        onClose();
      }}
    />
  </Modal>
);
window.ModalUsuario = ModalUsuario;

const Usuarios = () => {
  const [data, setData] = React.useState(null);
  const [showModal, setShowModal] = React.useState(false);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    Promise.all([
      fetch('/api/users').then(r => r.json()).catch(() => ({ users: [] })),
      fetch('/api/niveis-acesso').then(r => r.json()).catch(() => ({ niveisAcesso: [], niveis: [] })),
    ]).then(([u, n]) => setData({
      users: u.users || [],
      niveis: n.niveisAcesso || n.niveis || [],
    }));
  }, [tick]);

  if (!data) return <div style={{ padding: 40, fontFamily: 'var(--font-sans)' }}>Carregando…</div>;

  const fmtTs = (ts) => {
    if (!ts) return '—';
    const d = new Date(ts);
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  };
  const nivelMap = new Map(data.niveis.map(n => [n.id, n.nome || n.label || n.key]));

  const ativos = data.users.filter(u => u.isActive !== false);
  const inativos = data.users.filter(u => u.isActive === false);

  const toggleActive = async (user) => {
    if (!confirm(`${user.isActive === false ? 'Reativar' : 'Desativar'} ${user.email}?`)) return;
    try {
      await apiSubmit('PUT', '/api/users/' + user.id, { isActive: user.isActive === false });
      showToast('Usuário atualizado');
      setTick(t => t + 1);
    } catch (e) { showToast(e.message, 'error'); }
  };

  return (
    <div className="hifi-screen">
      <div className="app">
        <Sidebar active="Usuários"/>
        <div className="main">
          <Topbar crumbs={["Administração", "Usuários"]}/>
          <div className="main-body">

            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <div>
                <h1 className="h1">Usuários</h1>
                <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
                  {ativos.length} ativos · {inativos.length} inativos
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" onClick={() => setShowModal(true)}><Icon name="plus" size={14}/> Novo usuário</button>
                <a className="btn" href="/#/usuarios" target="_top"><Icon name="arrow-right" size={14}/> Abrir no app</a>
              </div>
            </div>
            {showModal && <ModalUsuario onClose={() => setShowModal(false)} onSaved={() => setTick(t => t + 1)} niveis={data.niveis}/>}

            <div className="card">
              <div className="caixa-tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Usuário</th>
                      <th>Email</th>
                      <th>Nível de acesso</th>
                      <th>Último login</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.users.length === 0 && (
                      <tr><td colSpan="6" style={{ textAlign: 'center', padding: 30, color: 'var(--muted)' }}>Nenhum usuário</td></tr>
                    )}
                    {data.users.map(u => (
                      <tr key={u.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className="av sm">{(u.name || u.email || '?').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase()}</span>
                            <span className="strong">{u.name || '—'}</span>
                          </div>
                        </td>
                        <td className="muted">{u.email}</td>
                        <td>
                          {u.nivelAcessoId
                            ? <span className="tag accent">{nivelMap.get(u.nivelAcessoId) || 'Nível'}</span>
                            : <span className="muted" style={{ fontSize: 12 }}>—</span>}
                        </td>
                        <td className="muted tabular" style={{ fontSize: 12 }}>{fmtTs(u.lastLogin || u.last_login)}</td>
                        <td>
                          <span className={`tag ${u.isActive === false ? 'outline' : 'pos'}`}>
                            <span className="tag-dot"/> {u.isActive === false ? 'Inativo' : 'Ativo'}
                          </span>
                        </td>
                        <td>
                          <button className="btn btn-sm" onClick={() => toggleActive(u)}>
                            {u.isActive === false ? 'Reativar' : 'Desativar'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

window.Usuarios = Usuarios;
