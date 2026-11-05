import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canConfirm, currentFeatureId, progress, reduce, selectQuestions, startGame } from '../../src/domain/game.ts';
import { assessmentResult, grade, practiceResult } from '../../src/domain/scoring.ts';
import { createClock, formatDuration, formatRemaining } from '../../src/domain/clock.ts';
import { validateConfig } from '../../src/domain/config.ts';
import { createRng, shuffle } from '../../src/domain/random.ts';
import type { AssessmentState, GameState, PracticeState } from '../../src/domain/types.ts';

const IDS = ['UA-05', 'UA-07', 'UA-09', 'UA-12', 'UA-14', 'UA-18', 'UA-21', 'UA-23', 'UA-26', 'UA-30', 'UA-32', 'UA-35', 'UA-40', 'UA-43',
  'UA-46', 'UA-48', 'UA-51', 'UA-53', 'UA-56', 'UA-59', 'UA-61', 'UA-63', 'UA-65', 'UA-68', 'UA-71', 'UA-74', 'UA-77'];
const P = (count: 5 | 12 | 'all' = 5) => ({ mode: 'practice' as const, topicId: 't', count, showElapsed: false });
const A = (count: 5 | 12 | 'all' = 5, timeLimitMinutes: null | 5 | 10 | 15 | 20 = null) => ({ mode: 'assessment' as const, topicId: 't', count, timeLimitMinutes });

function wrongFor(s: GameState): string {
  const target = currentFeatureId(s)!;
  const tried = s.mode === 'practice' ? (s.stage === 'base' ? s.base : s.review)[s.index]!.wrongIds : [];
  return IDS.find((id) => id !== target && !tried.includes(id))!;
}
function answer(s: GameState, id: string, t = 0): GameState {
  return reduce(reduce(s, { type: 'SELECT', featureId: id, elapsedMs: t }), { type: 'CONFIRM', elapsedMs: t });
}
const right = (s: GameState, t = 0) => answer(s, currentFeatureId(s)!, t);
const wrong = (s: GameState, t = 0) => answer(s, wrongFor(s), t);
const next = (s: GameState, t = 0) => reduce(s, { type: 'NEXT', elapsedMs: t });

// T01
test('T01 question selection: 5/12/all give 5/12/27 unique IDs, deterministic for a seed', () => {
  for (const [count, n] of [[5, 5], [12, 12], ['all', 27]] as const) {
    const q = selectQuestions(IDS, count, createRng(42));
    assert.equal(q.length, n);
    assert.equal(new Set(q).size, n);
    assert.ok(q.every((id) => IDS.includes(id)));
    assert.deepEqual(q, selectQuestions(IDS, count, createRng(42)));
  }
  assert.notDeepEqual(selectQuestions(IDS, 'all', createRng(1)), selectQuestions(IDS, 'all', createRng(2)));
});

test('T01 shuffle is unbiased enough: every ID appears in first position', () => {
  const rng = createRng(7);
  const counts = new Map<string, number>();
  for (let i = 0; i < 27000; i++) { const f = shuffle(IDS, rng)[0]!; counts.set(f, (counts.get(f) ?? 0) + 1); }
  assert.equal(counts.size, 27);
  for (const c of counts.values()) assert.ok(c > 800 && c < 1200, `count ${c}`);
});

test('T01 invalid configurations are rejected', () => {
  assert.ok(validateConfig(P()));
  assert.ok(validateConfig(A(12, 10)));
  assert.equal(validateConfig({ ...P(), count: 7 }), null);
  assert.equal(validateConfig({ ...A(), timeLimitMinutes: 3 }), null);
  assert.equal(validateConfig({ ...P(), timeLimitMinutes: 5 }), null);
  assert.equal(validateConfig({ ...A(), showElapsed: true }), null);
  assert.equal(validateConfig({ mode: 'exam', topicId: 't', count: 5 }), null);
  assert.equal(validateConfig(null), null);
});

