import { useState } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import Spinner from '../../components/ui/spinner';
import Card from '../../components/ui/card';
import MapView, { type MapMarker } from '../../components/ui/map-view';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/native-select';
import { formatBRL } from '../../lib/format';
import { escapeHtml } from '../../lib/escapeHtml';
import type { Contract } from '../contracts/types';
import { useContracts } from '../contracts/queries';

const STATUS_COR: Record<string, string> = {
  ativo: '#38A169',
  prospeccao: '#3182CE',
  nao_aprovado: '#E53E3E',
  nao_iniciado: '#D69E2E',
  pausado: '#D69E2E',
  concluido: '#718096',
  cancelado: '#E53E3E',
};

const STATUS_LABEL: Record<string, string> = {
  ativo: 'Ativo',
  prospeccao: 'Prospecção',
  nao_aprovado: 'Não aprovado',
  nao_iniciado: 'Não iniciado',
  pausado: 'Pausado',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

interface Obra {
  id: string;
  name: string;
  client: string;
  status: string;
  value: number;
  lat: number;
  lng: number;
  endereco?: string;
}

/** Extrai uma Obra tipada de um Contract (que ainda é DomainRecord). */
function toObra(contract: Contract): Obra | null {
  const lat = Number(contract.lat);
  const lng = Number(contract.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  return {
    id: contract.id,
    name: String(contract.name ?? ''),
    client: String(contract.client ?? ''),
    status: String(contract.status ?? ''),
    value: Number(contract.value) || 0,
    lat,
    lng,
    endereco: contract.endereco ? String(contract.endereco) : undefined,
  };
}

function popupHtml(obra: Obra): string {
  const cor = STATUS_COR[obra.status] ?? '#718096';
  return `<div class="obra-popup">
    <h4>${escapeHtml(obra.name)}</h4>
    <div class="pop-sub">${escapeHtml(obra.client)}</div>
    <span style="background:${cor};color:#fff;font-size:11px;padding:2px 8px;border-radius:99px;font-weight:700;">${escapeHtml(STATUS_LABEL[obra.status] ?? obra.status)}</span>
    <div class="pop-val" style="margin-top:6px;">${escapeHtml(formatBRL(obra.value))}</div>
  </div>`;
}

/** Mapa de Obras — migração de js/views/Obras.js (heatmap deferido). */
export default function Obras() {
  const contractsQuery = useContracts();

  const [status, setStatus] = useState('');
  const [buscaCliente, setBuscaCliente] = useState('');

  const obras = (contractsQuery.data ?? [])
    .map(toObra)
    .filter((obra): obra is Obra => obra !== null);

  const termo = buscaCliente.toLowerCase().trim();
  const filtradas = obras.filter((obra) => {
    const matchStatus = !status || obra.status === status;
    const matchCliente = !termo || obra.client.toLowerCase().includes(termo);
    return matchStatus && matchCliente;
  });

  const markers: MapMarker[] = filtradas.map((obra) => ({
    id: obra.id,
    lat: obra.lat,
    lng: obra.lng,
    color: STATUS_COR[obra.status] ?? '#718096',
    popupHtml: popupHtml(obra),
  }));

  return (
    <>
      <PageHeader
        title="Mapa de Obras"
        subtitle="Localização geográfica dos contratos"
      />

      <Card
        style={{ padding: 'var(--sp-md)', marginBottom: 'var(--sp-lg)' }}
      >
        <div style={{ display: 'flex', gap: 'var(--sp-md)', flexWrap: 'wrap' }}>
          <Select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            style={{ minWidth: 180 }}
          >
            <option value="">Todos os status</option>
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Input
            placeholder="🔍 Buscar por cliente..."
            value={buscaCliente}
            onChange={(event) => setBuscaCliente(event.target.value)}
            style={{ flex: 1, minWidth: 200 }}
          />
        </div>
      </Card>

      {contractsQuery.isLoading ? (
        <Spinner label="Carregando obras..." />
      ) : contractsQuery.isError ? (
        <Card style={{ padding: 24 }}>
          <p className="text-danger">Erro ao carregar obras. Tente novamente.</p>
        </Card>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 320px',
            gap: 'var(--sp-lg)',
            alignItems: 'start',
          }}
        >
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <MapView markers={markers} height={620} />
          </Card>

          <Card style={{ maxHeight: 640, overflowY: 'auto' }}>
            <h3 className="text-[15px] font-semibold tracking-tight px-5 pt-5 pb-4">Obras</h3>
            <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              {filtradas.length} obra{filtradas.length !== 1 ? 's' : ''}
            </span>
            {filtradas.length === 0 ? (
              <p
                className="text-muted"
                style={{ padding: 'var(--sp-lg)', textAlign: 'center' }}
              >
                Nenhuma obra com localização para os filtros.
              </p>
            ) : (
              filtradas.map((obra) => (
                <div
                  key={obra.id}
                  style={{
                    display: 'flex',
                    gap: 'var(--sp-sm)',
                    padding: 'var(--sp-md)',
                    borderBottom: '1px solid var(--color-border)',
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: STATUS_COR[obra.status] ?? '#718096',
                      marginTop: 5,
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{obra.name}</div>
                    <div
                      style={{ fontSize: 13, color: 'var(--color-text-muted)' }}
                    >
                      {obra.client}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: 'var(--color-success)',
                      }}
                    >
                      {formatBRL(obra.value)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </Card>
        </div>
      )}
    </>
  );
}
