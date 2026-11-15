import { defineConfig } from 'vite';

// base relativa: serve per aprire dist/index.html da file:// (Electron)
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1500 },
});
