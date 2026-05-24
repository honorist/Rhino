import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import MapView, { type MapMarker } from '../../components/ui/MapView';
import { escapeHtml } from '../../lib/escapeHtml';
import { useContracts } from '../contracts/queries';
import { useRecursos } from '../resources';
import { normalizeCargo } from './proximaFolga';

const num = (v: unknown): number => Number(v) || 0;
const temCoords = (lat: unknown, lng: unknown): boolean =>
  Boolean(lat) && Boolean(lng);

interface MapaGeralModalProps {
  onClose: () => void;
}

/** Modal com o mapa de todos os funcionários e obras ativas. */
export default function MapaGeralModal({ onClose }: MapaGeralModalProps) {
  const recursosQuery = useRecursos();
  const contractsQuery = useContracts();

  const funcionarios = (recursosQuery.data ?? []).filter(
    (r) => r.status === 'funcionario' && temCoords(r.lat, r.lng),
  );
  const obras = (contractsQuery.data ?? []).filter(
    (c) => c.status === 'ativo' && temCoords(c.lat, c.lng),
  );

  const markers: MapMarker[] = [
    ...funcionarios.map(
      (r): MapMarker => ({
        id: `r-${r.id}`,
        lat: num(r.lat),
        lng: num(r.lng),
        color: '#2563EB',
        popupHtml: `<strong>${escapeHtml(r.nome)}</strong><br>${escapeHtml(
          normalizeCargo(r.profissao),
        )}`,
      }),
    ),
    ...obras.map(
      (o): MapMarker => ({
        id: `o-${o.id}`,
        lat: num(o.lat),
        lng: num(o.lng),
        color: '#059669',
        popupHtml: `<strong>${escapeHtml(String(o.name ?? ''))}</strong><br>${escapeHtml(
          String(o.client ?? ''),
        )}`,
      }),
    ),
  ];

  return (
    <Modal
      open
      title="Mapa Geral — Funcionários e Obras"
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      <p
        style={{
          margin: '0 0 var(--sp-md)',
          fontSize: 13,
          color: 'var(--color-text-muted)',
        }}
      >
        <span style={{ color: '#2563EB' }}>●</span> {funcionarios.length}{' '}
        funcionário(s) com localização ·{' '}
        <span style={{ color: '#059669' }}>●</span> {obras.length} obra(s) ativa(s)
      </p>
      {markers.length === 0 ? (
        <p className="text-muted">
          Nenhum funcionário ou obra com localização cadastrada.
        </p>
      ) : (
        <MapView markers={markers} height={460} />
      )}
    </Modal>
  );
}
