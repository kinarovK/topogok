import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TOPICS } from '../../src/data/topicRegistry.ts';
import { canConfirm, currentFeatureId, reduce, startGame } from '../../src/domain/game.ts';
import type { GameConfiguration, GameState } from '../../src/domain/types.ts';
import { TOPIC_FEATURES } from '../../server/topics.generated.ts';
import { Browser, seed } from './harness.ts';

const topic = TOPICS.find((t) => t.id === 'ukraine-administration')!;
const ids = TOPIC_FEATURES[topic.id]![topic.dataVersion]!;
type Wire = { type: string; t: number; f?: string };

/** Plays a round like the browser would and returns the wire events. `wrongFirst` answers each question wrong once. */
function play(config: GameConfiguration, seedValue: number, opts: { wrongFirst?: boolean; step?: number; stopAt?: number } = {}) {
  let s: GameState = startGame(config, ids, seedValue);
  const events: Wire[] = [];
  let t = 0;
  const send = (e: Wire) => {
    const next = reduce(s, e.type === 'SELECT' ? { type: 'SELECT', featureId: e.f!, elapsedMs: e.t } : { type: e.type as 'CONFIRM', elapsedMs: e.t });
    if (next !== s) { events.push(e); s = next; }
  };
  let guard = 0;
  while (s.phase !== 'finished' && guard++ < 500) {
    if (opts.stopAt !== undefined && events.length >= opts.stopAt) break;
    t += opts.step ?? 1500;
    if (s.mode === 'practice' && s.phase === 'feedback') { send({ type: 'NEXT', t }); continue; }
    const target = currentFeatureId(s)!;
    const wrong = ids.find((x) => x !== target)!;
    const answeredWrong = s.mode === 'practice' && (s.stage === 'review' || (s.base[s.index]?.wrongIds.length ?? 0) > 0);
    send({ type: 'SELECT', f: opts.wrongFirst && !answeredWrong ? wrong : target, t });
    if (canConfirm(s)) send({ type: 'CONFIRM', t: t + 200 });
  }
  return { events, state: s, lastT: t + 200 };
}

const practice = (count: 5 | 12 | 'all' = 5) => ({ topicId: topic.id, dataVersion: topic.dataVersion, mode: 'practice', count, showElapsed: false });
const assessment = (count: 5 | 12 | 'all' = 5, timeLimitMinutes: number | null = null) => ({ topicId: topic.id, dataVersion: topic.dataVersion, mode: 'assessment', count, timeLimitMinutes });

async function start(b: Browser, body: Record<string, unknown>, seedValue = 1234) {
  const r = await b.call('POST', '/api/attempts', { ...body, seed: seedValue });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data['attemptId'] as string;
}

test('F3-01/F3-04: a full practice round is replayed on the server; the stored result matches the browser', async () => {
  const { env, clock, studentA, A } = await seed();
  const id = await start(studentA, practice(5));
  const { events, lastT } = play({ mode: 'practice', topicId: topic.id, count: 5, showElapsed: false }, 1234, { wrongFirst: true });
  clock.now += lastT + 1000;
  const r = await studentA.call('POST', `/api/attempts/${id}/finish`, { reason: 'completed', events, visibleMs: lastT - 3000 });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const res = r.data['result'] as Record<string, number | string>;
  assert.deepEqual([res['status'], res['points'], res['maxPoints'], res['correct'], res['total'], res['percent']], ['finished', 300, 500, 0, 5, 0]);
  const row = env.DB.raw.prepare('SELECT * FROM attempts WHERE id = ?').get(id)!;
  assert.equal(row['is_full'], 0);
  assert.equal(Object.keys(row).some((k) => /event|answer|wrong/.test(k)), false, 'no per-question data is stored');
  const rep = await A.call('GET', '/api/report');
  const list = rep.data['attempts'] as Record<string, unknown>[];
  assert.equal(list.length, 1);
  assert.equal(list[0]!['status'], 'finished');
});

