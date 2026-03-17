import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';
import sanity from '@sanity/astro';

export default defineConfig({
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
  ],
});
