// F6: leaving the page during an assessment shows a warning (the round goes on), the result waits for the
// teacher's review before reaching the leaderboard, and the teacher sees the log and approves it.
// Browser emulation only: real Android/iOS/desktop behaviour is not proven by this test (F6-09).
import type { Page } from '@playwright/test';
import { login, seedAccounts } from './apiSeed.ts';
import { confirmBtn, currentTargetId, expect, openTopic, selectRegion, start, test } from './helpers.ts';

const BASE = 'http://127.0.0.1:4181/';
const setVisibility = (page: Page, state: 'hidden' | 'visible') => page.evaluate((s) => {
  Object.defineProperty(document, 'visibilityState', { value: s, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}, state);

test('page hidden mid-assessment → warning, pending review; teacher sees the log and approves', async ({ page, context, browser }) => {
  await seedAccounts(BASE);
  await login(page, BASE, 'nagy.anna', 'student-password-1');
  await openTopic(page, BASE, 'tectonics');
  await page.getByRole('button', { name: /^Számonkérés/ }).click();
  await expect(page.getByTestId('integrity-info')).toContainText('Kamerát, mikrofont vagy más ablakot nem figyel');

  await start(page, BASE, 'assessment', 'all', 'tectonics');
  for (let i = 0; i < 11; i++) {
    if (i === 3) {
      await setVisibility(page, 'hidden');
      await page.waitForTimeout(1300);
      await setVisibility(page, 'visible');
      const n = page.getByTestId('integrity-notice');
      await expect(n).toHaveAttribute('data-kind', 'hidden');
      await expect(n).toContainText('Elhagytad az oldalt');
      await expect(page.locator('main')).toContainText('Számonkérés · 4 / 11', { timeout: 1000 }); // the round goes on
    }
    if (i === 6) {
      await context.setOffline(true);
      await expect(page.getByTestId('integrity-notice')).toHaveAttribute('data-kind', 'offline');
      await context.setOffline(false);
      await expect(page.getByTestId('integrity-notice')).toHaveAttribute('data-kind', 'online');
    }
    const id = await currentTargetId(page);
    await selectRegion(page, id);
    await confirmBtn(page).click();
  }
  await expect(page.getByTestId('grade')).toHaveText('12 / 12-es jegy');
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', { timeout: 30_000 });
  await expect(page.getByTestId('review-pending')).toContainText('jóváhagyására vár');
  await openTopic(page, BASE, 'tectonics');
  await expect(page.getByTestId('personal-record')).toContainText('Egy eredményed tanári jóváhagyásra vár.');

  const ctx = await browser.newContext();
  const teacher = await ctx.newPage();
  await login(teacher, BASE, 'kovacs.tanar', 'teacher-password-1');
  await teacher.getByRole('button', { name: 'Tanári felület' }).click();
  await teacher.getByRole('button', { name: 'Eredmények' }).click();
  const item = teacher.locator('[data-attempt]').first();
  await expect(item.getByTestId('integrity')).toContainText('Oldal elhagyva: 1×');
  await expect(item.getByTestId('integrity')).toContainText('kapcsolat: 1×');
  await expect(item.getByTestId('review-status')).toHaveText('jóváhagyásra vár');
  await item.getByRole('button', { name: 'Részletek' }).click();
  await expect(item.getByTestId('integrity').locator('li').first()).toContainText('Oldal elhagyva: 00:');
  await item.getByRole('button', { name: 'Jóváhagyás' }).click();
  await item.getByLabel('Indoklás').fill('Mellette ültem');
  await item.getByRole('button', { name: 'Jóváhagyás' }).last().click();
  await expect(item.getByTestId('review-status')).toHaveText('jóváhagyva');
  await teacher.getByRole('button', { name: 'Toplista' }).click();
  await teacher.getByTestId('board-panel').getByLabel('Téma').selectOption('ukraine-tectonics');
  await expect(teacher.getByTestId('leaderboard').locator('li')).toContainText(['Nagy Anna']);
  await ctx.close();
});
