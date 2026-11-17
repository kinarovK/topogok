// 0005: a mixed topic (synthetic, E2E build only) with areas, rivers and points. The tap buffer lets a tap
// near a river or point select it; farther away the area underneath is selected. Guest mode, no server.
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { clickNext, confirmBtn, E2E, expect, mapReady, test, waitStill, topicCard } from './helpers.ts';

type F = { id: string; properties: { names: { hu: string }; geomType: string }; geometry: { type: string; coordinates: unknown } };
const regions = (JSON.parse(readFileSync('dist-e2e/data/test-mixed/2026.11.16.1/regions.geojson', 'utf8')) as { features: F[] }).features;
const byName = new Map(regions.map((r) => [r.properties.names.hu, r]));
// Taps away from neighbours: R1 to the west, R2 to the east, R3 to the south of its lower branch; areas far from rivers.
const TAP: Record<string, { at: [number, number]; dir: [number, number] }> = {
  'MX-R1': { at: [12, 6], dir: [-1, 0] }, 'MX-R2': { at: [12.6, 6], dir: [1, 0] }, 'MX-R3': { at: [20, 5.8], dir: [0, 1] },
  'MX-P1': { at: [19.5, 9], dir: [0.6, 0.8] }, 'MX-P2': { at: [14.5, 3], dir: [0.6, 0.8] }, 'MX-P3': { at: [20, 2], dir: [-0.6, 0.8] },
  'MX-A': { at: [10.8, 8.5], dir: [0, 0] }, 'MX-B': { at: [17.5, 1.5], dir: [0, 0] },
};

async function tap(page: Page, lngLat: [number, number], offsetPx: number, dir: [number, number]) {
  await waitStill(page, 'main');
  const xy = await page.evaluate(([lng, lat]) => {
    const h = window.__topogokE2E!.maps['main']!;
    const r = h.container.getBoundingClientRect();
    const q = h.project([lng as number, lat as number]);
    return { x: r.left + q.x, y: r.top + q.y };
  }, lngLat);
  await page.mouse.click(xy.x + dir[0] * offsetPx, xy.y + dir[1] * offsetPx);
}

test('tap buffer: near a river or point selects it, farther away the area underneath; full mixed round', async ({ page }) => {
  await page.goto(E2E);
  await (await topicCard(page, 'test-mixed')).click();
  await expect(page.locator('[data-topic="test-mixed"]')).toHaveCount(0);
  await page.getByRole('button', { name: /^Gyakorlás/ }).click();
  await mapReady(page);
  const buffer = await page.evaluate(() => (matchMedia('(pointer: coarse)').matches ? 22 : 10));
  const inside = Math.round(buffer * 0.7);
  const status = page.getByTestId('status');
  let checkedOutside = false;
  for (let i = 0; i < 8; i++) {
    const name = (await page.locator('#question').innerText()).replace(/^Keresd meg:\s*/, '').trim();
    const f = byName.get(name)!;
    expect(f, name).toBeTruthy();
    const t = TAP[f.id]!;
    if (!checkedOutside && f.properties.geomType === 'line') {
      // 40 px from the river: outside the buffer, the area under the tap is chosen (a wrong answer here).
      await tap(page, t.at, 40, t.dir);
      await confirmBtn(page).click();
      await expect(status).not.toContainText('Helyes!');
      checkedOutside = true;
    }
    await tap(page, t.at, f.properties.geomType === 'area' ? 0 : inside, t.dir);
    await confirmBtn(page).click();
    await expect(status).toContainText('Helyes!');
    await clickNext(page);
  }
  expect(checkedOutside).toBe(true);
  // One question had a wrong first try, so it comes back in the review.
  const name = (await page.locator('#question').innerText()).replace(/^Keresd meg:\s*/, '').trim();
  const f = byName.get(name)!;
  await tap(page, TAP[f.id]!.at, inside, TAP[f.id]!.dir);
  await confirmBtn(page).click();
  await clickNext(page);
  await expect(page.getByTestId('correct')).toHaveText('7 / 8');
});
