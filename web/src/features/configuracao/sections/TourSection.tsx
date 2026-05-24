import { useState } from 'react';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import OnboardingTour from '../../onboarding/OnboardingTour';
import { resetTour } from '../../onboarding/tourSteps';

/**
 * Seção "Tour Guiado" — porte de renderTour() em js/views/Configuracao.js.
 * Re-dispara o OnboardingTour zerando o flag de "já visto" no localStorage.
 */
export default function TourSection() {
  const [running, setRunning] = useState(false);

  function start() {
    resetTour();
    setRunning(true);
  }

  return (
    <>
      <div className="page-header" style={{ marginBottom: 'var(--sp-lg)' }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>🗺️ Tour Guiado</h2>
          <p className="page-subtitle">Revisitar o tour de boas-vindas</p>
        </div>
      </div>
      <Card style={{ padding: 'var(--sp-lg)' }}>
        <p
          className="text-muted"
          style={{ fontSize: 15, marginBottom: 16 }}
        >
          Relembre as principais funcionalidades do Rhino com o tour interativo
          de boas-vindas. Vou te guiar pelas telas principais em ~2 minutos.
        </p>
        <Button onClick={start} disabled={running}>
          🚀 {running ? 'Tour em andamento…' : 'Iniciar Tour'}
        </Button>
      </Card>

      <OnboardingTour active={running} onFinish={() => setRunning(false)} />
    </>
  );
}
