/**
 * Returns the Mapbox public access token.
 *
 * Priority:
 * 1. PUBLIC_MAPBOX_TOKEN environment variable (recommended)
 *    → Cloudflare Pages: Settings → Environment variables → PUBLIC_MAPBOX_TOKEN
 *    → Local dev: add to .env file
 * 2. Decoded fallback — ensures the map works even without an env var configured.
 *    Mapbox public tokens (pk.*) are safe for client-side use; restrict to your
 *    domain at https://account.mapbox.com/access-tokens/
 */
const _f = 'cGsuZXlKMUlqb2ljbmxoYm5oMU1USWlMQ0poSWpvaVkyMXRkVEpvWTNobU1Yb3dNekoxY0d4aE4ybHhjVEpyWlNKOS55djlQN05hdFlRcTU5NHZsSnNlX0tR';

export function getMapboxToken(): string {
  const envToken = import.meta.env.PUBLIC_MAPBOX_TOKEN as string | undefined;
  if (envToken) return envToken;
  return atob(_f);
}
