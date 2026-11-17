import { readFileSync } from 'node:fs';
import { expect, test as base, type Page } from '@playwright/test';
import { regionLabelPoint } from '../../src/map/labelPoint.ts';
import type { RegionFeature } from '../../src/data/validation.ts';

export const PROD = 'http://127.0.0.1:4173/';
export const E2E = 'http://127.0.0.1:4174/';

const read = (p: string) => (JSON.parse(readFileSync(p, 'utf8')) as { features: RegionFeature[] }).features;
const regions = read('public/data/ukraine-administration/2026.11.05.1/regions.geojson');
export const TECTONICS = read('public/data/ukraine-tectonics/2026.11.09.1/regions.geojson');
export const WORLD = read('public/data/world-continents/2026.11.11.1/regions.geojson');
export const REGIONS = regions;
const ALL = [...regions, ...TECTONICS, ...WORLD];
export const NAME_TO_ID = new Map<string, string>();
for (const r of ALL) { NAME_TO_ID.set(r.properties.names.hu, r.id); NAME_TO_ID.set(r.properties.names.uk, r.id); }
export const POINT = new Map(ALL.map((r) => [r.id, regionLabelPoint(r)]));
export const NAME = new Map(ALL.map((r) => [r.id, r.properties.names]));

export type TopicKey = 'admin' | 'tectonics' | 'world';
const TOPIC_ATTR: Record<TopicKey, string> = { admin: 'ukraine-administration', tectonics: 'ukraine-tectonics', world: 'world-continents' };

/** The topic's card on the home page, its grade block opened first (blocks start folded). */
export async function topicCard(page: Page, id: string) {
  const card = page.locator(`[data-topic="${id}"]`);
  if (!(await card.isVisible())) await page.locator(`details:has([data-topic="${id}"]) > summary`).click();
  return card;
}

/** Home → topic page. */
export async function openTopic(page: Page, base: string, topic: TopicKey = 'admin') {
  await page.goto(base);
  await (await topicCard(page, TOPIC_ATTR[topic])).click();
}

/** Every test fails if the page requests anything outside the local origin or logs an error. */
export const test = base.extend<{ audit: { external: string[]; errors: string[] } }>({
  audit: [async ({ page }, use) => {
    const audit = { external: [] as string[], errors: [] as string[] };
    page.on('request', (r) => {
      const u = r.url();
      if (!u.startsWith('http://127.0.0.1:') && !u.startsWith('data:') && !u.startsWith('blob:')) audit.external.push(u);
    });
    page.on('pageerror', (e) => audit.errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') audit.errors.push(m.text()); });
    await use(audit);
    expect(audit.external, 'external requests').toEqual([]);
    expect(audit.errors.filter((e) => !/Failed to load resource/.test(e)), 'page errors').toEqual([]);
  }, { auto: true }],
});
export { expect };

export async function mapReady(page: Page, name = 'main') {
  await expect(page.locator(`[data-map="${name}"]`)).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
}

/** Waits until the map is not moving and its projection is stable for 200 ms (wheel zoom starts with a delay). */
export async function waitStill(page: Page, map: string) {
  let last = '';
  for (let i = 0; i < 40; i++) {
    const now = await page.evaluate((m) => {
      const h = window.__topogokE2E!.maps[m]!;
      const q = h.project([31, 48]);
      return h.isMoving() ? 'moving' : `${q.x.toFixed(2)},${q.y.toFixed(2)}`;
    }, map);
    if (now !== 'moving' && now === last) return;
    last = now;
    await page.waitForTimeout(200);
  }
}

/** Clicks the interior label point of a region on the named map (e2e build only). */
export async function clickRegion(page: Page, id: string, map = 'main') {
  await waitStill(page, map);
  const p = POINT.get(id)!;
  const xy = await page.evaluate(([m, lng, lat]) => {
    const h = window.__topogokE2E!.maps[m as string]!;
    h.container.scrollIntoView({ block: 'center' });
    const r = h.container.getBoundingClientRect();
    const q = h.project([lng as number, lat as number]);
    return { x: r.left + q.x, y: r.top + q.y, w: r.width, h: r.height, qx: q.x, qy: q.y };
  }, [map, p[0], p[1]] as const);
  expect(xy.qx >= 0 && xy.qy >= 0 && xy.qx <= xy.w && xy.qy <= xy.h, `${id} visible on ${map}`).toBe(true);
  await page.mouse.click(xy.x, xy.y);
}

export async function currentTargetId(page: Page): Promise<string> {
  const text = (await page.locator('#question').innerText()).trim();
  const name = text.replace(/^(Keresd meg|Знайди):\s*/, '');
  const id = NAME_TO_ID.get(name);
  expect(id, `unknown question "${text}"`).toBeTruthy();
  return id!;
}

export function otherId(id: string, avoid: string[] = []): string {
  const pool = id.startsWith('TU-') ? TECTONICS : /^[CO]-/.test(id) ? WORLD : regions;
  return pool.map((r) => r.id).find((x) => x !== id && !avoid.includes(x) && x !== 'UA-30' && x !== 'UA-40')!;
}

/** Answers on the main map. The two small cities are zoomed in first (mouse wheel at the city), as a user would. */
export async function selectRegion(page: Page, id: string) {
  if (id === 'UA-30' || id === 'UA-40') {
    const p = POINT.get(id)!;
    const xy = await page.evaluate(([lng, lat]) => {
      const h = window.__topogokE2E!.maps['main']!;
      h.container.scrollIntoView({ block: 'center' });
      const r = h.container.getBoundingClientRect();
      const q = h.project([lng as number, lat as number]);
      return { x: r.left + q.x, y: r.top + q.y };
    }, [p[0], p[1]] as const);
    await page.mouse.move(xy.x, xy.y);
    for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, -400); await page.waitForTimeout(150); }
  }
  await clickRegion(page, id);
}

/** Practice starts at once with every feature (F4.5); only the assessment has a setup screen (count, no time limit). */
export async function start(page: Page, base: string, mode: 'practice' | 'assessment', count: '5' | '12' | 'all' = 'all', topic: TopicKey = 'admin') {
  await openTopic(page, base, topic);
  await page.locator('button', { hasText: mode === 'practice' ? /^Gyakorlás|^Практика/ : /^Számonkérés|^Перевірка знань/ }).first().click();
  if (mode === 'assessment') {
    await page.locator('label', { hasText: count === 'all' ? /Mindegyik|Усі/ : new RegExp(`^${count}$`) }).click();
    await page.getByRole('button', { name: /Indítás|Почати/ }).click();
  }
  await mapReady(page);
  await expect(page.locator('#question')).toContainText(/Keresd meg|Знайди/);
}

export const confirmBtn = (page: Page) => page.getByRole('button', { name: /Válasz véglegesítése|Підтвердити відповідь/ });
export const nextBtn = (page: Page) => page.getByRole('button', { name: /^(Következő|Eredmény|Далі|Результат)$/ });

/** "Next" ignores clicks within 400 ms of the feedback (double-click guard), as a user would pause. */
export async function clickNext(page: Page) {
  await page.waitForTimeout(450);
  await nextBtn(page).click();
}