test('F3-04: finish is idempotent; a different second finish is rejected', async () => {
  const { clock, studentA } = await seed();
  const id = await start(studentA, assessment(5));
  const { events, lastT } = play({ mode: 'assessment', topicId: topic.id, count: 5, timeLimitMinutes: null }, 1234);
  clock.now += lastT + 500;
  const first = await studentA.call('POST', `/api/attempts/${id}/finish`, { reason: 'completed', events, visibleMs: lastT });
  const again = await studentA.call('POST', `/api/attempts/${id}/finish`, { reason: 'completed', events, visibleMs: lastT });
  assert.equal(again.status, 200); assert.equal(again.data['repeated'], true);
  assert.deepEqual(again.data['result'], first.data['result']);
  assert.deepEqual([(first.data['result'] as Record<string, unknown>)['grade'], (first.data['result'] as Record<string, unknown>)['percent']], [12, 100]);
  const other = await studentA.call('POST', `/api/attempts/${id}/finish`, { reason: 'quit' });
  assert.equal(other.status, 409);
});

test('forged results are not accepted: illegal events, unknown features, too-fast rounds, unfinished rounds', async () => {
  const { clock, studentA } = await seed();
  const cfg = { mode: 'assessment', topicId: topic.id, count: 5, timeLimitMinutes: null } as const;
  const { events, lastT } = play(cfg, 1234);
  const cases: [string, Wire[], number][] = [
    ['illegal_event', [{ type: 'CONFIRM', t: 10 }, ...events], lastT + 1000],
    ['unknown_feature', [{ type: 'SELECT', f: 'XX-nope', t: 10 }, ...events], lastT + 1000],
    ['time_backwards', [...events.slice(0, 2), { type: 'SELECT', f: ids[0]!, t: 1 }, ...events.slice(2)], lastT + 1000],
    ['not_finished', events.slice(0, 4), lastT + 1000],
    ['time_inconsistent', events, 1000], // claims ~8 s of play 1 s after the start
  ];
  for (const [reason, evs, wait] of cases) {
    const id = await start(studentA, assessment(5));
    clock.now += wait;
    const r = await studentA.call('POST', `/api/attempts/${id}/finish`, { reason: 'completed', events: evs });
    const res = r.data['result'] as Record<string, unknown>;
    assert.equal(res['status'], 'invalid', reason);
    assert.equal(res['percent'], null, reason);
  }
  const bad = await studentA.call('POST', '/api/attempts', { ...assessment(5), seed: -1 });
  assert.equal(bad.status, 400);
  const wrongVersion = await studentA.call('POST', '/api/attempts', { ...assessment(5), dataVersion: '1999.01.01.1', seed: 1 });
  assert.equal(wrongVersion.data['error'], 'unknown_topic');
});

test('assessment deadline: replay ends at the limit; late finishes are flagged', async () => {
  const { clock, studentA } = await seed();
  const id = await start(studentA, assessment('all', 5));
  const cfg = { mode: 'assessment', topicId: topic.id, count: 'all', timeLimitMinutes: 5 } as const;
  const partial = play(cfg, 1234, { step: 20_000, stopAt: 20 }).events; // 10 answers in ~200 s
  const events = [...partial, { type: 'TIME_CHECK', t: 300_000 }];
  clock.now += 40 * 60_000; // finished after a long outage
  const r = await studentA.call('POST', `/api/attempts/${id}/finish`, { reason: 'completed', events });
  const res = r.data['result'] as Record<string, unknown>;
  assert.deepEqual([res['status'], res['durationMs'], res['total'], res['correct']], ['expired', 300_000, 27, 10]);
  const { env } = studentA as unknown as { env: { DB: { raw: { prepare(q: string): { get(...a: unknown[]): Record<string, unknown> } } } } };
  assert.equal(env.DB.raw.prepare('SELECT late_finish FROM attempts WHERE id = ?').get(id)['late_finish'], 1);
});

