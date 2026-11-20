import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Browser, makeEnv, pw, seed } from './harness.ts';

test('F2-01/F2-06: setup creates one superadmin; no self-registration; passwords stored only as HMAC of a client key', async () => {
  const { env, admin } = await seed();
  const again = new Browser(env, { now: Date.now() });
  assert.equal((await again.call('POST', '/api/setup', { code: env.SETUP_CODE, login: 'eve', fullName: 'Eve', ...(await pw('eve-password-1')) })).status, 403);
  for (const path of ['/api/register', '/api/signup', '/api/users']) assert.equal((await again.call('POST', path, {})).status, 401);
  const rows = env.DB.raw.prepare('SELECT * FROM users').all() as Record<string, unknown>[];
  assert.equal(rows.filter((r) => r['role'] === 'superadmin').length, 1);
  for (const r of rows) {
    assert.equal(Object.keys(r).some((k) => /password|plain/.test(k)), false);
    assert.match(String(r['pw_verifier']), /^[A-Za-z0-9+/]{43}=$/);
  }
  const me = await admin.call('GET', '/api/me');
  assert.deepEqual({ role: me.data['user'] && (me.data['user'] as { role: string }).role }, { role: 'superadmin' });
});

test('login normalization: case-insensitive, unique, restricted charset', async () => {
  const { A, classA } = await seed();
  const make = async (login: string) => (await A.call('POST', '/api/students', { login, fullName: 'X', classId: classA.id, ...(await pw('valid-password-9')) })).data;
  assert.equal((await make('Diak.A1'))['error'], 'login_taken');
  assert.equal((await make('kovács.anna'))['error'], 'invalid_login');
  assert.equal((await make('a'))['error'], 'invalid_login');
  assert.equal((await make('.anna'))['error'], 'invalid_login');
  const ok = await make('Kovacs.Anna');
  assert.equal((ok['student'] as { login: string }).login, 'kovacs.anna');
});

test('the salt endpoint does not reveal whether a login exists', async () => {
  const { A } = await seed();
  const known = await A.call('POST', '/api/auth/salt', { login: 'diak.a1' });
  const unknown1 = await A.call('POST', '/api/auth/salt', { login: 'nobody.here' });
  const unknown2 = await A.call('POST', '/api/auth/salt', { login: 'nobody.here' });
  assert.equal(known.status, 200); assert.equal(unknown1.status, 200);
  assert.equal(unknown1.data['salt'], unknown2.data['salt']);
  assert.equal(typeof known.data['salt'], typeof unknown1.data['salt']);
  assert.equal(String(unknown1.data['salt']).length, String(known.data['salt']).length);
});

test('F2-06: failed logins are throttled per login (5 → locked), success clears it; errors do not leak', async () => {
  const { env, clock } = await seed();
  const b = new Browser(env, clock, '10.9.9.9');
  for (let i = 0; i < 5; i++) {
    const r = await b.login('diak.a2', 'wrong-password-x');
    assert.equal(r.status, 401); assert.equal(r.data['error'], 'invalid_credentials');
  }
  const locked = await b.login('diak.a2', 'diak.a2-password');
  assert.equal(locked.status, 429); assert.ok((locked.data['retryAfterSeconds'] as number) > 0);
  clock.now += 16 * 60_000;
  assert.equal((await b.login('diak.a2', 'diak.a2-password')).status, 200);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM login_throttle WHERE key = 'login:diak.a2'").get()!['n'], 0);
});

test('F2-07: session survives restarts, extends with use, no idle logout; logout revokes', async () => {
  const { env, clock, studentA } = await seed();
  clock.now += 100 * 86_400_000; // 100 days idle
  const me = await studentA.call('GET', '/api/me');
  assert.equal((me.data['user'] as { login: string }).login, 'diak.a1');
  assert.equal((me.data['user'] as { teacherName: string }).teacherName, 'A Tanár');
  clock.now += 179 * 86_400_000; // extended at the previous use
  assert.ok((await studentA.call('GET', '/api/me')).data['user']);
  const copy = new Browser(env, clock); copy.cookie = studentA.cookie;
  await studentA.call('POST', '/api/auth/logout');
  assert.equal((await copy.call('GET', '/api/me')).data['user'], null, 'the old cookie is revoked server-side');
  clock.now += 181 * 86_400_000;
  const late = new Browser(env, clock); late.cookie = copy.cookie;
  assert.equal((await late.call('GET', '/api/me')).data['user'], null);
});

test('F2-07: password reset, archiving and teacher disabling revoke access', async () => {
  const { env, clock, A, admin, tA, sA1, studentA } = await seed();
  await A.call('POST', `/api/students/${sA1.id}/password`, await pw('new-password-123'));
  assert.equal((await studentA.call('GET', '/api/me')).data['user'], null);
  assert.equal((await studentA.login('diak.a1', 'diak.a1-password')).status, 401);
  assert.equal((await studentA.login('diak.a1', 'new-password-123')).status, 200);

  await A.call('PATCH', `/api/students/${sA1.id}`, { status: 'archived' });
  assert.equal((await studentA.call('GET', '/api/me')).data['user'], null);
  assert.equal((await studentA.login('diak.a1', 'new-password-123')).data['error'], 'account_inactive');
  await A.call('PATCH', `/api/students/${sA1.id}`, { status: 'active' });
  assert.equal((await studentA.login('diak.a1', 'new-password-123')).status, 200);

  await admin.call('PATCH', `/api/teachers/${tA.id}`, { status: 'disabled' });
  assert.equal((await A.call('GET', '/api/classes')).status, 401, 'teacher session revoked');
  assert.equal((await studentA.call('GET', '/api/me')).data['user'], null, 'students of a disabled teacher are blocked');
  const history = env.DB.raw.prepare("SELECT COUNT(*) AS n FROM users WHERE teacher_id = ?").get(tA.id)!['n'];
  assert.equal(history, 2, 'nothing deleted');
  void clock;
});

