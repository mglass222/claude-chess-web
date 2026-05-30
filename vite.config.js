import { defineConfig } from 'vite';

export default defineConfig({
  base: '/claude-chess-web/',
  build: {
    outDir: 'dist',
    // Wipe dist between builds so stale or renamed public assets (e.g. macOS
    // "wK 2.svg" duplicates) can't survive into a gh-pages deploy.
    emptyOutDir: true,
  },
  // NOTE: the bundled Stockfish is the single-threaded (ASYNCIFY) WASM build; it
  // does not use SharedArrayBuffer/threads, so the app needs no COOP/COEP
  // cross-origin-isolation headers (which GitHub Pages can't send anyway).
});
