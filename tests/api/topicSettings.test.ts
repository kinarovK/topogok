import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TOPICS } from '../../src/data/topicRegistry.ts';
import { TOPIC_FEATURES } from '../../server/topics.generated.ts';
import { seed } from './harness.ts';

const topic = TOPICS.find((t) => t.id === 'ukraine-administration')!;
const ids = TOPIC_FEATURES[topic.id]![topic.dataVersion]!;
const base = { topicId: topic.id, dataVersion: topic.dataVersion, mode: 'assessment', timeLimitMinutes: null };

test('F4-01/F4-03/F4-06: save, validation and conflict detection', async () => {
  const { A, B, admin, tA, studentA } = await seed();
  assert.deepEqual((await A.call('GET', '/api/topic-settings')).data['settings'], {});
  const put = (b: typeof A, body: Record<string, unknown>) => b.call('PUT', `/api/topic-settings/${topic.id}`, body);
  assert.equal((await put(A, { disabled: ids, baseVersion: 0 })).data['error'], 'nothing_enabled');
  assert.equal((await put(A, { disabled: ['XX-nope'], baseVersion: 0 })).data['error'], 'unknown_feature');
  assert.equal((await A.call('PUT', '/api/topic-settings/no-such-topic', { disabled: [], baseVersion: 0 })).status, 404);
  const ok = await put(A, { disabled: ids.slice(2), baseVersion: 0 });
  assert.deepEqual((ok.data['setting'] as { version: number }).version, 1);
  // A second editor still on version 0 must not overwrite silently.
  const stale = await put(A, { disabled: [], baseVersion: 0 });
  assert.equal(stale.status, 409);
  assert.equal(((stale.data['setting'] as { disabled: string[] }).disabled).length, ids.length - 2);
  assert.equal((await put(A, { disabled: ids.slice(3), baseVersion: 1 })).status, 200);
  // Scope: B and students cannot read or write A's settings; the superadmin can with an explicit teacher.
  assert.deepEqual((await B.call('GET', '/api/topic-settings')).data['settings'], {});
  assert.equal((await put(studentA, { disabled: [], baseVersion: 2 })).status, 403);
  assert.equal(((await admin.call('GET', `/api/topic-settings?teacherId=${tA.id}`)).data['settings'] as Record<string, { version: number }>)[topic.id]!.version, 2);
  assert.equal((await admin.call('PUT', `/api/topic-settings/${topic.id}`, { teacherId: tA.id, disabled: [], baseVersion: 2 })).status, 200);
});

test('F4-02/F4-07/F4-09: students get their own teacher’s set; the server draws from it and marks the round restricted', async () => {
  const { env, clock, A, studentA } = await seed();
  await A.call('PUT', `/api/topic-settings/${topic.id}`, { disabled: ids.slice(8), baseVersion: 0 });
  const me = (await studentA.call('GET', '/api/me')).data['user'] as { topicSettings: Record<string, { disabled: string[]; version: number }> };
  assert.equal(me.topicSettings[topic.id]!.version, 1);
  assert.equal(me.topicSettings[topic.id]!.disabled.length, ids.length - 8);

  // Stale client version → the round cannot be saved; the response carries the current set.
  const stale = await studentA.call('POST', '/api/attempts', { ...base, count: 'all', seed: 5, settingsVersion: 0 });
  assert.equal(stale.status, 409); assert.equal(stale.data['error'], 'settings_changed');
  // 12 questions are impossible with 8 enabled (F4-04), "all" is fine.
  assert.equal((await studentA.call('POST', '/api/attempts', { ...base, count: 12, seed: 5, settingsVersion: 1 })).status, 400);
  const r = await studentA.call('POST', '/api/attempts', { ...base, count: 'all', seed: 5, settingsVersion: 1 });
  assert.equal(r.status, 201);
  const row = env.DB.raw.prepare('SELECT * FROM attempts WHERE id = ?').get(r.data['attemptId'] as string)!;
  const qs = JSON.parse(String(row['question_ids'])) as string[];
  assert.deepEqual([...qs].sort(), [...ids.slice(0, 8)].sort(), 'only enabled features are asked');
  assert.deepEqual([row['is_full'], row['restricted'], row['settings_version']], [1, 1, 1]);

  // A teacher change during the round does not touch it: the replay uses the set from the start (F4-06).
  await A.call('PUT', `/api/topic-settings/${topic.id}`, { disabled: [], baseVersion: 1 });
  const { reduce, startGame, currentFeatureId } = await import('../../src/domain/game.ts');
  let s = startGame({ mode: 'assessment', topicId: topic.id, count: 'all', timeLimitMinutes: null }, ids.slice(0, 8), 5);
  const events: Record<string, unknown>[] = [];
  let t = 0;
  while (s.phase !== 'finished') {
    const f = currentFeatureId(s)!; t += 1000;
    s = reduce(s, { type: 'SELECT', featureId: f, elapsedMs: t }); events.push({ type: 'SELECT', f, t });
    s = reduce(s, { type: 'CONFIRM', elapsedMs: t + 100 }); events.push({ type: 'CONFIRM', t: t + 100 });
  }
  clock.now += t + 1000;
  const fin = await studentA.call('POST', `/api/attempts/${r.data['attemptId']}/finish`, { reason: 'completed', events });
  assert.deepEqual([(fin.data['result'] as Record<string, unknown>)['status'], (fin.data['result'] as Record<string, unknown>)['percent']], ['finished', 100]);

  // A click on a disabled area is not a legal event on the server either (F4-05).
  await A.call('PUT', `/api/topic-settings/${topic.id}`, { disabled: ids.slice(8), baseVersion: 2 });
  const r2 = await studentA.call('POST', '/api/attempts', { ...base, count: 'all', seed: 6, settingsVersion: 3 });
  clock.now += 60_000;
  const bad = await studentA.call('POST', `/api/attempts/${r2.data['attemptId']}/finish`, { reason: 'completed', events: [{ type: 'SELECT', f: ids[20], t: 10 }] });
  assert.equal((bad.data['result'] as Record<string, unknown>)['status'], 'invalid');
});

test('F4-02: another teacher’s students keep the full map', async () => {
  const { env, A, B } = await seed();
  await A.call('PUT', `/api/topic-settings/${topic.id}`, { disabled: ids.slice(1), baseVersion: 0 });
  const { Browser } = await import('./harness.ts');
  const b1 = new Browser(env, { now: Date.now() }, '10.1.1.1');
  assert.equal((await b1.login('diak.b1', 'diak.b1-password')).status, 200);
  const me = (await b1.call('GET', '/api/me')).data['user'] as { topicSettings: Record<string, unknown> };
  assert.deepEqual(me.topicSettings, {});
  assert.equal((await b1.call('POST', '/api/attempts', { ...base, count: 12, seed: 1 })).status, 201);
  void B;
});
