import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Browser, pw, seed } from './harness.ts';

import { ids, play, topic } from './play.ts';
type Clock = { now: number };

async function board(b: Browser, clock: Clock, extra = '') {
  clock.now += 61_000;
  const r = await b.call('GET', `/api/leaderboard?topicId=${topic.id}${extra}`);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data['rows'] as Array<{ rank: number; fullName: string; correct: number; total: number; durationMs: number }>;
}

test('F5-03/F5-05: accuracy first, then time; one row per student; exact ties share a place (1, 1, 3)', async () => {
  const { env, clock, A, studentA, classA } = await seed();
  const mk = async (login: string) => {
    await A.call('POST', '/api/students', { login, fullName: `Diák ${login}`, classId: classA.id, ...(await pw(`${login}-password`)) });
    const b = new Browser(env, clock, `10.2.0.${login.length}`); assert.equal((await b.login(login, `${login}-password`)).status, 200); return b;
  };
  const a2 = await mk('masodik.d'); const a3 = await mk('harmadik.d'); const a4 = await mk('negyedik.dd');
  await play(studentA, clock, { wrong: 0, step: 27_000 });   // 11/11, ~5 min
  await play(studentA, clock, { wrong: 3, step: 1000 });     // worse round of the same student: ignored
  await play(a2, clock, { wrong: 1, step: 5_000 });          // 10/11, 55 s
  await play(a3, clock, { wrong: 1, step: 5_000 });          // identical → same place
  await play(a4, clock, { wrong: 1, step: 6_000 });          // 10/11 but slower
  const rows = await board(A, clock);
  assert.deepEqual(rows.map((r) => [r.rank, r.fullName, r.correct]), [
    [1, 'Diák diak.a1', 11], [2, 'Diák masodik.d', 10], [2, 'Diák harmadik.d', 10], [4, 'Diák negyedik.dd', 10]]);
  assert.deepEqual(Object.keys(rows[0]!).sort(), ['correct', 'durationMs', 'fullName', 'percent', 'rank', 'studentId', 'total'], 'no login or class on the board');
  const rec = await studentA.call('GET', `/api/record?topicId=${topic.id}`);
  assert.deepEqual(rec.data['record'], { correct: 11, total: 11, percent: 100, durationMs: rows[0]!.durationMs });
});

test('F5-01/F5-02: only full, unlimited, finished, unrestricted, valid rounds count', async () => {
  const { env, clock, A, studentA } = await seed();
  await play(studentA, clock, { count: 5 });                          // short round
  await play(studentA, clock, { mode: 'practice' });                  // practice
  await play(studentA, clock, { limit: 10 });                         // time-limited (old clients)
  await play(studentA, clock, { quit: true });                        // abandoned
  // Teacher narrows to 10 units: "all (10)" is not the full map even though the student answered every question.
  await A.call('PUT', `/api/topic-settings/${topic.id}`, { disabled: [ids[0]], baseVersion: 0 });
  await play(studentA, clock, { enabled: ids.slice(1), settingsVersion: 1 });
  await A.call('PUT', `/api/topic-settings/${topic.id}`, { disabled: [], baseVersion: 1 });
  assert.deepEqual(await board(A, clock), []);
  assert.equal((await studentA.call('GET', `/api/record?topicId=${topic.id}`)).data['record'], null);

  // Forged full set: an attempt row whose question set differs from the topic is never eligible.
  const good = await play(studentA, clock, { settingsVersion: 2 });
  assert.equal((await board(A, clock)).length, 1);
  env.DB.raw.prepare('UPDATE attempts SET question_ids = ? WHERE id = ?').run(JSON.stringify([...ids.slice(1), 'TU-xx']), good);
  assert.deepEqual(await board(A, clock), []);
  env.DB.raw.prepare('UPDATE attempts SET question_ids = ? WHERE id = ?').run(JSON.stringify(ids), good);
  // F6 placeholders: pending or rejected review keeps the round off the board, approved puts it on.
  for (const [review, n] of [['pending', 0], ['rejected', 0], ['approved', 1]] as const) {
    env.DB.raw.prepare('UPDATE attempts SET review_status = ? WHERE id = ?').run(review, good);
    assert.equal((await board(A, clock)).length, n, review);
  }
});

