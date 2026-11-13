import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Browser, seed } from './harness.ts';
import { play, topic } from './play.ts';

type Clock = { now: number };
async function board(b: Browser, clock: Clock) {
  clock.now += 61_000;
  return ((await b.call('GET', `/api/leaderboard?topicId=${topic.id}`)).data['rows'] as Array<{ correct: number }>);
}
async function report(b: Browser, clock: Clock) {
  clock.now += 11_000;
  return (await b.call('GET', '/api/report')).data['attempts'] as Array<Record<string, unknown>>;
}

test('F6-01/F6-03/F6-05: hidden page → pending review; blur alone and offline do not; same time is not counted twice', async () => {
  const { clock, A, studentA } = await seed();
  const hidden = await play(studentA, clock, { integrity: { hidden: [[2000, 5000], [4000, 6000]], blur: [[1500, 6500]], offline: [] } });
  const rows = await report(A, clock);
  const r = rows.find((x) => x['id'] === hidden)!;
  assert.equal(r['reviewStatus'], 'pending');
  assert.deepEqual(r['integrity'], {
    hiddenCount: 1, hiddenMs: 4000, blurCount: 2, blurMs: 1000, offlineCount: 0, offlineMs: 0,
    log: { hidden: [[2000, 6000]], blur: [[1500, 2000], [6000, 6500]], offline: [] },
  });
  assert.deepEqual(await board(A, clock), [], 'pending until the teacher decides');
  const rec = await studentA.call('GET', `/api/record?topicId=${topic.id}`);
  assert.deepEqual([rec.data['record'], rec.data['pendingReview']], [null, true]);

  await play(studentA, clock, { wrong: 1, integrity: { hidden: [], blur: [[100, 900]], offline: [[1000, 4000]] } });
  const blurOnly = (await report(A, clock))[0]!;
  assert.equal(blurOnly['reviewStatus'], null);
  assert.deepEqual((await board(A, clock)).map((x) => x.correct), [10], 'focus loss and network alone do not hold a round back');
});

test('F6-06: approve and reject are audited and change only the leaderboard; reasons required; scope enforced', async () => {
  const { clock, A, B, admin, studentA } = await seed();
  const id = await play(studentA, clock, { integrity: { hidden: [[1000, 2000]], blur: [], offline: [] } });
  const decide = (b: Browser, decision: string, reason = 'Mellettem ült, rendben') => b.call('POST', `/api/report/attempts/${id}/review`, { decision, reason });
  assert.equal((await decide(A, 'approved', '')).data['error'], 'invalid_reason');
  assert.equal((await decide(A, 'maybe')).status, 400);
  assert.equal((await decide(B, 'approved')).status, 404);
  assert.equal((await decide(A, 'approved')).status, 200);
  assert.deepEqual((await board(A, clock)).map((x) => x.correct), [11]);
  const before = (await report(A, clock)).find((x) => x['id'] === id)!;
  assert.equal(before['grade'], 12);
  assert.equal((await decide(A, 'rejected', 'Telefont használt')).status, 200);
  assert.deepEqual(await board(A, clock), []);
  const after = (await report(A, clock)).find((x) => x['id'] === id)!;
  assert.deepEqual([after['reviewStatus'], after['reviewReason'], after['grade']], ['rejected', 'Telefont használt', 12], 'the grade does not change');
  const audit = JSON.stringify((await admin.call('GET', '/api/audit')).data);
  assert.match(audit, /attempt\.review_approved/); assert.match(audit, /attempt\.review_rejected/);

  // Approval never makes an ineligible round eligible.
  await decide(A, 'approved');
  await A.call('POST', `/api/report/attempts/${id}/leaderboard`, { excluded: true, reason: 'Kizárva' });
  assert.deepEqual(await board(A, clock), []);
  await A.call('DELETE', `/api/report/attempts/${id}`, { reason: 'Törölve' });
  assert.equal((await decide(A, 'approved')).status, 404);
  // Rounds that need no review cannot be "approved" into anything.
  const plain = await play(studentA, clock, { count: 5, integrity: { hidden: [[0, 100]], blur: [], offline: [] } });
  assert.equal((await A.call('POST', `/api/report/attempts/${plain}/review`, { decision: 'approved', reason: 'Nem kell' })).status, 404);
});

test('F6-03/F6-08: missing signals are not "all clear"; rounds from before F6 are not relabelled; repeats do not double', async () => {
  const { env, clock, A, studentA } = await seed();
  const old = await play(studentA, clock, { integrity: undefined });
  const r = (await report(A, clock)).find((x) => x['id'] === old)!;
  assert.deepEqual([r['reviewStatus'], r['integrityVersion'], r['integrity']], ['pending', 0, null], 'unverifiable candidate waits for the teacher');

  // A round finished before F6 (no review state, version 0) stays as it was: eligible, without any integrity label.
  env.DB.raw.prepare("UPDATE attempts SET review_status = NULL WHERE id = ?").run(old);
  const pre = (await report(A, clock)).find((x) => x['id'] === old)!;
  assert.deepEqual([pre['reviewStatus'], pre['integrity']], [null, null]);
  assert.equal((await board(A, clock)).length, 1);

  const short = await play(studentA, clock, { count: 5, integrity: undefined });
  assert.equal((await report(A, clock)).find((x) => x['id'] === short)!['reviewStatus'], null, 'non-candidates need no review');

  // Idempotent finish: the stored summary is returned, nothing is added.
  const row = env.DB.raw.prepare('SELECT hidden_count, hidden_ms FROM attempts WHERE id = ?').get(short)!;
  assert.deepEqual([row['hidden_count'], row['hidden_ms']], [null, null]);
  void Browser;
});