// T02
test('T02 practice points 100/60/30 and 0 after three misses or reveal', () => {
  let s = startGame(P(5), IDS, 3);
  s = next(right(s));
  s = next(right(wrong(s)));
  s = next(right(wrong(wrong(s))));
  s = wrong(wrong(wrong(s)));
  assert.equal(s.phase, 'feedback');
  s = next(s);
  s = reduce(s, { type: 'REVEAL', elapsedMs: 0 });
  const p = s as PracticeState;
  assert.deepEqual(p.base.map((t) => t.points), [100, 60, 30, 0, 0]);
  assert.deepEqual(p.base.map((t) => t.outcome), ['correct', 'correct', 'correct', 'failed', 'revealed']);
});

// T03
test('T03 first two misses keep the task open and hide the answer; re-confirming a wrong ID costs nothing', () => {
  let s = startGame(P(5), IDS, 4) as PracticeState;
  const bad = wrongFor(s);
  s = answer(s, bad) as PracticeState;
  assert.equal(s.phase, 'answering');
  assert.equal(s.selection, null);
  assert.deepEqual(s.base[0]!.wrongIds, [bad]);
  assert.equal(s.base[0]!.outcome, null);
  const again = answer(s, bad) as PracticeState;
  assert.deepEqual(again.base[0]!.wrongIds, [bad], 'same wrong ID is not a new attempt');
  assert.equal(canConfirm(reduce(s, { type: 'SELECT', featureId: bad, elapsedMs: 0 })), false);
  s = wrong(s) as PracticeState;
  assert.equal(s.phase, 'answering');
  assert.equal(s.base[0]!.wrongIds.length, 2);
  s = wrong(s) as PracticeState;
  assert.equal(s.phase, 'feedback');
  assert.equal(s.base[0]!.outcome, 'failed');
});

test('T03 double confirm and confirm without selection never add attempts', () => {
  let s = startGame(P(5), IDS, 5);
  s = reduce(s, { type: 'CONFIRM', elapsedMs: 0 });
  assert.equal((s as PracticeState).base[0]!.wrongIds.length, 0);
  s = reduce(s, { type: 'SELECT', featureId: currentFeatureId(s)!, elapsedMs: 0 });
  s = reduce(s, { type: 'CONFIRM', elapsedMs: 0 });
  const once = s;
  s = reduce(s, { type: 'CONFIRM', elapsedMs: 0 });
  assert.equal(s, once);
  assert.equal((s as PracticeState).base[0]!.points, 100);
});

// T04
test('T04 3 first-try + 1 second-try + 1 revealed = 360/500, 3/5 first try, 2 to review; review does not change it', () => {
  let s = startGame(P(5), IDS, 9);
  s = next(right(s, 1000));
  s = next(right(s, 2000));
  s = next(right(s, 3000));
  s = next(right(wrong(s, 3500), 4000));
  s = reduce(s, { type: 'REVEAL', elapsedMs: 5000 });
  s = next(s, 5100) as PracticeState;
  assert.equal(s.stage, 'review');
  assert.equal(s.review.length, 2);
  assert.equal(new Set(s.review.map((t) => t.featureId)).size, 2);
  assert.deepEqual(progress(s), { position: 1, total: 2, stage: 'review' });
  s = next(wrong(wrong(wrong(s, 6000), 6100), 6200), 6300);
  s = next(right(s, 7000), 9999) as PracticeState;
  assert.equal(s.phase, 'finished');
  const r = practiceResult(s);
  assert.equal(r.points, 360);
  assert.equal(r.maxPoints, 500);
  assert.equal(r.firstTryCorrect, 3);
  assert.equal(r.percent, 60);
  assert.equal(r.durationMs, 7000, 'duration ends at the last closed task, not at NEXT');
});

// T05
test('T05 every missed task repeats exactly once; no third round; error-free round goes straight to results', () => {
  let s = startGame(P(5), IDS, 11);
  for (let i = 0; i < 5; i++) s = next(wrong(wrong(wrong(s))));
  assert.equal((s as PracticeState).stage, 'review');
  assert.equal((s as PracticeState).review.length, 5);
  for (let i = 0; i < 5; i++) s = next(wrong(wrong(wrong(s))));
  assert.equal(s.phase, 'finished');
  assert.equal(practiceResult(s as PracticeState).points, 0);

  let ok = startGame(P(5), IDS, 12);
  for (let i = 0; i < 5; i++) ok = next(right(ok));
  assert.equal(ok.phase, 'finished');
  assert.equal((ok as PracticeState).review.length, 0);
  assert.equal(practiceResult(ok as PracticeState).points, 500);
});

