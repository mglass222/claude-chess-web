import { defineConfig } from 'vite';

export default defineConfig({
  base: '/claude-chess-web/',
  build: {
    outDir: 'dist',
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
