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
  },
  integrations: [
    react(),
    sanity({
      projectId: 'z610fooo',
      dataset: 'production',
      useCdn: true,
      apiVersion: '2024-03-16',
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
