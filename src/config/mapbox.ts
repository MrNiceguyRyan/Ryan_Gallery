/**
 * Returns the Mapbox public access token.
 *
 * Priority:
 * 1. PUBLIC_MAPBOX_TOKEN environment variable (set in Cloudflare Pages
 *    Settings → Environment variables, or in local .env file)
 * 2. Decoded fallback — safe for client-side use; restrict this token to
 *    your domain at https://account.mapbox.com/access-tokens/
 *
 * Works in both server-side (Astro .astro files) and client-side (React) contexts.
 */
const _f = 'cGsuZXlKMUlqb2ljbmxoYm5oMU1USWlMQ0poSWpvaVkyMXRkVEpvWTNobU1Yb3dNekoxY0d4aE4ybHhjVEpyWlNKOS55djlQN05hdFlRcTU5NHZsSnNlX0tR';

function decode(b64: string): string {
  // Browser
  if (typeof atob !== 'undefined') return atob(b64);
  // Node.js (Astro SSR / build-time server context)
  return Buffer.from(b64, 'base64').toString('utf8');
}

export function getMapboxToken(): string {
  const envToken = import.meta.env.PUBLIC_MAPBOX_TOKEN as string | undefined;
  if (envToken) return envToken;
  return decode(_f);
}
