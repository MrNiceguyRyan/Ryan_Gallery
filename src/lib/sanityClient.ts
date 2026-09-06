import { createClient } from '@sanity/client';

// Static pages only need the read client. Studio tooling stays in /ryan.
// Keep these settings identical to the former Astro integration.
export const sanityClient = createClient({
  projectId: 'z610fooo',
  dataset: 'production',
  useCdn: true,
  apiVersion: '2025-04-01',
});