test('F5-08/F5-09: exclusion, soft delete, archiving and a new period recompute rank and record', async () => {
  const { env, clock, A, studentA, sA1, classA } = await seed();
  await A.call('POST', '/api/students', { login: 'masik.diak', fullName: 'Másik Diák', classId: classA.id, ...(await pw('masik-password-1')) });
  const other = new Browser(env, clock, '10.3.3.3'); await other.login('masik.diak', 'masik-password-1');
  const best = await play(studentA, clock, { wrong: 0 });
  const second = await play(studentA, clock, { wrong: 2 });
  await play(other, clock, { wrong: 1 });
  assert.deepEqual((await board(A, clock)).map((r) => [r.rank, r.correct]), [[1, 11], [2, 10]]);

  assert.equal((await A.call('POST', `/api/report/attempts/${best}/leaderboard`, { excluded: true, reason: 'x' })).data['error'], 'invalid_reason');
  assert.equal((await A.call('POST', `/api/report/attempts/${best}/leaderboard`, { excluded: true, reason: 'Segítséggel játszott' })).status, 200);
  assert.deepEqual((await board(A, clock)).map((r) => [r.fullName, r.correct]), [['Másik Diák', 10], ['Diák diak.a1', 9]], 'the next best round steps in');
  assert.equal(((await studentA.call('GET', `/api/record?topicId=${topic.id}`)).data['record'] as { correct: number }).correct, 9);
  await A.call('POST', `/api/report/attempts/${best}/leaderboard`, { excluded: false });
  assert.equal((await board(A, clock))[0]!.correct, 11, 'exclusion is reversible');

  await A.call('DELETE', `/api/report/attempts/${best}`, { reason: 'Rossz diák játszott' });
  assert.deepEqual((await board(A, clock)).map((r) => r.correct), [10, 9]);
  void second;

  await A.call('PATCH', `/api/students/${sA1.id}`, { status: 'archived' });
  assert.deepEqual((await board(A, clock)).map((r) => r.fullName), ['Másik Diák']);
  await A.call('PATCH', `/api/students/${sA1.id}`, { status: 'active' });

  assert.equal((await A.call('POST', '/api/leaderboard/periods', { topicId: topic.id })).data['error'], 'confirmation_required');
  assert.equal((await A.call('POST', '/api/leaderboard/periods', { topicId: topic.id, confirm: true })).status, 200);
  assert.deepEqual(await board(A, clock), [], 'a new period starts empty');
  const studentA2 = new Browser(env, clock, '10.4.4.4'); await studentA2.login('diak.a1', 'diak.a1-password');
  assert.equal((await studentA2.call('GET', `/api/record?topicId=${topic.id}`)).data['record'], null);
  await play(studentA2, clock, { wrong: 4 });
  assert.deepEqual((await board(A, clock)).map((r) => r.correct), [7]);
  // The teacher's history keeps every round (deleted ones excluded from the default list).
  clock.now += 11_000;
  assert.equal(((await A.call('GET', '/api/report')).data['attempts'] as unknown[]).length, 3);
});

test('F5-04/F5-07: own teacher’s circle only; 60 s limit per account across sessions', async () => {
  const { env, clock, A, B, studentA } = await seed();
  await play(studentA, clock);
  const b1 = new Browser(env, clock, '10.5.5.5'); await b1.login('diak.b1', 'diak.b1-password');
  assert.deepEqual(await board(b1, clock), [], 'B’s student sees B’s (empty) board');
  assert.equal((await b1.call('GET', `/api/leaderboard?topicId=${topic.id}&teacherId=${'0'.repeat(36)}`)).status, 429, 'within 60 s');
  assert.deepEqual(await board(B, clock), []);
  clock.now += 61_000;
  const own = await b1.call('GET', `/api/leaderboard?topicId=${topic.id}&teacherId=whatever`);
  assert.deepEqual(own.data['rows'], [], 'a student cannot pick another teacher');

  // Same account in a second browser: still limited.
  assert.equal((await board(studentA, clock)).length, 1);
  const tab2 = new Browser(env, clock, '10.6.6.6'); await tab2.login('diak.a1', 'diak.a1-password');
  const limited = await tab2.call('GET', `/api/leaderboard?topicId=${topic.id}`);
  assert.equal(limited.status, 429); assert.ok((limited.data['retryAfterSeconds'] as number) > 0);
  assert.equal((await studentA.call('GET', '/api/leaderboard?topicId=nope')).status, 404);
  assert.equal((await A.call('GET', `/api/record?topicId=${topic.id}`)).status, 403);
  assert.equal((await A.call('POST', '/api/leaderboard/periods', { topicId: topic.id, confirm: true, teacherId: 'x' })).status, 200, 'teacher scope comes from the session');
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM lb_periods WHERE teacher_id = (SELECT id FROM users WHERE login = ?)').get('tanar.a')!['n'], 1);
});
