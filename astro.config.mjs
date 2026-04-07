import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';
import sanity from '@sanity/astro';

export default defineConfig({
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
  },
  integrations: [
    react(),
    sanity({
      projectId: 'z610fooo',
      dataset: 'production',
      useCdn: true,
      apiVersion: '2024-03-16',
    }),
  ],
});
