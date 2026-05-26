import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  /** Cor do pino. */
  color: string;
  /** HTML do popup (já escapado pelo chamador). */
  popupHtml?: string;
}

interface MapViewProps {
  markers: MapMarker[];
  height?: number;
  center?: [number, number];
  zoom?: number;
}

/**
 * Wrapper imperativo de mapa Leaflet. O Leaflet não é declarativo — o mapa é
 * criado uma vez via ref e os marcadores são re-sincronizados quando mudam.
 */
export default function MapView({
  markers,
  height = 600,
  center = [-15.78, -47.93],
  zoom = 4,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  // Cria o mapa uma única vez.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current).setView(center, zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // Mapa criado uma vez; center/zoom iniciais não re-disparam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-sincroniza os marcadores quando a lista muda.
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    const bounds: [number, number][] = [];

    markers.forEach((marker) => {
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:${marker.color};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);transform:rotate(-45deg);"></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 22],
        popupAnchor: [0, -22],
      });
      const leafletMarker = L.marker([marker.lat, marker.lng], { icon });
      if (marker.popupHtml) leafletMarker.bindPopup(marker.popupHtml);
      leafletMarker.addTo(layer);
      bounds.push([marker.lat, marker.lng]);
    });

    if (bounds.length === 1) {
      map.setView(bounds[0], 13);
    } else if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [markers]);

  return <div ref={containerRef} style={{ height, width: '100%' }} />;
}
