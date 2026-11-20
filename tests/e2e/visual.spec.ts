import { mkdirSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { clickNext, confirmBtn, currentTargetId, E2E, expect, mapReady, otherId, selectRegion, start, test, topicCard } from './helpers.ts';

const OUT = 'reports/screenshots';
mkdirSync(OUT, { recursive: true });

async function prefs(page: Page, locale: 'hu' | 'uk', theme: 'light' | 'dark') {
  await page.addInitScript(([l, t]) => localStorage.setItem('topogok.preferences.v1', JSON.stringify({ locale: l, theme: t })), [locale, theme] as const);
}

/** T17: no horizontal page scroll and the primary action is not covered by other controls. */
async function checkLayout(page: Page) {
  const r = await page.evaluate(() => {
    const doc = document.documentElement;
    const btn = [...document.querySelectorAll('button')].find((b) => /Válasz véglegesítése|Підтвердити відповідь|Következő|Далі|Eredmény|Результат/.test(b.textContent ?? ''));
    let covered = false;
    if (btn) {
      btn.scrollIntoView({ block: 'center' });
      const b = btn.getBoundingClientRect();
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      covered = !(hit && (hit === btn || btn.contains(hit)));
    }
    window.scrollTo(0, 0);
    return { overflow: doc.scrollWidth - window.innerWidth, covered };
  });
  expect(r.overflow, 'horizontal overflow (px)').toBeLessThanOrEqual(0);
  expect(r.covered, 'primary action covered').toBe(false);
}

async function dismissBanner(page: Page) {
  const b = page.locator('main [role="status"] button', { hasText: /Bezárás|Закрити/ });
  if (await b.count()) await b.first().click();
}

/** The map controls must not cover any part of the country at the reset view. */
async function controlsClear(page: Page) {
  const r = await page.evaluate(() => {
    const h = window.__topogokE2E!.maps['main']!;
    const c = h.container.getBoundingClientRect();
    const ctl = h.container.parentElement!.querySelector('button')!.parentElement!.getBoundingClientRect();
    const east = h.project([40.16, 48.5]).x + c.left;
    return { east, controlsLeft: ctl.left };
  });
  expect(r.controlsLeft, 'controls left edge vs country east edge').toBeGreaterThan(r.east);
}

const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/${name}.png` });

for (const locale of ['hu', 'uk'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`screens ${locale}-${theme} 390×844`, async ({ page }) => {
      await prefs(page, locale, theme);
      const tag = `${locale}-${theme}`;
      await page.goto(E2E);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await checkLayout(page);
      await shot(page, `${tag}-01-home`);

      // practice: wrong answer feedback, then the right answer
      await start(page, E2E, 'practice');
      await dismissBanner(page);
      const id = await currentTargetId(page);
      await selectRegion(page, otherId(id));
      await confirmBtn(page).click();
      await expect(page.getByTestId('status')).toContainText(/Helytelen|Неправильно/);
      await checkLayout(page);
      await shot(page, `${tag}-02-practice-wrong`);
      await selectRegion(page, id === 'UA-30' ? 'UA-30' : id);
      await confirmBtn(page).click();
      await expect(page.getByTestId('status')).toContainText(/Helyes!|Правильно!/);
      await shot(page, `${tag}-03-practice-correct`);
      await clickNext(page);
      // Small city: zoom in on Kyiv and select it (no answer is confirmed here).
      await selectRegion(page, 'UA-30');
      await shot(page, `${tag}-04-kyiv-zoomed`);

      // assessment with timer, a neutral selection, then results
      await start(page, E2E, 'assessment', '5');
      const a = await currentTargetId(page);
      await selectRegion(page, a);
      await checkLayout(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(page, `${tag}-05-assessment`);
      for (let i = 0; i < 5; i++) {
        const q = await currentTargetId(page);
        await selectRegion(page, i < 4 ? q : otherId(q));
        await confirmBtn(page).click();
      }
      await expect(page.getByTestId('grade')).toBeVisible();
      await checkLayout(page);
      await shot(page, `${tag}-06-assessment-result`);
    });
  }
}

const sizes = [
  { name: '320x568', viewport: { width: 320, height: 568 } },
  { name: '844x390-landscape', viewport: { width: 844, height: 390 } },
  { name: '768x1024-tablet', viewport: { width: 768, height: 1024 } },
  { name: '1366x768-desktop', viewport: { width: 1366, height: 768 } },
];
for (const sz of sizes) {
  test(`layout ${sz.name}`, async ({ page }) => {
    await page.setViewportSize(sz.viewport);
    await prefs(page, 'uk', 'light'); // longest strings
    await page.goto(E2E);
    await checkLayout(page);
    await shot(page, `${sz.name}-01-home`);
    await start(page, E2E, 'practice');
    await dismissBanner(page);
    await controlsClear(page);
    const id = await currentTargetId(page);
    await selectRegion(page, otherId(id));
    await confirmBtn(page).click();
    await checkLayout(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, `${sz.name}-02-game`);
  });
}

test('explore + help screenshots; no About page', async ({ page }) => {
  await prefs(page, 'hu', 'light');
  await page.goto(E2E);
  await (await topicCard(page, 'ukraine-administration')).click();
  await page.getByRole('button', { name: 'Térkép felfedezése' }).click();
  await mapReady(page, 'explore');
  await page.waitForTimeout(300);
  await shot(page, 'hu-light-07-explore');
  await page.getByRole('button', { name: 'Vissza', exact: true }).click();
  await page.getByRole('button', { name: 'Vissza', exact: true }).click();
  await shot(page, 'hu-light-00-topics');
  await expect(page.getByRole('button', { name: /Névjegy|Про застосунок/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Súgó' }).click();
  await expect(page.locator('main')).toContainText('26/27 → 12');
  await expect(page.getByTestId('version')).toContainText(/Verzió: \d+\.\d+\.\d+.* \(build: \w+\) · adatok: 2026\.11\.05\.1, 2026\.11\.09\.1/);
  await shot(page, 'hu-light-09-help');
});

test('tectonics screenshots hu-light and uk-dark', async ({ page }) => {
  for (const [locale, theme] of [['hu', 'light'], ['uk', 'dark']] as const) {
    await prefs(page, locale, theme);
    await start(page, E2E, 'practice', 'all', 'tectonics');
    await dismissBanner(page);
    const id = await currentTargetId(page);
    await selectRegion(page, otherId(id));
    await confirmBtn(page).click();
    await checkLayout(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, `tectonics-${locale}-${theme}-practice-wrong`);
    await page.goto(E2E);
    await (await topicCard(page, 'ukraine-tectonics')).click();
    await page.getByRole('button', { name: /Térkép felfedezése|Ознайомлення з картою/ }).click();
    await mapReady(page, 'explore');
    await page.waitForTimeout(300);
    await shot(page, `tectonics-${locale}-${theme}-explore`);
  }
});

test('continents screenshots: desktop hu-light practice + uk-dark explore, phone explore', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await prefs(page, 'hu', 'light');
  await start(page, E2E, 'practice', 'all', 'world');
  await dismissBanner(page);
  const id = await currentTargetId(page);
  await selectRegion(page, otherId(id));
  await confirmBtn(page).click();
  await checkLayout(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'continents-hu-light-practice-wrong');
  for (const [locale, theme, vp, tag] of [['uk', 'dark', { width: 1366, height: 768 }, 'desktop'], ['hu', 'light', { width: 390, height: 844 }, 'phone']] as const) {
    await page.setViewportSize(vp);
    await prefs(page, locale, theme);
    await page.goto(E2E);
    await (await topicCard(page, 'world-continents')).click();
    await page.getByRole('button', { name: /Térkép felfedezése|Ознайомлення з картою/ }).click();
    await mapReady(page, 'explore');
    await page.waitForTimeout(300);
    await checkLayout(page);
    // Visible labels never overlap each other. On desktop all fit except the Arctic Ocean, whose polar band
    // is too thin at this scale (it appears after zooming in); Antarctica and the Southern Ocean both show.
    const boxes = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-label-id]')]
      .filter((e) => e.style.visibility !== 'hidden').map((e) => { const r = e.getBoundingClientRect(); return { id: e.dataset['labelId']!, l: r.left, t: r.top, r: r.right, b: r.bottom }; }));
    for (const a of boxes) for (const b of boxes) if (a.id < b.id) expect(a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t, `${a.id} overlaps ${b.id}`).toBe(false);
    if (tag === 'desktop') expect(boxes.map((x) => x.id).sort()).toEqual(['C-AF', 'C-AN', 'C-AU', 'C-EA', 'C-NA', 'C-SA', 'O-AT', 'O-IN', 'O-PA', 'O-SO']);
    await shot(page, `continents-${locale}-${theme}-explore-${tag}`);
    if (tag === 'phone') {
      // Labels that do not fit at the small default scale appear after zooming in.
      await page.getByRole('button', { name: 'Nagyítás' }).click();
      await page.waitForTimeout(600);
      await shot(page, `continents-${locale}-${theme}-explore-${tag}-zoomed`);
    }
  }
});
