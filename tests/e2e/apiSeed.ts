// Seeds accounts through the real API for E2E specs that run against `serve.mjs --api`.
import { request as playwrightRequest, type Page } from '@playwright/test';
import { deriveKey, passwordPayload } from '../../shared/kdf.ts';
import { expect } from './helpers.ts';

const SETUP_CODE = 'local-setup-code-0123456789';

/** Seeds owner → teacher → class → student through the API (the UI flow is covered by account.spec.ts). */
export async function seedAccounts(base: string) {
  const req = await playwrightRequest.newContext({ baseURL: base, extraHTTPHeaders: { 'content-type': 'application/json', 'x-topogok': '1', origin: base.replace(/\/$/, '') } });
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

export async function login(page: Page, base: string, user: string, password: string) {
  await page.goto(base);
  await page.getByRole('button', { name: 'Belépés' }).click();
  await page.getByLabel('Felhasználónév').fill(user);
  await page.getByLabel('Jelszó').fill(password);
  await page.getByRole('button', { name: 'Belépés' }).click();
  await expect(page.getByTestId('account-bar')).toBeVisible({ timeout: 30_000 });
}

