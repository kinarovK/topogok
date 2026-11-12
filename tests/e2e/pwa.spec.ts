import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, rmSync, symlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, mapReady, PROD, test } from './helpers.ts';

test('T19 after the first full load everything works offline: both languages, both themes, a round', async ({ page, context }) => {
  await page.goto(PROD);
  await expect(page.getByText('Az alkalmazás offline is használható.')).toBeVisible({ timeout: 30_000 });
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('[data-topic="ukraine-tectonics"]')).toBeVisible();
  await page.locator('[data-topic="ukraine-tectonics"]').click();
  await page.getByLabel('Nyelv', { exact: true }).selectOption('uk');
  await page.getByLabel('Вигляд', { exact: true }).selectOption('dark');
  await page.getByRole('button', { name: /^Практика/ }).click(); // F4.5: starts at once
  await mapReady(page);
  const map = page.locator('[data-map="main"]');
  const box = (await map.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.45);
  await page.getByRole('button', { name: 'Підтвердити відповідь' }).click();
  await expect(page.getByTestId('status')).toContainText(/Правильно!|Неправильно/);
  await context.setOffline(false);
});

test('T20 failed install: no false offline-ready when the package cannot be cached', async ({ page, context }) => {
  await context.route('**/regions.geojson', (r) => r.abort());
  await page.goto(PROD);
  await page.waitForTimeout(4000);
  await expect(page.getByText('Az alkalmazás offline is használható.')).toHaveCount(0);
});

test.describe('updates', () => {
  const root = resolve('.e2e-serve');
  let server: ChildProcess | null = null;
  const point = (dir: string) => { if (existsSync(root)) rmSync(root); symlinkSync(resolve(dir), root); };

  test.beforeAll(() => {
    const build = (outDir: string, version: string) => execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', outDir, '--logLevel', 'warn'], { env: { ...process.env, TOPOGOK_APP_VERSION: version }, stdio: 'inherit' });
    build('dist-b', '0.1.0-update-b');
    // Recovery release: same content as A, new build identity, so clients notice a change (OPERATIONS "Visszaállítás").
    build('dist-r', '0.1.0-recovery-a');
    point('dist');
    server = spawn(process.execPath, ['scripts/dev/serve.mjs', '.e2e-serve', '4175'], { stdio: 'ignore' });
  });
  test.afterAll(() => { server?.kill(); if (existsSync(root)) rmSync(root); rmSync('dist-b', { recursive: true, force: true }); rmSync('dist-r', { recursive: true, force: true }); });

  test('T21 A→B release: an active round is never reloaded; other tab waits; explicit update after the round loads B', async ({ context }) => {
    const base = 'http://127.0.0.1:4175/';
    await new Promise((r) => setTimeout(r, 500));
    const playing = await context.newPage();
    await playing.goto(base);
    await expect(playing.getByText('Az alkalmazás offline is használható.')).toBeVisible({ timeout: 30_000 });
    await playing.reload(); // now controlled by SW A
    await playing.locator('[data-topic="ukraine-administration"]').click();
    await playing.getByRole('button', { name: /^Gyakorlás/ }).click(); // F4.5: starts at once
    await mapReady(playing);
    const question = await playing.locator('#question').innerText();
    await playing.evaluate(() => { (window as unknown as { marker: number }).marker = 42; });

    const other = await context.newPage();
    await other.goto(base);
    await other.evaluate(() => { (window as unknown as { marker: number }).marker = 7; });

    point('dist-b');
    await playing.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())?.update(); });
    await expect(playing.getByTestId('update-banner')).toContainText('a kör befejezése után frissíthetsz', { timeout: 30_000 });
    await expect(playing.getByTestId('update-banner').getByRole('button', { name: 'Frissítés most' })).toHaveCount(0);

    await other.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())?.update(); });
    await expect(other.getByTestId('update-banner')).toContainText('Új verzió érhető el.', { timeout: 30_000 });
    await other.getByTestId('update-banner').getByRole('button', { name: 'Frissítés most' }).click();
    await expect(other.getByTestId('update-banner')).toContainText('Egy másik lapon kör van folyamatban');

    // The playing tab was not reloaded and its round is intact.
    expect(await playing.evaluate(() => (window as unknown as { marker?: number }).marker)).toBe(42);
    await expect(playing.locator('#question')).toHaveText(question);

    // Leave the round, then update explicitly.
    await playing.getByRole('button', { name: 'Kilépés' }).click();
    await playing.getByRole('dialog').getByRole('button', { name: 'Kilépés' }).click();
    await playing.getByTestId('update-banner').getByRole('button', { name: 'Frissítés most' }).click();
    await playing.waitForFunction(() => (window as unknown as { marker?: number }).marker === undefined, null, { timeout: 30_000 });
    await playing.getByRole('button', { name: 'Súgó' }).click();
    await expect(playing.getByTestId('version')).toContainText('0.1.0-update-b');
    // The other (idle) tab was not reloaded by someone else's update; it only shows the notice.
    expect(await other.evaluate(() => (window as unknown as { marker?: number }).marker)).toBe(7);
    await other.close();

    // F1-07 recovery: B → recovery build with A's content; clients update to it like to any release, and offline still works.
    point('dist-r');
    await playing.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())?.update(); });
    await expect(playing.getByTestId('update-banner')).toContainText('Új verzió érhető el.', { timeout: 30_000 });
    await playing.evaluate(() => { (window as unknown as { marker: number }).marker = 99; });
    await playing.getByTestId('update-banner').getByRole('button', { name: 'Frissítés most' }).click();
    await playing.waitForFunction(() => (window as unknown as { marker?: number }).marker === undefined, null, { timeout: 30_000 });
    await playing.getByRole('button', { name: 'Súgó' }).click();
    await expect(playing.getByTestId('version')).toContainText('0.1.0-recovery-a');
    await context.setOffline(true);
    await playing.reload();
    await playing.getByRole('button', { name: 'Súgó' }).click();
    await expect(playing.getByTestId('version')).toContainText('0.1.0-recovery-a');
    await context.setOffline(false);
  });
});
