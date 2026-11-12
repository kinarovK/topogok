// F3: a logged-in student's rounds are saved (start + finish) and the teacher sees them. Real API, in-memory SQLite.
import { request as playwrightRequest, type Page } from '@playwright/test';
import { deriveKey, passwordPayload } from '../../shared/kdf.ts';
import { confirmBtn, currentTargetId, expect, selectRegion, start, test } from './helpers.ts';

const BASE = 'http://127.0.0.1:4177/';
const SETUP_CODE = 'local-setup-code-0123456789';
const HEADERS = { 'content-type': 'application/json', 'x-topogok': '1', origin: 'http://127.0.0.1:4177' };

/** Seeds owner → teacher → class → student through the API (the UI flow is covered by account.spec.ts). */
async function seed() {
  const req = await playwrightRequest.newContext({ baseURL: BASE, extraHTTPHeaders: HEADERS });
  let cookie = '';
  const call = async (method: string, path: string, data?: unknown) => {
    const r = await req.fetch(path, { method, headers: cookie ? { cookie } : {}, ...(data !== undefined ? { data } : {}) });
    const set = r.headers()['set-cookie'];
    if (set) cookie = set.split(';')[0]!;
    expect(r.ok(), `${method} ${path}: ${await r.text()}`).toBe(true);
    return (await r.json()) as Record<string, unknown>;
  };
  const signIn = async (login: string, password: string) => {
    cookie = '';
    const { salt, iterations } = (await call('POST', '/api/auth/salt', { login })) as { salt: string; iterations: number };
    await call('POST', '/api/auth/login', { login, key: await deriveKey(password, salt, iterations) });
  };
  await call('POST', '/api/setup', { code: SETUP_CODE, login: 'owner', fullName: 'Tulajdonos', ...(await passwordPayload('owner-password-1')) });
  await signIn('owner', 'owner-password-1');
  await call('POST', '/api/teachers', { login: 'kovacs.tanar', fullName: 'Kovács Tanár', ...(await passwordPayload('teacher-password-1')) });
  await signIn('kovacs.tanar', 'teacher-password-1');
  const cls = (await call('POST', '/api/classes', { name: '8.A' }))['class'] as { id: string };
  await call('POST', '/api/students', { login: 'nagy.anna', fullName: 'Nagy Anna', classId: cls.id, ...(await passwordPayload('student-password-1')) });
  await req.dispose();
}

async function login(page: Page, user: string, password: string) {
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Belépés' }).click();
  await page.getByLabel('Felhasználónév').fill(user);
  await page.getByLabel('Jelszó').fill(password);
  await page.getByRole('button', { name: 'Belépés' }).click();
  await expect(page.getByTestId('account-bar')).toBeVisible({ timeout: 30_000 });
}

/** Five-question assessment, all answers correct; `beforeLast` runs before the last confirmation. */
async function playAssessment(page: Page, beforeLast?: () => Promise<void>) {
  await start(page, BASE, 'assessment', '5');
  for (let i = 0; i < 5; i++) {
    const id = await currentTargetId(page);
    await selectRegion(page, id);
    if (i === 4 && beforeLast) await beforeLast();
    await confirmBtn(page).click();
  }
  await expect(page.getByTestId('result')).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test('student round is saved; offline finish waits and is sent once back online; failed start is not saved', async ({ page, context }) => {
  await seed();
  await login(page, 'nagy.anna', 'student-password-1');

  await playAssessment(page);
  const save = page.getByTestId('save-status');
  await expect(save).toHaveAttribute('data-status', 'saved', { timeout: 30_000 });
  await expect(save).toContainText('Mentve');
  await expect(page.locator('main')).not.toContainText('nem kerül mentésre');

  // The connection drops just before the last answer: the result is shown, the save waits.
  await playAssessment(page, () => context.setOffline(true));
  await expect(save).toHaveAttribute('data-status', 'pending');
  await expect(save).toContainText('Mentés függőben');
  await context.setOffline(false);
  await expect(save).toHaveAttribute('data-status', 'saved', { timeout: 30_000 });

  // No connection at the start: the round can still be played, but it is never shown as saved.
  await page.goto(BASE);
  await page.locator('[data-topic="ukraine-administration"]').click();
  await page.locator('button', { hasText: /^Gyakorlás/ }).first().click();
  await page.locator('label', { hasText: /^5$/ }).click();
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Indítás' }).click();
  await expect(page.getByTestId('round-unsaved')).toContainText('nem lesz mentve', { timeout: 30_000 });
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Kilépés', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Kilépés' }).click();
});

test('teacher sees the saved rounds, the summary and can delete a round with a reason', async ({ page }) => {
  await login(page, 'kovacs.tanar', 'teacher-password-1');
  await page.getByRole('button', { name: 'Tanári felület' }).click();
  await page.getByRole('button', { name: 'Eredmények' }).click();
  const panel = page.getByTestId('results-panel');
  await expect(panel.getByTestId('report-updated')).toBeVisible({ timeout: 30_000 });
  const finished = panel.locator('[data-attempt][data-status="finished"]');
  await expect(finished).toHaveCount(2);
  await expect(finished.first()).toContainText('100%');
  await expect(finished.first()).toContainText('12');
  const summary = panel.locator('[data-student="nagy.anna"][data-mode="assessment"]');
  await expect(summary).toContainText('befejezett: 2');
  await expect(summary.getByTestId('summary-best')).toContainText('–'); // 5-question rounds are not full rounds
  await expect(panel.getByRole('button', { name: 'Frissítés' })).toBeDisabled();

  await finished.first().getByRole('button', { name: 'Törlés' }).click();
  await finished.first().getByLabel('A törlés indoka').fill('Teszt kör');
  await finished.first().getByRole('button', { name: 'Törlés' }).last().click();
  await expect(panel.locator('[data-attempt][data-status="finished"]')).toHaveCount(1);
  await expect(panel.getByRole('button', { name: 'Frissítés' })).toBeEnabled({ timeout: 15_000 });
});
