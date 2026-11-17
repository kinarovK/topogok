// F2: accounts end to end against the real API code (scripts/dev/serve.mjs --api, in-memory SQLite).
import type { Page } from '@playwright/test';
import { expect, test, topicCard } from './helpers.ts';

const BASE = 'http://127.0.0.1:4176/';
const SETUP_CODE = 'local-setup-code-0123456789';

async function login(page: Page, user: string, password: string) {
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Belépés' }).click();
  await page.getByLabel('Felhasználónév').fill(user);
  await page.getByLabel('Jelszó').fill(password);
  await page.getByRole('button', { name: 'Belépés' }).click();
  await expect(page.getByTestId('account-bar')).toBeVisible({ timeout: 30_000 });
}

async function logout(page: Page) {
  await page.getByRole('button', { name: 'Kijelentkezés' }).click();
  await expect(page.getByTestId('account-bar')).toHaveCount(0);
}

async function setPasswords(page: Page, password: string) {
  await page.getByLabel('Jelszó', { exact: true }).fill(password);
  await page.getByLabel('Jelszó még egyszer').fill(password);
}

test.describe.configure({ mode: 'serial' });

test('superadmin setup → teacher → class → student → student sign-in; logout leaves nothing behind', async ({ page }) => {
  // First superadmin with the one-time setup code.
  await page.goto(`${BASE}#/setup`);
  await expect(page.locator('h1')).toHaveText('Első beállítás');
  await page.getByLabel('Kód').fill(SETUP_CODE);
  await page.getByLabel('Felhasználónév').fill('owner');
  await page.getByLabel('Teljes név').fill('Tulajdonos Teszt');
  await setPasswords(page, 'short');
  await page.getByRole('button', { name: 'Mentés' }).click();
  await expect(page.getByRole('alert')).toContainText('legalább 6 karakter');
  await setPasswords(page, 'owner-password-1');
  await page.getByRole('button', { name: 'Mentés' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'A fiók elkészült' })).toBeVisible({ timeout: 30_000 });

  // Superadmin creates a teacher.
  await login(page, 'owner', 'owner-password-1');
  await expect(page.getByTestId('account-bar')).toContainText('Tulajdonos Teszt');
  await expect(page.getByTestId('account-bar')).toContainText('Szuperadmin');
  await page.getByRole('button', { name: 'Adminisztráció' }).click();
  await page.getByRole('button', { name: 'Új tanár' }).click();
  await page.getByLabel('Teljes név').fill('Kovács Tanár');
  await page.getByLabel('Felhasználónév').fill('Kovacs.Tanar');
  await setPasswords(page, 'teacher-password-1');
  await page.getByRole('button', { name: 'Létrehozás' }).click();
  await expect(page.locator('[data-teacher="kovacs.tanar"]')).toContainText('Kovács Tanár', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Vissza', exact: true }).click();
  await logout(page);

  // Teacher: class, then a student.
  await login(page, 'kovacs.tanar', 'teacher-password-1');
  await page.getByRole('button', { name: 'Tanári felület' }).click();
  await expect(page.getByText('Előbb hozz létre egy osztályt.')).toBeVisible();
  await page.getByRole('button', { name: 'Osztályok' }).click();
  await page.getByLabel('Osztály neve').fill('8.A');
  await page.getByRole('button', { name: 'Új osztály' }).click();
  await expect(page.locator('[data-class="8.A"]')).toBeVisible();
  await page.getByRole('button', { name: 'Diákok' }).click();
  await page.getByRole('button', { name: 'Új diák' }).click();
  await page.getByLabel('Teljes név').fill('Nagy Anna');
  await page.getByLabel('Felhasználónév').fill('kovács.anna');
  await setPasswords(page, 'student-password-1');
  await page.getByRole('button', { name: 'Létrehozás' }).click();
  await expect(page.getByRole('alert')).toContainText('ékezet nélkül');
  await page.getByLabel('Felhasználónév').fill('nagy.anna');
  await page.getByRole('button', { name: 'Létrehozás' }).click();
  await expect(page.locator('[data-student="nagy.anna"]')).toContainText('8.A', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Vissza', exact: true }).click();
  await logout(page);

  // Student signs in: sees own name, teacher and class; no management area.
  await login(page, 'nagy.anna', 'student-password-1');
  const bar = page.getByTestId('account-bar');
  await expect(bar).toContainText('Nagy Anna');
  await expect(bar).toContainText('Tanár: Kovács Tanár · Osztály: 8.A');
  await expect(page.getByRole('button', { name: /Tanári felület|Adminisztráció/ })).toHaveCount(0);
  // Persistent: survives a reload.
  await page.reload();
  await expect(page.getByTestId('account-bar')).toContainText('Nagy Anna');
  // Shared device (F2-08): after logout no personal data on screen or in browser storage, and the old session is gone.
  await logout(page);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Belépés' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Nagy Anna');
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  expect(stored).not.toMatch(/Anna|nagy\.anna|session/);
  // Guest play is unaffected.
  await (await topicCard(page, 'ukraine-administration')).click();
  await expect(page.getByRole('button', { name: /^Gyakorlás/ })).toBeVisible();
});

test('wrong passwords are throttled; Ukrainian login screen', async ({ page }) => {
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Belépés' }).click();
  for (let i = 0; i < 5; i++) {
    await page.getByLabel('Felhasználónév').fill('nagy.anna');
    await page.getByLabel('Jelszó').fill('wrong-password-x');
    await page.getByRole('button', { name: 'Belépés' }).click();
    await expect(page.getByRole('alert')).toContainText('Hibás felhasználónév vagy jelszó.', { timeout: 30_000 });
  }
  await page.getByRole('button', { name: 'Belépés' }).click();
  await expect(page.getByRole('alert')).toContainText('Túl sok sikertelen próbálkozás');
  await page.getByLabel('Nyelv', { exact: true }).selectOption('uk');
  await expect(page.locator('h1')).toHaveText('Вхід');
  await expect(page.getByLabel('Ім’я користувача')).toBeVisible();
});