// T06
test('T06 assessment: selection changeable before confirm; confirm advances; no way back; same shape for right and wrong', () => {
  let s = startGame(A(5), IDS, 13) as AssessmentState;
  const first = currentFeatureId(s)!;
  s = reduce(s, { type: 'SELECT', featureId: 'UA-05', elapsedMs: 0 }) as AssessmentState;
  s = reduce(s, { type: 'SELECT', featureId: first, elapsedMs: 0 }) as AssessmentState;
  assert.equal(s.selection, first);
  const afterRight = reduce(s, { type: 'CONFIRM', elapsedMs: 0 }) as AssessmentState;
  const afterWrong = reduce(reduce(s, { type: 'SELECT', featureId: wrongFor(s), elapsedMs: 0 }), { type: 'CONFIRM', elapsedMs: 0 }) as AssessmentState;
  for (const x of [afterRight, afterWrong]) {
    assert.equal(x.index, 1);
    assert.equal(x.selection, null);
    assert.equal(x.phase, 'answering');
  }
  assert.deepEqual(Object.keys(afterRight).sort(), Object.keys(afterWrong).sort());
  assert.equal(reduce(afterRight, { type: 'REVEAL', elapsedMs: 0 }), afterRight, 'no reveal in assessment');
  assert.equal(reduce(afterRight, { type: 'NEXT', elapsedMs: 0 }), afterRight, 'no skip in assessment');
});

// T07
test('T07 grade table incl. 26/27 -> 12', () => {
  const table: Array<[number, number, number]> = [[0, 12, 1], [1, 12, 1], [9, 12, 9], [12, 12, 12], [1, 5, 3], [4, 5, 10], [1, 27, 1], [26, 27, 12], [0, 5, 1], [5, 5, 12], [0, 27, 1], [27, 27, 12]];
  for (const [c, t, g] of table) assert.equal(grade(c, t), g, `${c}/${t}`);
  for (let t = 1; t <= 27; t++) for (let c = 0; c <= t; c++) assert.equal(grade(c, t), Math.max(1, Math.ceil((12 * c) / t)));
  assert.throws(() => grade(6, 5));
  assert.throws(() => grade(1, 0));
  assert.throws(() => grade(-1, 5));
  assert.throws(() => grade(1.5, 5));
});

test('T07 full assessment result: completed 26/27 -> 96.3%, grade 12', () => {
  let s = startGame(A('all'), IDS, 21);
  s = wrong(s, 100);
  for (let i = 1; i < 27; i++) s = right(s, 100 + i);
  assert.equal(s.phase, 'finished');
  const r = assessmentResult(s as AssessmentState);
  assert.equal(r.total, 27);
  assert.equal(r.correct, 26);
  assert.equal(r.grade, 12);
  assert.equal(Math.round(r.percent * 10) / 10, 96.3);
  assert.equal(r.finishReason, 'completed');
  assert.equal(r.durationMs, 126);
});

// T08
test('T08 timeout: selected but unconfirmed and remaining answers count as wrong; denominator stays N', () => {
  let s = startGame(A(12, 5), IDS, 22);
  s = right(s, 1000);
  s = right(s, 2000);
  s = reduce(s, { type: 'SELECT', featureId: currentFeatureId(s)!, elapsedMs: 3000 });
  s = reduce(s, { type: 'TIME_CHECK', elapsedMs: 300_000 });
  assert.equal(s.phase, 'finished');
  const r = assessmentResult(s as AssessmentState);
  assert.equal(r.total, 12);
  assert.equal(r.correct, 2);
  assert.equal(r.grade, 2);
  assert.equal(r.finishReason, 'timeout');
  assert.equal(r.durationMs, 300_000, 'duration is exactly the limit');
});

