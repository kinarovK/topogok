// Test client for the API: real router, in-memory SQLite, a cookie jar per "browser".
import { passwordPayload } from '../../shared/kdf.ts';
import { deriveKey } from '../../shared/kdf.ts';
import { handle } from '../../server/router.ts';
import type { Env } from '../../server/types.ts';
import { migrate, sqliteD1 } from './sqliteD1.ts';

export const TEST_ITERATIONS = 1000;
export const ORIGIN = 'https://topogok.test';

export function makeEnv(): Env & { DB: ReturnType<typeof sqliteD1> } {
  const DB = sqliteD1();
  migrate(DB.raw);
  return { DB, PEPPER: 'test-pepper-0123456789abcdef0123456789abcdef', SETUP_CODE: 'setup-code-0123456789', MIN_KDF_ITERATIONS: String(TEST_ITERATIONS), APP_BUILD: 'test' };
}

export class Browser {
  cookie = '';
  readonly env: Env;
  readonly clock: { now: number };
  readonly ip: string;
  constructor(env: Env, clock: { now: number }, ip = '10.0.0.1') { this.env = env; this.clock = clock; this.ip = ip; }

  async call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const h: Record<string, string> = { 'content-type': 'application/json', 'x-topogok': '1', origin: ORIGIN, 'cf-connecting-ip': this.ip, ...headers };
    if (this.cookie) h['cookie'] = this.cookie;
    const res = await handle(new Request(`${ORIGIN}${path}`, { method, headers: h, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }), this.env, this.clock.now);
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const [pair] = setCookie.split(';');
      this.cookie = /Max-Age=0/.test(setCookie) ? '' : pair!;
    }
    const data = (await res.json()) as Record<string, unknown>;
    return { status: res.status, data };
  }

  async login(login: string, password: string) {
    const salt = await this.call('POST', '/api/auth/salt', { login });
    const key = await deriveKey(password, salt.data['salt'] as string, salt.data['iterations'] as number);
    return this.call('POST', '/api/auth/login', { login, key });
  }
}

export const pw = (password: string) => passwordPayload(password, TEST_ITERATIONS);

/** Superadmin, two teachers with a class of the same name, students in each. */
export async function seed() {
  const env = makeEnv();
  const clock = { now: Date.UTC(2026, 10, 11, 9) };
  const admin = new Browser(env, clock);
  await admin.call('POST', '/api/setup', { code: env.SETUP_CODE, login: 'owner', fullName: 'Tulajdonos', ...(await pw('owner-password-1')) });
  if ((await admin.login('owner', 'owner-password-1')).status !== 200) throw new Error('admin login failed');
  const teacher = async (login: string, name: string) => (await admin.call('POST', '/api/teachers', { login, fullName: name, ...(await pw(`${login}-password`)) })).data['teacher'] as { id: string };
  const tA = await teacher('tanar.a', 'A Tanár');
  const tB = await teacher('tanar.b', 'B Tanár');
  const A = new Browser(env, clock, '10.0.0.2'); await A.login('tanar.a', 'tanar.a-password');
  const B = new Browser(env, clock, '10.0.0.3'); await B.login('tanar.b', 'tanar.b-password');
  const classA = (await A.call('POST', '/api/classes', { name: '8.A' })).data['class'] as { id: string };
  const classA2 = (await A.call('POST', '/api/classes', { name: '8.B' })).data['class'] as { id: string };
  const classB = (await B.call('POST', '/api/classes', { name: '8.A' })).data['class'] as { id: string };
  const student = async (t: Browser, login: string, classId: string) => (await t.call('POST', '/api/students', { login, fullName: `Diák ${login}`, classId, ...(await pw(`${login}-password`)) })).data['student'] as { id: string };
  const sA1 = await student(A, 'diak.a1', classA.id);
  const sA2 = await student(A, 'diak.a2', classA.id);
  const sB1 = await student(B, 'diak.b1', classB.id);
  const studentA = new Browser(env, clock, '10.0.0.4'); await studentA.login('diak.a1', 'diak.a1-password');
  return { env, clock, admin, A, B, tA, tB, classA, classA2, classB, sA1, sA2, sB1, studentA };
}
