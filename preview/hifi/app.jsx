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
        <DCSection id="contrato" title="Detalhe de contrato">
          <DCArtboard id="v5" label="CT-014 Veracel · Visão geral (5 abas)" width={1440} height={1280}>
            <ContractV5/>
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
