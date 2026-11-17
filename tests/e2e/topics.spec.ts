// F4: the teacher narrows a topic to two features; the student is asked only those, the rest of the map is grey
// and cannot be selected; another session as guest gets the full map again.
import { login, seedAccounts } from './apiSeed.ts';
import { clickRegion, confirmBtn, currentTargetId, expect, openTopic, REGIONS, selectRegion, test, topicCard } from './helpers.ts';

const BASE = 'http://127.0.0.1:4178/';
const plain = REGIONS.map((r) => r.id).filter((id) => id !== 'UA-30' && id !== 'UA-40');
const KEEP = [plain[0]!, plain[1]!];
const OFF = plain[5]!;

test('teacher narrows the question set; the student gets only those; guests keep the full map', async ({ page, browser }) => {
  await seedAccounts(BASE);
  let settingsRequests = 0;
  page.on('request', (r) => { if (r.url().includes('/api/topic-settings') && r.method() === 'GET') settingsRequests++; });
  await login(page, BASE, 'kovacs.tanar', 'teacher-password-1');
  await page.getByRole('button', { name: 'Tanári felület' }).click();
  await page.getByRole('button', { name: 'Témák' }).click();
  const panel = page.getByTestId('topics-panel');
  await expect(panel.getByTestId('topics-count')).toHaveText('27 / 27 kérdezhető');
  await panel.getByRole('button', { name: 'Egyik sem' }).click();
  await expect(panel.getByRole('button', { name: 'Mentés' })).toBeDisabled();
  for (const id of KEEP) await panel.locator(`[data-feature="${id}"]`).check();
  await expect(panel.getByTestId('topics-count')).toHaveText('2 / 27 kérdezhető');
  await expect(panel.getByText('2 / 27 kérdezhető')).toHaveCount(2);
  await panel.getByRole('button', { name: 'Mentés' }).click();
  await expect(panel.getByRole('status')).toHaveText('Mentve.');
  expect(settingsRequests, 'the topics tab loads its settings once').toBe(1);

  const ctx = await browser.newContext();
  const student = await ctx.newPage();
  await login(student, BASE, 'nagy.anna', 'student-password-1');
  await (await topicCard(student, 'ukraine-administration')).click();
  await student.locator('button', { hasText: /^Számonkérés/ }).first().click();
  await expect(student.getByTestId('teacher-selection')).toContainText('2 elemet');
  const options = student.locator('fieldset').first().locator('label');
  await expect(options).toHaveText(['Mindegyik (2)']);
  await student.getByRole('button', { name: 'Indítás' }).click();
  await expect(student.locator('[data-map="main"]')).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });

  // A switched-off area does nothing when clicked.
  await clickRegion(student, OFF);
  await expect(confirmBtn(student)).toBeDisabled();
  for (let i = 0; i < 2; i++) {
    const id = await currentTargetId(student);
    expect(KEEP).toContain(id);
    await selectRegion(student, id);
    await confirmBtn(student).click();
  }
  await expect(student.getByTestId('result')).toBeVisible();
  await expect(student.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', { timeout: 30_000 });

  // Logout → guest: full topic again.
  await student.goto(BASE);
  await student.getByRole('button', { name: 'Kijelentkezés' }).click();
  await openTopic(student, BASE);
  await student.locator('button', { hasText: /^Számonkérés/ }).first().click();
  await expect(student.getByTestId('teacher-selection')).toHaveCount(0);
  await expect(student.locator('fieldset').first().locator('label')).toHaveText(['5', '12', 'Mindegyik (27)']);
  await ctx.close();
});
