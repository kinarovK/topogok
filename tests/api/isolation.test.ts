// F2-04 / G-04: table-driven negative tests. Every endpoint × every actor that must not reach the data.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Browser, pw, seed } from './harness.ts';

test('cross-tenant and role isolation on every endpoint (real API, guessed ids, swapped parameters)', async () => {
  const s = await seed();
  const { env, clock, A, B, studentA, admin, tA, tB, classB, sB1 } = s;
  const anonymous = new Browser(env, clock, '10.1.1.1');
  const disabledT = (await admin.call('POST', '/api/teachers', { login: 'tanar.c', fullName: 'C Tanár', ...(await pw('tanar.c-password')) })).data['teacher'] as { id: string };
  const C = new Browser(env, clock, '10.1.1.2'); await C.login('tanar.c', 'tanar.c-password');
  const classC = (await C.call('POST', '/api/classes', { name: '7.C' })).data['class'] as { id: string };
  await C.call('POST', '/api/students', { login: 'diak.c1', fullName: 'Diák C', classId: classC.id, ...(await pw('diak.c1-password')) });
  const studentC = new Browser(env, clock, '10.1.1.3'); await studentC.login('diak.c1', 'diak.c1-password');
  await admin.call('PATCH', `/api/teachers/${disabledT.id}`, { status: 'disabled' });

  const before = JSON.stringify(env.DB.raw.prepare('SELECT * FROM users ORDER BY id').all()) + JSON.stringify(env.DB.raw.prepare('SELECT * FROM classes ORDER BY id').all());
  const payload = await pw('attack-password-1');
  // Requests aimed at teacher B's data.
  const attacks: Array<[string, string, unknown?]> = [
    ['GET', `/api/students?teacherId=${tB.id}`],
    ['GET', `/api/classes?teacherId=${tB.id}`],
    ['POST', '/api/classes', { name: 'hijack', teacherId: tB.id }],
    ['PATCH', `/api/classes/${classB.id}`, { name: 'hijacked', teacherId: tB.id }],
    ['DELETE', `/api/classes/${classB.id}?teacherId=${tB.id}`],
    ['POST', '/api/students', { teacherId: tB.id, classId: classB.id, login: 'intruder', fullName: 'I', ...payload }],
    ['PATCH', `/api/students/${sB1.id}`, { fullName: 'Changed', teacherId: tB.id }],
    ['PATCH', `/api/students/${sB1.id}`, { status: 'archived' }],
    ['POST', `/api/students/${sB1.id}/password`, { teacherId: tB.id, ...payload }],
    ['DELETE', `/api/students/${sB1.id}`, { confirmLogin: 'diak.b1' }],
    ['GET', '/api/teachers'],
    ['POST', '/api/teachers', { login: 'fake.teacher', fullName: 'F', ...payload }],
    ['PATCH', `/api/teachers/${tB.id}`, { status: 'disabled' }],
    ['POST', `/api/teachers/${tB.id}/password`, payload],
    ['GET', '/api/audit'],
  ];
  const actors: Array<[string, Browser]> = [['anonymous', anonymous], ['student of A', studentA], ['teacher A', A], ['student of a disabled teacher', studentC], ['disabled teacher', C]];
  const leaks: string[] = [];
  for (const [who, browser] of actors) {
    for (const [method, path, body] of attacks) {
      const r = await browser.call(method, path, body);
      const text = JSON.stringify(r.data);
      const leaked = /diak\.b1|Diák diak\.b1|tanar\.b|B Tanár/.test(text);
      // Teacher A may list *their own* data (teacherId is ignored for teachers) — that is not B's data.
      const ownScopeRead = who === 'teacher A' && method === 'GET' && /^\/api\/(students|classes)\?/.test(path);
      const ownCreate = who === 'teacher A' && method === 'POST' && path === '/api/classes';
      if (ownScopeRead || ownCreate) {
        if (leaked) leaks.push(`${who} ${method} ${path}: leaked B data`);
        continue;
      }
      if (r.status < 400 || leaked) leaks.push(`${who} ${method} ${path} → ${r.status} ${text.slice(0, 80)}`);
    }
  }
  assert.deepEqual(leaks, []);
  // Teacher A's "hijack" class landed in A's own scope, not in B's.
  const hijack = env.DB.raw.prepare("SELECT teacher_id FROM classes WHERE name = 'hijack'").get() as { teacher_id: string } | undefined;
  assert.equal(hijack?.teacher_id, tA.id);
  env.DB.raw.prepare("DELETE FROM classes WHERE name = 'hijack'").run();
  const after = JSON.stringify(env.DB.raw.prepare('SELECT * FROM users ORDER BY id').all()) + JSON.stringify(env.DB.raw.prepare('SELECT * FROM classes ORDER BY id').all());
  assert.equal(after, before, 'no change to any user or class');
  // Teacher B still has full access to their own data.
  assert.equal(((await B.call('GET', '/api/students')).data['students'] as unknown[]).length, 1);
});

test('the database itself rejects a student whose class belongs to another teacher', async () => {
  const { env, tA, classB } = await seed();
  assert.throws(() => env.DB.raw.prepare(
    "INSERT INTO users (id, role, login, login_norm, full_name, teacher_id, class_id, pw_salt, pw_iterations, pw_verifier, pw_changed_at, created_at, updated_at) VALUES ('00000000-0000-0000-0000-000000000099', 'student', 'x', 'x', 'X', ?, ?, 's', 1, 'v', 0, 0, 0)",
  ).run(tA.id, classB.id), /student_scope/);
});
