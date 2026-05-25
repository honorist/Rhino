import { useMemo, useState } from 'react';
import Button from '../../components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { fetchRotaOSRM, fmtMin, haversine, type RotaOSRM } from '../../lib/geo';
import { useContracts } from '../contracts/queries';
import type { Veiculo } from '../../types/domain';

interface ObraDistancia {
  id: string;
  name: string;
  endereco: string;
  lat: number;
  lng: number;
  kmReta: number;
}

interface DistanciasModalProps {
  veiculo: Veiculo;
  onClose: () => void;
}

/** Modal de distâncias do veículo até as obras (Haversine + OSRM). */
export default function DistanciasModal({
  veiculo,
  onClose,
}: DistanciasModalProps) {
  const contractsQuery = useContracts();
  const [rotas, setRotas] = useState<Record<string, RotaOSRM | null>>({});
  const [calculando, setCalculando] = useState(false);
  const [calculado, setCalculado] = useState(false);

  const lat1 = Number(veiculo.lat);
  const lng1 = Number(veiculo.lng);

  const obras = useMemo<ObraDistancia[]>(() => {
    return (contractsQuery.data ?? [])
      .filter((c) => c.lat && c.lng)
      .map((c) => {
        const lat = Number(c.lat);
        const lng = Number(c.lng);
        return {
          id: c.id,
          name: String(c.name ?? ''),
          endereco: String(c.endereco ?? '')
            .split(',')
            .slice(0, 2)
            .join(', '),
          lat,
          lng,
          kmReta: haversine(lat1, lng1, lat, lng),
        };
      })
      .sort((a, b) => a.kmReta - b.kmReta);
  }, [contractsQuery.data, lat1, lng1]);

  async function calcularRotas() {
    setCalculando(true);
    const resultado: Record<string, RotaOSRM | null> = {};
    for (const obra of obras) {
      resultado[obra.id] = await fetchRotaOSRM(lat1, lng1, obra.lat, obra.lng);
    }
    setRotas(resultado);
    setCalculando(false);
    setCalculado(true);
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="p-0 gap-0 w-[92vw] sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>{`Distâncias de ${veiculo.placa} até as obras`}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <p
            style={{
              margin: '0 0 var(--sp-md)',
              fontSize: 13,
              color: 'var(--color-text-muted)',
            }}
          >
            A partir de: {veiculo.endereco || '—'}
          </p>

          {obras.length === 0 ? (
            <p className="text-muted">
              Nenhuma obra com coordenadas cadastradas.
            </p>
          ) : (
            <>
              <div style={{ marginBottom: 'var(--sp-sm)' }}>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={calcularRotas}
                  disabled={calculando}
                >
                  {calculando
                    ? 'Calculando...'
                    : calculado
                      ? '✓ rotas calculadas'
                      : 'Calcular rotas reais (OSRM)'}
                </Button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Obra</th>
                      <th style={{ textAlign: 'right' }}>Linha reta</th>
                      <th style={{ textAlign: 'right' }}>Rota real</th>
                      <th style={{ textAlign: 'right' }}>Tempo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {obras.map((obra) => {
                      const rota = rotas[obra.id];
                      return (
                        <tr key={obra.id}>
                          <td>
                            <strong>{obra.name}</strong>
                            <div
                              style={{
                                fontSize: 12,
                                color: 'var(--color-text-muted)',
                              }}
                            >
                              {obra.endereco}
                            </div>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {obra.kmReta.toFixed(1)} km
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {rota ? `${rota.km.toFixed(1)} km` : '—'}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {rota ? fmtMin(rota.min) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
