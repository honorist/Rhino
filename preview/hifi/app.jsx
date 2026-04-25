// Rhino Hi-fi — Canvas com 3 telas
function App() {
  const [tweaks, setTweak] = useTweaks(/*EDITMODE-BEGIN*/{
    "dark": false
  }/*EDITMODE-END*/);
  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", tweaks.dark);
  }, [tweaks.dark]);

  return (
    <>
      <DesignCanvas
        title="Rhino — Hi-fi v1"
        subtitle="ERP de contratos industriais · 3 telas profissionais"
      >
        <DCSection id="dashboard" title="Dashboard executivo">
          <DCArtboard id="v1" label="Dashboard · score, fluxo, contratos, RDO, eventos" width={1440} height={1900}>
            <DashV1/>
          </DCArtboard>
        </DCSection>
        <DCSection id="clientes" title="Clientes">
          <DCArtboard id="cli" label="Clientes · carteira por cliente" width={1440} height={1000}>
            <Clientes/>
          </DCArtboard>
        </DCSection>
        <DCSection id="fornecedores" title="Fornecedores">
          <DCArtboard id="forn" label="Fornecedores · gasto e contas pendentes" width={1440} height={1000}>
            <Fornecedores/>
          </DCArtboard>
        </DCSection>
        <DCSection id="contratos" title="Lista de contratos">
          <DCArtboard id="ctlist" label="Contratos · filtros, status, link para detalhe" width={1440} height={1100}>
            <ContractsList/>
          </DCArtboard>
        </DCSection>
        <DCSection id="contrato" title="Detalhe de contrato">
          <DCArtboard id="v5" label="Primeiro contrato ativo · Visão geral" width={1440} height={1280}>
            <ContractV5/>
          </DCArtboard>
        </DCSection>
        <DCSection id="rdos" title="RDOs · Todos os contratos">
          <DCArtboard id="rdolist" label="RDOs global · KPIs de aderência e alertas" width={1440} height={1300}>
            <RdosList/>
          </DCArtboard>
        </DCSection>
        <DCSection id="notas-fiscais" title="Notas fiscais">
          <DCArtboard id="nf" label="NFs · pipeline rascunho/emitida/recebida" width={1440} height={1100}>
            <NotasFiscais/>
          </DCArtboard>
        </DCSection>
        <DCSection id="contas-pagar" title="Contas a pagar">
          <DCArtboard id="cp" label="Contas a pagar · KPIs, alertas e lista filtravel" width={1440} height={1100}>
            <ContasPagar/>
          </DCArtboard>
        </DCSection>
        <DCSection id="recursos" title="Recursos">
          <DCArtboard id="rec" label="Recursos · pessoas, alocacao, documentos" width={1440} height={1100}>
            <Recursos/>
          </DCArtboard>
        </DCSection>
        <DCSection id="caixa" title="Livro caixa">
          <DCArtboard id="v6" label="Caixa unificado · entradas/saídas com vínculos" width={1440} height={1100}>
            <CaixaV6/>
          </DCArtboard>
        </DCSection>
      </DesignCanvas>

      <TweaksPanel title="Tweaks">
        <TweakSection title="Visual">
          <TweakToggle label="Modo escuro" value={tweaks.dark} onChange={(v) => setTweak("dark", v)}/>
        </TweakSection>
      </TweaksPanel>
    </>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App/>);
