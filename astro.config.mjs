import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import react from '@astrojs/react';
import sanity from '@sanity/astro';

export default defineConfig({
  integrations: [
    tailwind(),
    react(),
    sanity({
      projectId: 'z610fooo', // 你的真实云端门牌号
      dataset: 'production',
      useCdn: true,
      apiVersion: '2024-03-16',
    }),
  ],
});