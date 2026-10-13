// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

// https://astro.build/config
export default defineConfig({
  integrations: [react()],

  vite: {
    resolve: { alias: { 'decode-named-character-reference': fileURLToPath(new URL('./src/utils/decodeNamedEntity.ts', import.meta.url)) } },
    worker: { format: 'es' },
    plugins: [tailwindcss()]
  }
});
