import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';
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

export default defineConfig({
  // Required by @astrojs/sitemap to generate absolute URLs
  site: 'https://ryanxugallery.com',
  output: 'static',
  // Preserve the approved inline spacing when upgrading to Astro 7.
  compressHTML: true,
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
    react(),
    sitemap({
      // Exclude Sanity Studio route if ever served under the same domain
      filter: (page) => !page.includes('/studio'),
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
