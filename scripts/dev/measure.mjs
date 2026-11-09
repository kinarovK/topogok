/* global document, requestAnimationFrame -- used inside page.evaluate / waitForFunction callbacks */
// Performance measurement (docs/TEST_PLAN.md "Teljesítmény"): production build, cold cache,
// 390×844, 4× CPU slowdown, 1.6 Mbit/s down, 150 ms RTT, median of N runs.
// Usage: node scripts/dev/serve.mjs dist 4173 & node scripts/dev/measure.mjs [runs]
import { chromium } from '@playwright/test';

const RUNS = Number(process.argv[2] ?? 5);
const URL_ = 'http://127.0.0.1:4173/';
const gl = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

const results = [];
for (let i = 0; i < RUNS; i++) {
  const browser = await chromium.launch({ args: gl });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  let bytes = 0;
  cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; });

  const t0 = Date.now();
  await page.goto(URL_);
  await page.locator('[data-topic="ukraine-administration"]').waitFor();
  const homeMs = Date.now() - t0;
  const homeBytes = bytes;

  await page.locator('[data-topic="ukraine-administration"]').click();
  await page.getByRole('button', { name: /^Gyakorlás/ }).click();
  await page.getByRole('button', { name: 'Indítás' }).waitFor();
  const t1 = Date.now();
  await page.getByRole('button', { name: 'Indítás' }).click();
  await page.locator('[data-map="main"][data-ready="true"]').waitFor({ timeout: 120_000 });
  const mapMs = Date.now() - t1;

  await page.getByText('Az alkalmazás offline is használható.').waitFor({ timeout: 180_000 });
  const offlineMs = Date.now() - t0;
  const totalBytes = bytes;

  // Click → selection latency (in-page), 30 interactions on the main map
  const box = await page.locator('[data-map="main"]').boundingBox();
  const lat = [];
  for (let k = 0; k < 30; k++) {
    const x = box.x + box.width * (0.25 + 0.5 * ((k * 7) % 10) / 10);
    const y = box.y + box.height * (0.35 + 0.3 * ((k * 3) % 10) / 10);
    const before = await page.getByTestId('status').innerText();
    const s = Date.now();
    await page.mouse.click(x, y);
    await page.waitForFunction((b) => document.querySelector('[data-testid="status"]')?.textContent !== b || true, before);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    lat.push(Date.now() - s);
  }
  lat.sort((a, b) => a - b);
  results.push({ homeMs, mapMs, offlineMs, homeKiB: homeBytes / 1024, totalKiB: totalBytes / 1024, clickP95: lat[Math.floor(lat.length * 0.95) - 1] });
  await browser.close();
}
const m = (k) => median(results.map((r) => r[k]));
console.log(JSON.stringify({ runs: RUNS, results, median: {
  homeInteractiveMs: m('homeMs'), mapReadyAfterStartMs: m('mapMs'), offlineReadyMs: m('offlineMs'),
  homeTransferKiB: Math.round(m('homeKiB')), fullPackageTransferKiB: Math.round(m('totalKiB')), clickToSelectionP95Ms: m('clickP95'),
} }, null, 2));
