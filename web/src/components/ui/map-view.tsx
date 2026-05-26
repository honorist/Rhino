import { Suspense, lazy } from 'react';
import Spinner from './spinner';

// Re-exporta o tipo público para que call-sites não percebam o split.
export type { MapMarker } from './map-view-inner';

// Leaflet (~150 KB gzip) + leaflet.css só entram no bundle quando o usuário
// abre uma tela que monta o mapa (Obras, Mapa Geral). O lazy() faz a divisão
// pelo Vite/Rollup; o re-export public-facing fica em MapView.tsx.
const MapViewInner = lazy(() => import('./MapViewInner'));

interface MapViewProps {
  markers: import('./MapViewInner').MapMarker[];
  height?: number;
  center?: [number, number];
  zoom?: number;
}

/**
 * Wrapper que carrega o Leaflet sob demanda. API idêntica ao MapViewInner.
 */
export default function MapView(props: MapViewProps) {
  const { height = 600 } = props;
  return (
    <Suspense
      fallback={
        <div
          style={{
            height,
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#f6f7f9',
          }}
        >
          <Spinner />
        </div>
      }
    >
      <MapViewInner {...props} />
    </Suspense>
  );
}
