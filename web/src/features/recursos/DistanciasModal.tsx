import { useMemo, useState } from 'react';
import { Badge } from '../../components/ui/badge';
import Button from '../../components/ui/button';
import DataTable, { type Column } from '../../components/ui/data-table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { fetchRotaOSRM, fmtMin, haversine, type RotaOSRM } from '../../lib/geo';
import { useContracts } from '../contracts/queries';
import type { Recurso } from '../../types/domain';

interface ObraDistancia {
  id: string;
  name: string;
  client: string;
  lat: number;
  lng: number;
  kmReta: number;
  atual: boolean;
}

interface DistanciasModalProps {
  recurso: Recurso;
  onClose: () => void;
}

/** Modal de distâncias do colaborador até as obras ativas. */
export default function DistanciasModal({
  recurso,
  onClose,
}: DistanciasModalProps) {
  const contractsQuery = useContracts();
  const [rotas, setRotas] = useState<Record<string, RotaOSRM | null>>({});
  const [calculando, setCalculando] = useState(false);

  const lat1 = Number(recurso.lat);
  const lng1 = Number(recurso.lng);

  const obras = useMemo<ObraDistancia[]>(
    () =>
      (contractsQuery.data ?? [])
        .filter((c) => c.status === 'ativo' && c.lat && c.lng)
        .map((c) => {
          const lat = Number(c.lat);
          const lng = Number(c.lng);
          return {
            id: c.id,
            name: String(c.name ?? ''),
            client: String(c.client ?? ''),
            lat,
            lng,
            kmReta: haversine(lat1, lng1, lat, lng),
            atual: recurso.alocacaoAtual?.contractId === c.id,
          };
        })
        .sort((a, b) => a.kmReta - b.kmReta),
    [contractsQuery.data, lat1, lng1, recurso.alocacaoAtual],
  );

  const columns = useMemo((): Column<ObraDistancia>[] => [
    {
      id: 'obra',
      header: 'Obra',
      cell: (o) => (
        <>
          <strong>{o.name}</strong>
          {o.atual && (
            <Badge style={{ marginLeft: 6, background: '#D1FAE5', color: '#065F46' }}>
              OBRA ATUAL
            </Badge>
          )}
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            {o.client}
          </div>
        </>
      ),
    },
    {
      id: 'kmReta',
      header: 'Linha reta',
      align: 'right',
      cell: (o) => `${o.kmReta.toFixed(1)} km`,
    },
    {
      id: 'rotaReal',
      header: 'Rota real',
      align: 'right',
      cell: (o) => {
        const r = rotas[o.id];
        return r ? `${r.km.toFixed(1)} km` : '—';
      },
    },
    {
      id: 'tempo',
      header: 'Tempo',
      align: 'right',
      cell: (o) => {
        const r = rotas[o.id];
        return r ? fmtMin(r.min) : '—';
      },
    },
  ], [rotas]);

  async function calcularRotas() {
    setCalculando(true);
    const resultado: Record<string, RotaOSRM | null> = {};
    for (const obra of obras) {
      resultado[obra.id] = await fetchRotaOSRM(lat1, lng1, obra.lat, obra.lng);
    }
    setRotas(resultado);
    setCalculando(false);
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="p-0 gap-0 w-[92vw] sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>{`Distâncias — ${recurso.nome}`}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
      <p
        style={{
          margin: '0 0 var(--sp-md)',
          fontSize: 13,
          color: 'var(--color-text-muted)',
        }}
      >
        A partir de: {recurso.endereco || '—'}
      </p>
      {obras.length === 0 ? (
        <p className="text-muted">Nenhuma obra ativa com localização.</p>
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
                : 'Calcular rotas reais (OSRM)'}
            </Button>
          </div>
          <DataTable
            rows={obras}
            columns={columns}
            rowKey={(o) => o.id}
            emptyMessage="Nenhuma obra ativa com localização."
          />
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