test('F3-02/F3-07: a new start abandons the open round; open rounds count as abandoned after 6 h; best only from full rounds', async () => {
  const { clock, studentA, A, sA1 } = await seed();
  const open = await start(studentA, practice(5));
  const second = await start(studentA, practice(5), 99);
  assert.equal((await studentA.call('POST', `/api/attempts/${open}/finish`, { reason: 'quit' })).status, 200, 'a superseded round may still report quit');
  void second;

  // A full assessment with 100 %, then a partial one (5 questions) with 100 %: best counts only the full one.
  const fullCfg = { mode: 'assessment', topicId: topic.id, count: 'all', timeLimitMinutes: null } as const;
  const full = await start(studentA, assessment('all'), 7);
  const fp = play(fullCfg, 7, { step: 2000 });
  // Answer every second question wrong for a known percentage.
  const lowered = fp.events.map((e, i) => (e.type === 'SELECT' && i % 4 === 0 ? { ...e, f: ids.find((x) => x !== e.f)! } : e));
  clock.now += fp.lastT + 1000;
  const fr = (await studentA.call('POST', `/api/attempts/${full}/finish`, { reason: 'completed', events: lowered, visibleMs: fp.lastT })).data['result'] as Record<string, number>;
  assert.equal(fr['total'], 27); assert.ok(fr['percent']! < 100);
  const part = await start(studentA, assessment(5), 8);
  const pp = play({ mode: 'assessment', topicId: topic.id, count: 5, timeLimitMinutes: null }, 8);
  clock.now += pp.lastT + 1000;
  await studentA.call('POST', `/api/attempts/${part}/finish`, { reason: 'completed', events: pp.events });
  await start(studentA, practice(5), 9); // left open

  clock.now += 11_000;
  let rep = await A.call('GET', `/api/report?studentId=${sA1.id}&mode=assessment`);
  const sum = (rep.data['summary'] as Record<string, unknown>[])[0]!;
  assert.equal(sum['bestFullPercent'], fr['percent']);
  assert.equal(sum['started'], 2);
  assert.equal((sum['last'] as Record<string, unknown>)['percent'], 100);

  clock.now += 6 * 3_600_000 + 1;
  rep = await A.call('GET', `/api/report?studentId=${sA1.id}&mode=practice`);
  const ps = (rep.data['summary'] as Record<string, unknown>[])[0]!;
  assert.deepEqual([ps['started'], ps['abandoned'], ps['inProgress']], [3, 3, 0]);
});

test('F3-08/F3-09/F3-10: report scope, 10 s refresh limit, soft delete with reason and audit', async () => {
  const { clock, studentA, A, B, admin, tA, sA1 } = await seed();
  const id = await start(studentA, practice(5));
  assert.equal((await studentA.call('GET', '/api/report')).status, 403, 'students have no report');
  assert.equal((await B.call('GET', '/api/report')).data['attempts'] instanceof Array, true);
  assert.equal(((await B.call('GET', '/api/report')).status), 429, 'second request within 10 s');
  clock.now += 10_001;
  const bRep = await B.call('GET', '/api/report');
  assert.equal((bRep.data['attempts'] as unknown[]).length, 0, 'teacher B never sees A’s students');
  assert.equal((await B.call('GET', `/api/report?studentId=${sA1.id}`)).status, 429);
  assert.equal((await B.call('DELETE', `/api/report/attempts/${id}`, { reason: 'mistake' })).status, 404);
  assert.equal((await admin.call('GET', '/api/report')).status, 404, 'superadmin must pick a teacher');
  const adm = await admin.call('GET', `/api/report?teacherId=${tA.id}`);
  assert.equal((adm.data['attempts'] as unknown[]).length, 1);

  assert.equal((await A.call('DELETE', `/api/report/attempts/${id}`, { reason: '' })).data['error'], 'invalid_reason');
  assert.equal((await A.call('DELETE', `/api/report/attempts/${id}`, { reason: 'Rossz diák játszott' })).status, 200);
  clock.now += 10_001;
  assert.equal(((await A.call('GET', '/api/report')).data['attempts'] as unknown[]).length, 0);
  const audit = JSON.stringify((await admin.call('GET', '/api/audit')).data);
  assert.match(audit, /attempt\.delete/);
  assert.equal((await studentA.call('POST', `/api/attempts/${id}/finish`, { reason: 'quit' })).status, 409, 'deleted rounds stay closed');
});

test('a student cannot finish another student’s round; teachers cannot start rounds', async () => {
  const { env, clock, studentA, A } = await seed();
  const id = await start(studentA, practice(5));
  const other = new Browser(env, clock, '10.0.0.9');
  assert.equal((await other.login('diak.a2', 'diak.a2-password')).status, 200);
  assert.equal((await other.call('POST', `/api/attempts/${id}/finish`, { reason: 'quit' })).status, 404);
  assert.equal((await A.call('POST', '/api/attempts', { ...practice(5), seed: 1 })).status, 403);
  assert.equal((await other.call('POST', '/api/attempts/not-a-uuid/finish', { reason: 'quit' })).status, 404);
});
