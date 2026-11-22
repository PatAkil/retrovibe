import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { resolve, basename } from 'node:path';

const DEFAULT_PORT = 5173;
const here = resolve(fileURLToPath(new URL('.', import.meta.url)));
const gameName = basename(here);
const requestedPort = Number(process.env.VITE_PORT ?? DEFAULT_PORT);
const port = Number.isInteger(requestedPort) && requestedPort > 0 ? requestedPort : DEFAULT_PORT;
const publicUrl = port === DEFAULT_PORT ? process.env.JBCENTRAL_EXPOSED_PORT_URL_5173 : undefined;
const publicHost = publicUrl ? new URL(publicUrl).hostname : undefined;

export default defineConfig({
  base: './',
  server: {
    port,
    strictPort: true,
    host: publicHost ? '0.0.0.0' : undefined,
    allowedHosts: publicHost ? [publicHost] : [],
    hmr: publicHost ? { host: publicHost, protocol: 'wss', clientPort: 443 } : undefined,
  },
  cacheDir: resolve(here, '../../node_modules/.vite', gameName),
});
