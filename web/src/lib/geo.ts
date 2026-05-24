/**
 * Helpers de geolocalização — Haversine (linha reta) e rota real via OSRM
 * com cache em sessionStorage. Porte de js/lib/geo.js.
 */

/** Distância em km entre dois pontos (linha reta, fórmula de Haversine). */
export function haversine(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371; // raio da Terra em km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Resultado de uma rota OSRM. */
export interface RotaOSRM {
  km: number;
  min: number;
  coords: [number, number][];
}

/** Busca a rota real (por estradas) via OSRM. Devolve `null` em erro/timeout. */
export async function fetchRotaOSRM(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): Promise<RotaOSRM | null> {
  const key = `osrm:${lat1.toFixed(4)},${lng1.toFixed(4)};${lat2.toFixed(
    4,
  )},${lng2.toFixed(4)}`;
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) return JSON.parse(cached) as RotaOSRM;
  } catch {
    /* sessionStorage indisponível — segue sem cache */
  }

  const url = `https://router.project-osrm.org/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=full&geometries=geojson`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      routes?: {
        distance: number;
        duration: number;
        geometry: { coordinates: [number, number][] };
      }[];
    };
    const route = data.routes?.[0];
    if (!route) return null;
    const result: RotaOSRM = {
      km: route.distance / 1000,
      min: route.duration / 60,
      coords: route.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
    };
    try {
      sessionStorage.setItem(key, JSON.stringify(result));
    } catch {
      /* quota cheia — segue sem cachear */
    }
    return result;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Formata uma duração em minutos como "45 min" ou "2h 10min". */
export function fmtMin(min: number): string {
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h}h ${m}min` : `${h}h`;
}
