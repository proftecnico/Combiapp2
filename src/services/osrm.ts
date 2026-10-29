import { GeoLocation, OSRMRouteResult } from '../types';

/**
 * Calculates bearing angle (0° to 360°) between two coordinates
 */
export function calculateBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;

  const dLon = toRad(lon2 - lon1);
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);

  const y = Math.sin(dLon) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);

  let bearing = toDeg(Math.atan2(y, x));
  return (bearing + 360) % 360;
}

/**
 * Haversine distance in meters between two lat/lng points
 */
export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaPhi = toRad(lat2 - lat1);
  const deltaLambda = toRad(lon2 - lon1);

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Formats distance in meters or kilometers nicely
 */
export function formatDistance(meters: number): string {
  if (meters == null || isNaN(meters)) return '-- m';
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  const km = meters / 1000;
  return `${km.toFixed(1)} km`;
}

/**
 * Formats duration in minutes or seconds nicely
 */
export function formatDuration(seconds: number): string {
  if (seconds == null || isNaN(seconds)) return '-- min';
  if (seconds < 60) {
    return `${Math.max(1, Math.round(seconds))} seg`;
  }
  const mins = Math.round(seconds / 60);
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours} h ${remainingMins} min`;
  }
  return `${mins} min`;
}

/**
 * Fetches real driving route from public OSRM service
 */
export async function getOSRMRoute(
  start: GeoLocation,
  end: GeoLocation
): Promise<OSRMRouteResult> {
  // Coords in OSRM are {lng},{lat}
  const url = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`OSRM HTTP error: ${response.status}`);
    }

    const data = await response.json();
    if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
      const primaryRoute = data.routes[0];
      // GeoJSON coordinates are [lng, lat], Leaflet needs [lat, lng]
      const latLngs: [number, number][] = primaryRoute.geometry.coordinates.map(
        (coord: [number, number]) => [coord[1], coord[0]]
      );

      return {
        coordinates: latLngs,
        distanceMeters: primaryRoute.distance,
        durationSeconds: primaryRoute.duration,
        summary: primaryRoute.legs?.[0]?.summary || 'Ruta óptima',
      };
    }
  } catch (err) {
    console.warn('OSRM public API unavailable or timed out, generating street-mesh fallback:', err);
  }

  // Graceful fallback route: generates intermediate interpolated waypoints
  const steps = 15;
  const fallbackCoords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const lat = start.lat + (end.lat - start.lat) * t;
    const lng = start.lng + (end.lng - start.lng) * t;
    fallbackCoords.push([lat, lng]);
  }

  const directDistance = haversineDistanceMeters(start.lat, start.lng, end.lat, end.lng);
  // Estimate urban driving distance (~1.3x Euclidean factor) and urban speed (30 km/h = 8.33 m/s)
  const estimatedMeters = directDistance * 1.35;
  const estimatedSeconds = estimatedMeters / 8.33;

  return {
    coordinates: fallbackCoords,
    distanceMeters: estimatedMeters,
    durationSeconds: estimatedSeconds,
    summary: 'Ruta estimada',
  };
}
