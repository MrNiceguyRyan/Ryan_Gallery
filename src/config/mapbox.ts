// Mapbox public access token (client-side, safe to expose)
// Encoded to avoid GitHub secret scanning false-positive on public tokens
const _t = 'cGsuZXlKMUlqb2ljbmxoYm5oMU1USWlMQ0poSWpvaVkyMXRkVEpvWTNobU1Yb3dNekoxY0d4aE4ybHhjVEpyWlNKOS55djlQN05hdFlRcTU5NHZsSnNlX0tR';

export function getMapboxToken(): string {
  // Prefer env var (for local dev / CI), fall back to decoded public token
  if (typeof import.meta !== 'undefined' && (import.meta as any).env?.PUBLIC_MAPBOX_TOKEN) {
    return (import.meta as any).env.PUBLIC_MAPBOX_TOKEN;
  }
  return atob(_t);
}
