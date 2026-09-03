import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { resolve, basename } from 'node:path';

// This game folder's absolute path (vite.config.ts sits at its root).
const here = resolve(fileURLToPath(new URL('.', import.meta.url)));
const gameName = basename(here);

export default defineConfig({
  // base:'./' makes every emitted asset path relative, so `dist/` works when
  // served from any subpath later (e.g. /games/<name>/) — independently deployable.
  base: './',
  server: {
    // Pinned + strict so a launch fails loudly instead of silently drifting to 5174.
    port: 5173,
    strictPort: true,
  },
  // Point Vite's cache OUTSIDE the game folder (default would create
  // <game>/node_modules/.vite). Lives under the shared root node_modules,
  // unique per game, and is gitignored.
  cacheDir: resolve(here, '../../node_modules/.vite', gameName),
});
