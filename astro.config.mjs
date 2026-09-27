import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';
import sanity from '@sanity/astro';
import sitemap from '@astrojs/sitemap';

// Astro's build also starts a temporary Vite server. Keep its dependency
// cache separate so a build cannot replace the React modules in a live preview.
function stablePreview() {
  return {
    name: 'gallery:stable-preview',
    hooks: {
      'astro:config:setup': ({ command, config, updateConfig }) => {
        updateConfig({
          vite: {
            cacheDir: new URL(`./node_modules/.vite-${command}/`, config.root).pathname,
            ...(command === 'dev' ? {
              server: {
                port: config.server.port,
                strictPort: true,
                hmr: { clientPort: config.server.port },
              },
            } : {}),
          },
        });
      },
    },
  };
}

// ── NOTES in the nav: decided once per build ──
// The nav (Nav.tsx and the homepage's own copy) shows NOTES only when at least
// one note is published in Sanity — or, for a PREVIEW build only, when
// NOTES_SAMPLE=1 prints the sample note (src/lib/notesData.ts). The answer is
// defined as __NOTES_LIVE__ for the server and client bundles alike
// (src/lib/notesNav.ts), so server HTML and hydrated islands agree. If Sanity
// cannot be reached the nav simply goes without NOTES for that build.
const NOTES_SAMPLE = process.env.NOTES_SAMPLE === '1';

async function countPublishedNotes() {
  const query = 'count(*[_type == "note" && defined(slug.current) && !(_id in path("drafts.**"))])';
  const url = `https://z610fooo.apicdn.sanity.io/v2025-04-01/data/query/production?query=${encodeURIComponent(query)}`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const { result } = await response.json();
        return Number(result) || 0;
      }
    } catch {
      // Retried below; a persistent failure leaves NOTES out of this build.
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }
  return null;
}

let notesLive = false;

function notesNav() {
  return {
    name: 'gallery:notes-nav',
    hooks: {
      'astro:config:setup': async ({ updateConfig, logger }) => {
        const count = await countPublishedNotes();
        if (count === null) logger.warn('Could not count notes in Sanity; the nav will not show NOTES in this build.');
        notesLive = (count ?? 0) > 0 || NOTES_SAMPLE;
        if (NOTES_SAMPLE && !count) logger.info('NOTES_SAMPLE=1: the preview sample note is printed and linked.');
        updateConfig({ vite: { define: { __NOTES_LIVE__: JSON.stringify(notesLive) } } });
      },
    },
  };
}

export default defineConfig({
  // Required by @astrojs/sitemap to generate absolute URLs
  site: 'https://ryanxugallery.com',
  output: 'static',
  prefetch: {
    // Enable Astro's built-in link prefetching. Opt-in via `data-astro-prefetch`
    // on links (e.g. the collection mini-map → /travel) to warm the HTML cache
    // so the cinematic shutter lands on an already-parsed target page.
    prefetchAll: false,
    defaultStrategy: 'hover',
  },
  vite: {
    plugins: [tailwindcss()],
    // Pre-bundle the lazily hydrated map and homepage motion stacks so Vite
    // does not invalidate them while their Astro islands are loading.
    optimizeDeps: {
      include: ['framer-motion', 'lucide-react', 'lenis', 'mapbox-gl', 'react-map-gl/mapbox', 'supercluster'],
    },
  },
  integrations: [
    stablePreview(),
    notesNav(),
    react(),
    sanity({
      projectId: 'z610fooo',
      dataset: 'production',
      useCdn: true,
      // Keep in sync with Sanity API releases: https://www.sanity.io/docs/api-versioning
      apiVersion: '2025-04-01',
    }),
    sitemap({
      // Exclude Sanity Studio route if ever served under the same domain, the
      // preview-only sample note, and /notes itself while nothing is published.
      filter: (page) =>
        !page.includes('/studio') &&
        !(NOTES_SAMPLE && page.includes('/notes/sample/')) &&
        (notesLive || !/\/notes\/?$/.test(page)),
      // Customise per-page priority and changefreq
      customPages: [],
      serialize(item) {
        // Homepage: highest priority, daily
        if (item.url === 'https://ryanxugallery.com/') {
          return { ...item, priority: 1.0, changefreq: 'weekly' };
        }
        // Works collection pages: high priority, monthly
        if (item.url.includes('/works/')) {
          return { ...item, priority: 0.9, changefreq: 'monthly' };
        }
        // Travel / About / Contact: medium priority
        return { ...item, priority: 0.7, changefreq: 'monthly' };
      },
    }),
  ],
});
