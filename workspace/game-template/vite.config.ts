import { realpathSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const DEFAULT_PORT = 5173;
const here = resolve(fileURLToPath(new URL('.', import.meta.url)));
const gameName = basename(here);
const requestedPort = Number(process.env.VITE_PORT ?? DEFAULT_PORT);
const port = Number.isInteger(requestedPort) && requestedPort > 0 ? requestedPort : DEFAULT_PORT;
const rawPublicUrl = port === DEFAULT_PORT ? process.env.JBCENTRAL_EXPOSED_PORT_URL_5173 : undefined;

function resolveRoot(dir: string): string {
  try {
    return realpathSync(dir);
  } catch {
    return resolve(dir);
  }
}

function parsePublicUrl(raw: string | undefined): URL | undefined {
  if (raw === undefined || raw === '') {
    return undefined;
  }
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function buildHmr(parsed: URL | undefined) {
  if (!parsed || process.env.RETROVIBE_LOCAL_HMR === '1') {
    return undefined;
  }
  const isHttps = parsed.protocol === 'https:';
  const clientPort = parsed.port ? Number(parsed.port) : (isHttps ? 443 : 80);
  return { host: parsed.hostname, protocol: isHttps ? 'wss' : 'ws', clientPort };
}

function rootIdentity(): Plugin {
  return {
    name: 'retrovibe-root',
    configureServer(server) {
      const payload = JSON.stringify({ root: resolveRoot(here) });
      server.middlewares.use('/__retrovibe_root', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(payload);
      });
    },
  };
}

const publicUrl = parsePublicUrl(rawPublicUrl);
const publicHost = publicUrl?.hostname;

export default defineConfig({
  base: './',
  plugins: [rootIdentity()],
  server: {
    port,
    strictPort: true,
    host: publicHost ? '0.0.0.0' : undefined,
    allowedHosts: publicHost ? [publicHost] : [],
    hmr: buildHmr(publicUrl),
  },
  cacheDir: resolve(here, '../../node_modules/.vite', gameName),
});
