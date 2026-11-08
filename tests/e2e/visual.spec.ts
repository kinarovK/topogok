import { mkdirSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { clickNext, confirmBtn, currentTargetId, E2E, expect, mapReady, otherId, selectRegion, start, test } from './helpers.ts';

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

      // practice: wrong answer feedback, then inset open
      await start(page, E2E, 'practice', '5');
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
      await page.locator('[data-inset="kyiv"]').click();
      await mapReady(page, 'inset-kyiv');
      await page.locator('[data-map="inset-kyiv"]').scrollIntoViewIfNeeded();
      await shot(page, `${tag}-04-inset-kyiv`);

      // assessment with timer, a neutral selection, then results
      await start(page, E2E, 'assessment', '5', locale === 'hu' ? '10 perc' : '10 хв');
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
    await start(page, E2E, 'practice', '12');
    await dismissBanner(page);
    const id = await currentTargetId(page);
    await selectRegion(page, otherId(id));
    await confirmBtn(page).click();
    await page.locator('[data-inset="sevastopol"]').click();
    await mapReady(page, 'inset-sevastopol');
    await checkLayout(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, `${sz.name}-02-game`);
  });
}

test('explore + about screenshots', async ({ page }) => {
  await prefs(page, 'hu', 'light');
  await page.goto(E2E);
  await page.getByRole('button', { name: 'Térkép felfedezése' }).click();
  await mapReady(page, 'explore');
  await page.waitForTimeout(300);
  await shot(page, 'hu-light-07-explore');
  await page.getByRole('button', { name: 'Vissza' }).click();
  await page.getByRole('button', { name: 'Névjegy és források' }).click();
  await expect(page.locator('main')).toContainText('Az adatforrás és a felhasználási feltételek még nincsenek ellenőrizve.');
  await shot(page, 'hu-light-08-about');
  await page.getByRole('button', { name: 'Vissza' }).click();
  await page.getByRole('button', { name: 'Súgó' }).click();
  await expect(page.locator('main')).toContainText('26/27 → 12');
  await shot(page, 'hu-light-09-help');
});
