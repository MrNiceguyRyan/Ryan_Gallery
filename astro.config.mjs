import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';
import sanity from '@sanity/astro';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  // Required by @astrojs/sitemap to generate absolute URLs
  site: 'https://ryangallery.com',
  output: 'static',
  vite: {
    plugins: [tailwindcss()],
    server: {
      fs: {
        // Allow serving files from the parent repo when running dev from a git worktree
        // that links to the main checkout's node_modules.
        allow: ['..', '../..', '../../..', '../../../..'],
      },
    },
    // Pre-bundle styled-components (pulled in by @sanity/astro) to avoid
    // the "Failed to resolve dependency" build warning in Vite 7
    optimizeDeps: {
      include: ['styled-components'],
    },
  },
  integrations: [
    react(),
    sanity({
      projectId: 'z610fooo',
      dataset: 'production',
      useCdn: true,
      // Keep in sync with Sanity API releases: https://www.sanity.io/docs/api-versioning
      apiVersion: '2025-04-01',
    }),
    sitemap({
      // Exclude Sanity Studio route if ever served under the same domain
      filter: (page) => !page.includes('/studio'),
      // Customise per-page priority and changefreq
      customPages: [],
      serialize(item) {
        // Homepage: highest priority, daily
        if (item.url === 'https://ryangallery.com/') {
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