// T09
test('T09 confirm exactly at the deadline is a timeout; late events after closing change nothing', () => {
  let s = startGame(A(5, 5), IDS, 23);
  s = reduce(s, { type: 'SELECT', featureId: currentFeatureId(s)!, elapsedMs: 299_999 });
  const atLimit = reduce(s, { type: 'CONFIRM', elapsedMs: 300_000 }) as AssessmentState;
  assert.equal(atLimit.phase, 'finished');
  assert.equal(atLimit.finishReason, 'timeout');
  assert.equal(assessmentResult(atLimit).correct, 0);
  const justBefore = reduce(s, { type: 'CONFIRM', elapsedMs: 299_999 }) as AssessmentState;
  assert.equal(justBefore.phase, 'answering');
  assert.equal(justBefore.answers[0]!.selectedId, justBefore.answers[0]!.featureId);
  for (const e of [{ type: 'CONFIRM', elapsedMs: 300_001 }, { type: 'TIME_CHECK', elapsedMs: 900_000 }, { type: 'SELECT', featureId: 'UA-05', elapsedMs: 1 }] as const) {
    assert.equal(reduce(atLimit, e), atLimit);
  }
});

test('T09 final answer then timeout: closes once as completed; timeout then final answer: closes once as timeout', () => {
  let s = startGame(A(5, 5), IDS, 24);
  for (let i = 0; i < 4; i++) s = right(s, 1000 * i);
  let a = reduce(s, { type: 'SELECT', featureId: currentFeatureId(s)!, elapsedMs: 299_000 });
  a = reduce(a, { type: 'CONFIRM', elapsedMs: 299_500 });
  const closed = a;
  a = reduce(a, { type: 'TIME_CHECK', elapsedMs: 300_000 });
  a = reduce(a, { type: 'CONFIRM', elapsedMs: 300_001 });
  assert.equal(a, closed);
  assert.equal((a as AssessmentState).finishReason, 'completed');
  assert.equal(assessmentResult(a as AssessmentState).correct, 5);

  let b = reduce(s, { type: 'SELECT', featureId: currentFeatureId(s)!, elapsedMs: 299_000 });
  b = reduce(b, { type: 'TIME_CHECK', elapsedMs: 300_000 });
  const closedB = b;
  b = reduce(b, { type: 'CONFIRM', elapsedMs: 300_000 });
  assert.equal(b, closedB);
  assert.equal((b as AssessmentState).finishReason, 'timeout');
  assert.equal(assessmentResult(b as AssessmentState).correct, 4);
});

// T10
test('T10 clock: background time counts; wall clock set back never decreases elapsed; forward jump counts', () => {
  let wall = 1_000_000;
  let mono = 50;
  const clock = createClock({ wallNow: () => wall, monoNow: () => mono });
  wall += 1000; mono += 1000;
  assert.equal(clock.elapsed(), 1000);
  wall += 120_000; // device asleep: monotonic paused, wall advanced
  assert.equal(clock.elapsed(), 121_000);
  wall -= 3_600_000; mono += 500; // wall clock set back an hour
  assert.equal(clock.elapsed(), 121_000, 'never goes backwards');
  mono += 200_000;
  assert.equal(clock.elapsed(), 201_500);
  wall += 10_000_000; // wall clock forward: documented early expiry
  assert.ok(clock.elapsed() > 6_000_000);
});

test('T10 background return: a TIME_CHECK long after the limit closes with duration = limit', () => {
  let s = startGame(A(5, 10), IDS, 25);
  s = right(s, 10_000);
  s = reduce(s, { type: 'TIME_CHECK', elapsedMs: 3_600_000 });
  const r = assessmentResult(s as AssessmentState);
  assert.equal(r.durationMs, 600_000);
  assert.equal(r.correct, 1);
  assert.equal(r.total, 5);
});

test('time formatting: countdown rounds up, results round down, hours shown when needed', () => {
  assert.equal(formatRemaining(299_001), '05:00');
  assert.equal(formatRemaining(1), '00:01');
  assert.equal(formatRemaining(0), '00:00');
  assert.equal(formatDuration(59_999), '00:59');
  assert.equal(formatDuration(3_725_000), '1:02:05');
});

test('practice ignores TIME_CHECK and has no deadline', () => {
  const s = startGame(P(5), IDS, 26);
  assert.equal(reduce(s, { type: 'TIME_CHECK', elapsedMs: 99_999_999 }), s);
});
