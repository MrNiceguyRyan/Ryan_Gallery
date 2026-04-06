/**
 * Returns the Mapbox public access token.
 *
 * Set PUBLIC_MAPBOX_TOKEN in your .env file (local dev) or in your
 * hosting platform's environment variables (production).
 *
 * Example .env:
 *   PUBLIC_MAPBOX_TOKEN=pk.eyJ1IjoiXXXXXXX...
 */
export function getMapboxToken(): string {
  const token = import.meta.env.PUBLIC_MAPBOX_TOKEN as string | undefined;
  if (!token) {
    console.warn(
      '[mapbox] PUBLIC_MAPBOX_TOKEN is not set. ' +
      'Add it to your .env file. Map features will be disabled.',
    );
    return '';
  }
  return token;
}
