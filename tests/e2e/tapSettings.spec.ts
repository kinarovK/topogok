// 0005: the superadmin changes the tap buffer and it applies to every visitor; the teacher's checklist of a
// mixed topic is grouped by source layer. Synthetic test topic, real API on an in-memory database.
import type { Page } from '@playwright/test';
import { login, seedAccounts } from './apiSeed.ts';
import { clickNext, confirmBtn, expect, mapReady, test, waitStill } from './helpers.ts';

const BASE = 'http://127.0.0.1:4182/';

async function tapNear(page: Page, lngLat: [number, number], dx: number) {
  await waitStill(page, 'main');
  const xy = await page.evaluate(([lng, lat]) => {
    const h = window.__topogokE2E!.maps['main']!;
    const r = h.container.getBoundingClientRect();
    const q = h.project([lng as number, lat as number]);
    return { x: r.left + q.x, y: r.top + q.y };
  }, lngLat);
  await page.mouse.click(xy.x + dx, xy.y);
}

test('superadmin widens the tap buffer; a guest then hits a river from farther away', async ({ page, browser }) => {
  await seedAccounts(BASE);
  await login(page, BASE, 'owner', 'owner-password-1');
  await page.getByRole('button', { name: /Adminisztráció|Tanári felület/ }).click();
  await page.getByRole('button', { name: 'Beállítások' }).click();
  const panel = page.getByTestId('settings-panel');
  await panel.getByLabel(/Érintőképernyő/).fill('48');
  await panel.getByLabel(/Egér/).fill('30');
  await panel.getByRole('button', { name: 'Mentés' }).click();
  await expect(panel.getByRole('status')).toBeVisible();

  const ctx = await browser.newContext();
  const guest = await ctx.newPage();
  await guest.goto(BASE);
  await guest.locator('[data-topic="test-mixed"]').click();
  await guest.getByRole('button', { name: /^Gyakorlás/ }).click();
  await mapReady(guest);
  const coarse = await guest.evaluate(() => matchMedia('(pointer: coarse)').matches);
  // Beyond the default buffer (22 / 10 px) but within the new one (48 / 30 px).
  const offset = coarse ? 40 : 25;
  const status = guest.getByTestId('status');
  for (let i = 0; i < 8; i++) {
    const q = (await guest.locator('#question').innerText()).replace(/^Keresd meg:\s*/, '').trim();
    if (q === 'Első folyó') {
      await tapNear(guest, [12, 6], -offset);
      await confirmBtn(guest).click();
      await expect(status).toContainText('Helyes!');
      await ctx.close();
      return;
    }
    await guest.getByRole('button', { name: 'Mutasd meg' }).click();
    await clickNext(guest);
  }
  throw new Error('the river question did not come up');
});

test('the teacher checklist of a mixed topic is grouped by layer, each with all/none', async ({ page }) => {
  await login(page, BASE, 'kovacs.tanar', 'teacher-password-1');
  await page.getByRole('button', { name: 'Tanári felület' }).click();
  await page.getByRole('button', { name: 'Témák' }).click();
  const panel = page.getByTestId('topics-panel');
  await panel.getByLabel('Téma').selectOption('test-mixed');
  await expect(panel.locator('h3')).toHaveText(['Folyók', 'Országok', 'Pontok']);
  await panel.locator('[data-group="folyok"]').getByRole('button', { name: 'Egyik sem' }).click();
  await expect(panel.getByTestId('topics-count')).toHaveText('5 / 8 kérdezhető');
  await panel.locator('[data-group="folyok"]').getByRole('button', { name: 'Mind' }).click();
  await expect(panel.getByTestId('topics-count')).toHaveText('8 / 8 kérdezhető');
});
