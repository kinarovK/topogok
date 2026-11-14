// F5: a full-map assessment reaches the leaderboard and the personal record; refresh is limited;
// the teacher can take a result off the leaderboard and put it back.
import { login, seedAccounts } from './apiSeed.ts';
import { confirmBtn, currentTargetId, expect, openTopic, selectRegion, start, test } from './helpers.ts';

const BASE = 'http://127.0.0.1:4179/';

test('full assessment → record and leaderboard; teacher excludes and re-includes', async ({ page, browser }) => {
  await seedAccounts(BASE);
  const boardRequests: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/api/leaderboard')) boardRequests.push(r.url()); });
  await login(page, BASE, 'nagy.anna', 'student-password-1');
  await openTopic(page, BASE, 'tectonics');
  await expect(page.getByTestId('personal-record')).toHaveText('Még nincs toplistás eredményed ezen a térképen.');

  // The setup screen says in advance whether the round can count.
  await page.getByRole('button', { name: /^Számonkérés/ }).click();
  await page.locator('label', { hasText: /^5$/ }).click();
  await expect(page.getByTestId('board-eligibility')).toContainText('nem kerül a toplistára');
  await page.locator('label', { hasText: 'Mindegyik (11)' }).click();
  await expect(page.getByTestId('board-eligibility')).toContainText('felkerülhet a toplistára');

  await start(page, BASE, 'assessment', 'all', 'tectonics');
  for (let i = 0; i < 11; i++) {
    const id = await currentTargetId(page);
    await selectRegion(page, id);
    await confirmBtn(page).click();
  }
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', { timeout: 30_000 });

  await openTopic(page, BASE, 'tectonics');
  await expect(page.getByTestId('personal-record')).toContainText('Saját rekord: 11 / 11 · 100%');
  await page.getByRole('button', { name: 'Toplista' }).click();
  const board = page.getByTestId('leaderboard');
  const mine = board.locator('li[aria-current="true"]');
  await expect(mine).toContainText('Nagy Anna');
  await expect(mine).toContainText('11 / 11');
  await expect(mine).toHaveAttribute('data-rank', '1');
  await expect(board.getByTestId('board-refresh')).toBeDisabled();
  await expect(board.getByTestId('board-refresh')).toContainText(/Frissítés \(\d+ mp\)/);
  await expect(board.getByRole('alert')).toHaveCount(0);
  await page.waitForTimeout(1500);
  expect(boardRequests, 'opening the leaderboard makes exactly one request').toHaveLength(1);

  // Teacher: the round is a leaderboard candidate; exclude it with a reason, then take it back.
  const ctx = await browser.newContext();
  const teacher = await ctx.newPage();
  await login(teacher, BASE, 'kovacs.tanar', 'teacher-password-1');
  await teacher.getByRole('button', { name: 'Tanári felület' }).click();
  await teacher.getByRole('button', { name: 'Eredmények' }).click();
  const item = teacher.locator('[data-attempt]').first();
  await expect(item.getByTestId('lb-state')).toHaveText('toplistás');
  await item.getByRole('button', { name: 'Kizárás a toplistából' }).click();
  await item.getByLabel('A kizárás indoka').fill('Tesztkör');
  await item.getByRole('button', { name: 'Kizárás a toplistából' }).last().click();
  await expect(item.getByTestId('lb-state')).toContainText('kizárva a toplistából');
  await teacher.getByRole('button', { name: 'Toplista' }).click();
  await teacher.getByTestId('board-panel').getByLabel('Téma').selectOption('ukraine-tectonics');
  await expect(teacher.getByTestId('board-panel')).toContainText('Még nincs toplistás eredmény ebben az időszakban.');
  await teacher.waitForTimeout(10_500); // the results panel may be loaded once every 10 s
  await teacher.getByRole('button', { name: 'Eredmények' }).click();
  const again = teacher.locator('[data-attempt]').first();
  await again.getByRole('button', { name: 'Visszavétel a toplistára' }).click();
  await expect(again.getByTestId('lb-state')).toHaveText('toplistás');
  await ctx.close();
});
