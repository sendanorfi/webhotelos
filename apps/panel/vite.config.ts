import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@adapter': fileURLToPath(new URL(mode === 'demo' ? './src/demo.ts' : './src/http.ts', import.meta.url)),
    },
  },
}));
