import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

const git = (cmd: string) => { try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } };
/** Release identity: commit of the build (CI sets TOPOGOK_BUILD_ID), commit time instead of wall time for reproducibility. */
const appVersion = process.env['TOPOGOK_APP_VERSION'] ?? pkg.version;
const buildId = process.env['TOPOGOK_BUILD_ID'] ?? (git('git rev-parse --short=7 HEAD') || 'local');
const commitTime = git('git log -1 --format=%cI') || null;
const dataVersions = Object.fromEntries(
  [...readFileSync(new URL('./src/data/topicRegistry.ts', import.meta.url), 'utf8').matchAll(/id: '([\w-]+)', dataVersion: '([\d.]+)'/g)].map((m) => [m[1], m[2]]),
);

const versionFile = (): Plugin => ({
  name: 'topogok-version-file',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ appVersion, buildId, commitTime, dataVersions }, null, 2) + '\n' });
  },
});

export default defineConfig(() => ({
  define: { __APP_VERSION__: JSON.stringify(appVersion), __BUILD_ID__: JSON.stringify(buildId) },
  // Only the generated data package and icons are public; shp/ and backups/ are never copied.
  publicDir: 'public',
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    assetsInlineLimit: 0,
  },
  plugins: [
    react(),
    versionFile(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'TopoGok',
        short_name: 'TopoGok',
        description: 'Térképes gyakorló és számonkérő alkalmazás – Ukrajna közigazgatása',
        lang: 'hu',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#f5f7fa',
        theme_color: '#1855b6',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{html,js,mjs,css,svg,png,json,geojson,webmanifest}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
        clientsClaim: false,
        skipWaiting: false,
      },
      devOptions: { enabled: false },
    }),
  ],
}));
