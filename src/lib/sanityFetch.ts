interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
}

/**
 * Sanity is the only content dependency shared by every route. A brief DNS or
 * CDN interruption should not turn an otherwise healthy local build into a
 * blank page, so all route-level reads use the same small retry window.
 * Persistent configuration and query errors still surface after the final
 * attempt instead of being hidden behind empty content.
 */
export async function fetchSanityWithRetry<T>(
  request: () => Promise<T>,
  { attempts = 3, baseDelayMs = 250 }: RetryOptions = {},
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await request();
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, baseDelayMs * (attempt + 1)));
      }
    }
  }

  throw lastError;
}
