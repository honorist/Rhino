// Rhino Hi-fi — SPA com router por hash
// Cada rota renderiza UMA tela (sidebar fica fixa).

const ROUTES = {
  'dashboard':      () => <DashV1/>,
  'clientes':       () => <Clientes/>,
  'fornecedores':   () => <Fornecedores/>,
  'contratos':      () => <ContractsList/>,
  'contrato':       () => <ContractV5/>,
  'rdos':           () => <RdosList/>,
  'notas-fiscais':  () => <NotasFiscais/>,
  'contas-pagar':   () => <ContasPagar/>,
  'caixa':          () => <CaixaV6/>,
  'recursos':       () => <Recursos/>,
  'socios':         () => <Socios/>,
  'base':           () => <Base/>,
};

const useHashRoute = () => {
  const get = () => (window.location.hash || '#dashboard').replace(/^#/, '').split('?')[0] || 'dashboard';
  const [route, setRoute] = React.useState(get());
  React.useEffect(() => {
    const onHash = () => setRoute(get());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return route;
};

function App() {
  const route = useHashRoute();
  const [dark, setDark] = React.useState(false);

  React.useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  React.useEffect(() => {
    // Sincroniza botão dark no topbar externo (preview.html)
    const btn = document.getElementById('btnDark');
    if (btn) btn.textContent = dark ? '☀️ Modo claro' : '🌙 Modo escuro';
  }, [dark]);

  // Permite que o botão externo (preview.html) chame nosso toggle
  React.useEffect(() => {
    window.__previewToggleDark = () => setDark(d => !d);
  }, []);

  const Render = ROUTES[route] || ROUTES['dashboard'];
  return Render();
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App/>);
