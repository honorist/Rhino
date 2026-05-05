// Helpers de geolocalização compartilhados (Haversine + OSRM com cache).
// Originalmente em Recursos.js, extraídos para reuso em Frota e outras views.
window.GeoUtils = (function () {
  function haversine(lat1, lng1, lat2, lng2) {
    const R    = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a    = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  // Busca rota real via OSRM (estradas). Retorna { km, min, coords } ou null em erro.
  async function fetchRotaOSRM(lat1, lng1, lat2, lng2) {
    const key = `osrm:${lat1.toFixed(4)},${lng1.toFixed(4)};${lat2.toFixed(4)},${lng2.toFixed(4)}`;
    try {
      const cached = sessionStorage.getItem(key);
      if (cached) return JSON.parse(cached);
    } catch {}

    const url = `https://router.project-osrm.org/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=full&geometries=geojson`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.routes || !data.routes[0]) return null;
      const r = data.routes[0];
      const result = {
        km: r.distance / 1000,
        min: r.duration / 60,
        coords: r.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
      };
      try { sessionStorage.setItem(key, JSON.stringify(result)); } catch {}
      return result;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  function fmtMin(min) {
    if (min < 60) return `${Math.round(min)} min`;
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return m ? `${h}h ${m}min` : `${h}h`;
  }

  return { haversine, fetchRotaOSRM, fmtMin };
})();