test('F2-02/F2-03/F2-09: classes and students are managed within the own scope; history is kept', async () => {
  const { A, classA, classA2, classB, sA1 } = await seed();
  assert.equal((await A.call('POST', '/api/classes', { name: '8.a' })).data['error'], 'class_name_taken');
  assert.equal((await A.call('POST', '/api/students', { login: 'x.in.b', fullName: 'X', classId: classB.id, ...(await pw('valid-password-9')) })).status, 404, 'foreign class');
  assert.equal((await A.call('PATCH', `/api/students/${sA1.id}`, { classId: classA2.id })).status, 200);
  assert.equal((await A.call('PATCH', `/api/students/${sA1.id}`, { classId: classB.id })).status, 404);
  assert.equal((await A.call('PATCH', `/api/classes/${classA.id}`, { status: 'archived' })).data['error'], 'class_not_empty');
  assert.equal((await A.call('DELETE', `/api/classes/${classA2.id}`)).data['error'], 'class_not_empty');
  await A.call('PATCH', `/api/students/${sA1.id}`, { status: 'archived' });
  assert.equal((await A.call('DELETE', `/api/classes/${classA2.id}`)).data['error'], 'class_not_empty', 'archived students keep their class');
  assert.equal((await A.call('PATCH', `/api/classes/${classA2.id}`, { status: 'archived' })).status, 200);
  assert.equal((await A.call('PATCH', `/api/students/${sA1.id}`, { status: 'active' })).data['error'], 'class_archived');
  const empty = (await A.call('POST', '/api/classes', { name: 'üres' })).data['class'] as { id: string };
  assert.equal((await A.call('DELETE', `/api/classes/${empty.id}`)).status, 200);
  const list = await A.call('GET', '/api/students?status=all');
  assert.equal((list.data['students'] as unknown[]).length, 2);
});

test('F2-05: superadmin manages any teacher scope, deletes students only with confirmation, never sees passwords', async () => {
  const { admin, tB, classB, sB1 } = await seed();
  assert.equal((await admin.call('GET', '/api/students')).status, 404, 'superadmin must pick a teacher');
  const list = await admin.call('GET', `/api/students?teacherId=${tB.id}`);
  const students = list.data['students'] as Record<string, unknown>[];
  assert.equal(students.length, 1);
  assert.equal(JSON.stringify(list.data).match(/pw_|verifier|salt|password"/), null);
  assert.equal((await admin.call('POST', '/api/students', { teacherId: tB.id, login: 'by.admin', fullName: 'Y', classId: classB.id, ...(await pw('valid-password-9')) })).status, 201);
  assert.equal((await admin.call('DELETE', `/api/students/${sB1.id}`, { confirmLogin: 'wrong' })).data['error'], 'confirmation_mismatch');
  assert.equal((await admin.call('DELETE', `/api/students/${sB1.id}`, { confirmLogin: 'diak.b1' })).status, 200);
  assert.equal((await admin.call('GET', `/api/students?teacherId=${tB.id}`)).data['students'] instanceof Array, true);
  const audit = await admin.call('GET', '/api/audit');
  const text = JSON.stringify(audit.data);
  assert.match(text, /student\.delete/);
  assert.equal(/-password|key"|verifier|salt"/.test(text), false, 'F2-12: no secrets in the audit log');
});

test('CSRF: mutating requests need the custom header and a same origin', async () => {
  const { A, classA } = await seed();
  assert.equal((await A.call('POST', '/api/classes', { name: 'csrf' }, { 'x-topogok': '' })).data['error'], 'csrf');
  assert.equal((await A.call('POST', '/api/classes', { name: 'csrf' }, { origin: 'https://evil.example' })).data['error'], 'csrf');
  assert.equal((await A.call('DELETE', `/api/classes/${classA.id}`, undefined, { origin: 'https://evil.example' })).status, 403);
});

test('without a database or pepper the API answers 503 and health says so', async () => {
  const env = makeEnv();
  const noDb = new Browser({ PEPPER: env.PEPPER! }, { now: Date.now() });
  assert.equal((await noDb.call('GET', '/api/me')).status, 503);
  const h = await noDb.call('GET', '/api/health');
  assert.deepEqual([h.status, h.data['ok'], h.data['db']], [200, false, false]);
  const ok = await new Browser(env, { now: Date.now() }).call('GET', '/api/health');
  assert.deepEqual([ok.data['ok'], ok.data['schema']], [true, 6]);
});

test('recovery: a one-time code resets the superadmin password and revokes old sessions', async () => {
  const { env, clock, admin } = await seed();
  const code = 'recovery-code-abcdefghijklmnop';
  const hash = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code))).toString('base64');
  env.DB.raw.prepare('INSERT INTO recovery_codes (code_hash, created_at, expires_at) VALUES (?, ?, ?)').run(hash, clock.now, clock.now + 3_600_000);
  const b = new Browser(env, clock);
  assert.equal((await b.call('POST', '/api/setup', { code, login: 'owner', ...(await pw('recovered-pass-1')) })).status, 200);
  assert.equal((await admin.call('GET', '/api/me')).data['user'], null);
  assert.equal((await b.login('owner', 'recovered-pass-1')).status, 200);
  assert.equal((await b.call('POST', '/api/setup', { code, login: 'owner', ...(await pw('another-pass-12')) })).status, 403, 'single use');
});
