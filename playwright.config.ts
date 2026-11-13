import { defineConfig, devices } from '@playwright/test';

// E2E runs against production builds served with the Cloudflare-style headers (CSP included):
//   dist      – the real production build (explore hit-tests, PWA/offline, network audit)
//   dist-e2e  – identical build in mode "e2e", which adds a read-only map projection hook
//               (window.__topogokE2E) so tests can click a given region; no answer data is added.
// Software WebGL (SwiftShader) is used so the suite runs headless without a GPU.
const gl = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    trace: 'retain-on-failure',
    launchOptions: { args: gl },
    serviceWorkers: 'allow',
  },
  projects: [
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'], browserName: 'chromium', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 } },
  ],
  webServer: [
    { command: 'node scripts/dev/serve.mjs dist 4173', port: 4173, reuseExistingServer: true },
    { command: 'node scripts/dev/serve.mjs dist-e2e 4174', port: 4174, reuseExistingServer: true },
    // Production build + the real API code on an in-memory SQLite database (accounts E2E).
    { command: 'node scripts/dev/serve.mjs dist 4176 --api', port: 4176, reuseExistingServer: false },
    // E2E build + the real API (results E2E: a student plays rounds on the map, the teacher reads them).
    { command: 'node scripts/dev/serve.mjs dist-e2e 4177 --api', port: 4177, reuseExistingServer: false },
    // F4 (teacher question sets) on its own database.
    { command: 'node scripts/dev/serve.mjs dist-e2e 4178 --api', port: 4178, reuseExistingServer: false },
    // F5 (leaderboard) on its own database.
    { command: 'node scripts/dev/serve.mjs dist-e2e 4179 --api', port: 4179, reuseExistingServer: false },
    // F6 (page-leave signals and review) on its own database.
    { command: 'node scripts/dev/serve.mjs dist-e2e 4181 --api', port: 4181, reuseExistingServer: false },
  ],
});
