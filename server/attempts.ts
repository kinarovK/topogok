// F3 (lean): one summary row per round. Start stores the seed and question order; finish replays the
// round's events with the same rules code the browser runs (src/domain) and keeps only the result.
// See docs/project/tasks/0003_ONLINE_PLATFORM/phases/F3_DESIGN.md.
import { TOPICS } from '../src/data/topicRegistry.ts';
import { limitMs } from '../src/domain/clock.ts';
import { reduce, startGame } from '../src/domain/game.ts';
import { assessmentResult, practiceResult } from '../src/domain/scoring.ts';
import type { GameConfiguration, GameEvent, GameState, QuestionCount, TimeLimitMinutes } from '../src/domain/types.ts';
import type { Ctx, Session } from './auth.ts';
import { teacherScope } from './admin.ts';
import { TOPIC_FEATURES } from './topics.generated.ts';
import { fail, json, sha256 } from './util.ts';
import { idParam } from './validate.ts';

export const RULES_VERSION = 1;
const ABANDON_AFTER = 6 * 3_600_000;
const WALL_TOLERANCE = 5_000;
const DEADLINE_GRACE = 30_000;
const REPORT_INTERVAL = 10_000;
const MAX_EVENTS = 2_000;

type AttemptRow = {
  id: string; student_id: string; teacher_id: string; class_id: string; topic_id: string; data_version: string;
  mode: 'practice' | 'assessment'; question_count: string; is_full: number; time_limit_min: number | null; show_elapsed: number;
  rules_version: number; seed: number; question_ids: string; status: string; started_at: number; finished_at: number | null;
  duration_ms: number | null; visible_ms: number | null; late_finish: number; percent: number | null; points: number | null;
  max_points: number | null; correct: number | null; total: number | null; grade: number | null; result_hash: string | null;
  invalid_reason: string | null; deleted_at: number | null;
};

function parseConfig(body: Record<string, unknown>): { config: GameConfiguration; dataVersion: string; ids: readonly string[] } {
  const topic = TOPICS.find((x) => x.id === body['topicId']);
  if (!topic || body['dataVersion'] !== topic.dataVersion) return fail(400, 'unknown_topic');
  const ids = TOPIC_FEATURES[topic.id]?.[topic.dataVersion];
  if (!ids || ids.length === 0) return fail(400, 'unknown_topic');
  const count = body['count'] as QuestionCount;
  if (!topic.counts.includes(count)) fail(400, 'invalid_config');
  if (body['mode'] === 'practice') {
    return { config: { mode: 'practice', topicId: topic.id, count, showElapsed: body['showElapsed'] === true }, dataVersion: topic.dataVersion, ids };
  }
  if (body['mode'] === 'assessment') {
    const limit = body['timeLimitMinutes'] ?? null;
    if (![null, 5, 10, 15, 20].includes(limit as number | null)) fail(400, 'invalid_config');
    return { config: { mode: 'assessment', topicId: topic.id, count, timeLimitMinutes: limit as TimeLimitMinutes }, dataVersion: topic.dataVersion, ids };
  }
  return fail(400, 'invalid_config');
}

function configOf(a: AttemptRow): GameConfiguration {
  const count = (a.question_count === 'all' ? 'all' : Number(a.question_count)) as QuestionCount;
  return a.mode === 'practice'
    ? { mode: 'practice', topicId: a.topic_id, count, showElapsed: a.show_elapsed === 1 }
    : { mode: 'assessment', topicId: a.topic_id, count, timeLimitMinutes: a.time_limit_min as TimeLimitMinutes };
}

const requireStudent = (s: Session) => { if (s.user.role !== 'student') fail(403, 'forbidden'); };

/** POST /api/attempts — the browser sends the seed it plays with; the server snapshots the question order. */
export async function startAttempt(ctx: Ctx, s: Session, body: Record<string, unknown>) {
  requireStudent(s);
  const { config, dataVersion, ids } = parseConfig(body);
  const seed = body['seed'];
  if (typeof seed !== 'number' || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) fail(400, 'invalid_config');
  const game = startGame(config, ids, seed as number);
  const questions = game.mode === 'practice' ? game.base.map((t) => t.featureId) : game.answers.map((a) => a.featureId);
  const id = crypto.randomUUID();
  await ctx.db.batch([
    // A new round supersedes any round still open (F3-02: the old one stays, as abandoned).
    ctx.db.prepare("UPDATE attempts SET status = 'abandoned' WHERE student_id = ? AND status = 'started' AND result_hash IS NULL").bind(s.user.id),
    ctx.db.prepare(
      `INSERT INTO attempts (id, student_id, teacher_id, class_id, topic_id, data_version, mode, question_count, is_full, time_limit_min, show_elapsed,
        rules_version, seed, question_ids, status, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'started', ?)`)
      .bind(id, s.user.id, s.user.teacher_id!, s.user.class_id!, config.topicId, dataVersion, config.mode, String(config.count),
        questions.length === ids.length ? 1 : 0, config.mode === 'assessment' ? config.timeLimitMinutes : null,
        config.mode === 'practice' && config.showElapsed ? 1 : 0, RULES_VERSION, seed as number, JSON.stringify(questions), ctx.now),
  ]);
  return json({ attemptId: id }, 201);
}

function parseEvents(raw: unknown): GameEvent[] {
  if (!Array.isArray(raw) || raw.length > MAX_EVENTS) return fail(400, 'invalid_events');
  return raw.map((e) => {
    if (!e || typeof e !== 'object') return fail(400, 'invalid_events');
    const o = e as Record<string, unknown>;
    const t = o['t'];
    if (typeof t !== 'number' || !Number.isInteger(t) || t < 0) return fail(400, 'invalid_events');
    switch (o['type']) {
      case 'SELECT': if (typeof o['f'] !== 'string') return fail(400, 'invalid_events'); return { type: 'SELECT', featureId: o['f'], elapsedMs: t };
      case 'CONFIRM': case 'REVEAL': case 'NEXT': case 'TIME_CHECK': return { type: o['type'], elapsedMs: t };
      default: return fail(400, 'invalid_events');
    }
  });
}

type Replay = { ok: true; state: GameState } | { ok: false; reason: string };

/** Replays the round. Every event must change the state, time never runs backwards, unknown features are rejected. */
export function replay(config: GameConfiguration, ids: readonly string[], seed: number, events: GameEvent[]): Replay {
  const known = new Set(ids);
  let state = startGame(config, ids, seed);
  let last = 0;
  for (const e of events) {
    if (e.elapsedMs < last) return { ok: false, reason: 'time_backwards' };
    last = e.elapsedMs;
    if (e.type === 'SELECT' && !known.has(e.featureId)) return { ok: false, reason: 'unknown_feature' };
    const next = reduce(state, e);
    if (next === state) return { ok: false, reason: 'illegal_event' };
    state = next;
  }
  return state.phase === 'finished' ? { ok: true, state } : { ok: false, reason: 'not_finished' };
}

const resultOut = (a: AttemptRow) => ({
  attemptId: a.id, status: a.status, percent: a.percent, points: a.points, maxPoints: a.max_points, correct: a.correct, total: a.total,
  grade: a.grade, durationMs: a.duration_ms,
});

/** POST /api/attempts/:id/finish — idempotent: the same request again returns the stored result. */
export async function finishAttempt(ctx: Ctx, s: Session, id: string, body: Record<string, unknown>) {
  requireStudent(s);
  const a = (await ctx.db.prepare('SELECT * FROM attempts WHERE id = ? AND student_id = ?').bind(idParam(id), s.user.id).first<AttemptRow>()) ?? fail(404, 'not_found');
  const reason = body['reason'];
  if (reason !== 'completed' && reason !== 'quit') fail(400, 'invalid_events');
  const events = reason === 'completed' ? parseEvents(body['events']) : [];
  const hash = await sha256(JSON.stringify({ reason, events: reason === 'completed' ? body['events'] : null }));
  if (a.result_hash !== null) {
    if (a.result_hash === hash) return json({ result: resultOut(a), repeated: true });
    fail(409, 'already_closed');
  }
  if (a.deleted_at !== null) fail(409, 'already_closed');
  const wall = ctx.now - a.started_at;
  if (reason === 'quit') {
    await ctx.db.prepare("UPDATE attempts SET status = 'abandoned', finished_at = ?, result_hash = ? WHERE id = ?").bind(ctx.now, hash, a.id).run();
    return json({ result: { ...resultOut(a), status: 'abandoned' } });
  }
  const config = configOf(a);
  const ids = TOPIC_FEATURES[a.topic_id]?.[a.data_version] ?? fail(409, 'unknown_topic');
  const r = replay(config, ids, a.seed, events);
  let row: Partial<AttemptRow>;
  if (!r.ok) {
    row = { status: 'invalid', invalid_reason: r.reason };
  } else {
    const result = r.state.mode === 'practice' ? practiceResult(r.state) : assessmentResult(r.state);
    if (result.durationMs > wall + WALL_TOLERANCE) row = { status: 'invalid', invalid_reason: 'time_inconsistent' };
    else {
      const limit = config.mode === 'assessment' ? limitMs(config.timeLimitMinutes) : null;
      const visible = typeof body['visibleMs'] === 'number' && Number.isFinite(body['visibleMs']) ? Math.max(0, Math.min(Math.round(body['visibleMs'] as number), result.durationMs)) : null;
      row = {
        status: result.mode === 'assessment' && result.finishReason === 'timeout' ? 'expired' : 'finished',
        duration_ms: result.durationMs, visible_ms: visible,
        // Without per-question checkpoints the server cannot prove when answers were given; a finish that
        // arrives long after the deadline (e.g. after an outage) is kept but flagged for the teacher.
        late_finish: limit !== null && wall > limit + DEADLINE_GRACE ? 1 : 0,
        percent: Math.round(result.percent * 100) / 100, total: result.total,
        ...(result.mode === 'practice' ? { points: result.points, max_points: result.maxPoints, correct: result.firstTryCorrect } : { correct: result.correct, grade: result.grade }),
      };
    }
  }
  await ctx.db.prepare(
    `UPDATE attempts SET status = ?, finished_at = ?, duration_ms = ?, visible_ms = ?, late_finish = ?, percent = ?, points = ?, max_points = ?,
      correct = ?, total = ?, grade = ?, invalid_reason = ?, result_hash = ? WHERE id = ? AND result_hash IS NULL`)
    .bind(row.status!, ctx.now, row.duration_ms ?? null, row.visible_ms ?? null, row.late_finish ?? 0, row.percent ?? null, row.points ?? null,
      row.max_points ?? null, row.correct ?? null, row.total ?? null, row.grade ?? null, row.invalid_reason ?? null, hash, a.id).run();
  const stored = (await ctx.db.prepare('SELECT * FROM attempts WHERE id = ?').bind(a.id).first<AttemptRow>())!;
  if (stored.result_hash !== hash) fail(409, 'already_closed'); // a concurrent, different finish won
  return json({ result: resultOut(stored) });
}

// ---------------------------------------------------------------- teacher report
/** GET /api/report — summary per student and one page of attempts, filtered. 10 s limit per session (F3-09). */
export async function report(ctx: Ctx, s: Session, q: URLSearchParams) {
  const scope = await teacherScope(ctx, s, q.get('teacherId'));
  const cursor = q.get('before');
  if (!cursor) {
    const row = await ctx.db.prepare('SELECT last_report_at FROM sessions WHERE id = ?').bind(s.id).first<{ last_report_at: number | null }>();
    const wait = row?.last_report_at ? row.last_report_at + REPORT_INTERVAL - ctx.now : 0;
    if (wait > 0) fail(429, 'rate_limited', { retryAfterSeconds: Math.ceil(wait / 1000) });
    await ctx.db.prepare('UPDATE sessions SET last_report_at = ? WHERE id = ?').bind(ctx.now, s.id).run();
  }
  const cutoff = ctx.now - ABANDON_AFTER;
  const status = q.get('status');
  if (status && !['in_progress', 'finished', 'expired', 'abandoned', 'invalid'].includes(status)) fail(400, 'invalid_filter');
  const mode = q.get('mode');
  if (mode && mode !== 'practice' && mode !== 'assessment') fail(400, 'invalid_filter');
  const from = q.get('from') ? Number(q.get('from')) : null;
  const to = q.get('to') ? Number(q.get('to')) : null;
  // Effective status: an open round becomes "abandoned" after 6 h without a finish (computed, no write).
  const eff = `CASE WHEN a.status = 'started' AND a.started_at < ${cutoff} THEN 'abandoned' WHEN a.status = 'started' THEN 'in_progress' ELSE a.status END`;
  const where = `a.teacher_id = ? AND a.deleted_at IS NULL AND (? IS NULL OR a.class_id = ?) AND (? IS NULL OR a.student_id = ?)
    AND (? IS NULL OR a.topic_id = ?) AND (? IS NULL OR a.mode = ?) AND (? IS NULL OR a.started_at >= ?) AND (? IS NULL OR a.started_at < ?)`;
  const args = [scope, q.get('classId'), q.get('classId'), q.get('studentId'), q.get('studentId'), q.get('topicId'), q.get('topicId'),
    mode, mode, from, from, to, to];

  const summary = cursor ? null : (await ctx.db.prepare(
    `SELECT a.student_id, u.full_name, u.login, c.name AS class_name, a.mode,
       COUNT(*) AS started,
       SUM(${eff} = 'finished') AS finished, SUM(${eff} = 'expired') AS expired, SUM(${eff} = 'abandoned') AS abandoned,
       SUM(${eff} = 'invalid') AS invalid, SUM(${eff} = 'in_progress') AS in_progress,
       SUM(COALESCE(a.duration_ms, 0)) AS duration_ms, SUM(COALESCE(a.visible_ms, 0)) AS visible_ms,
       MAX(CASE WHEN a.is_full = 1 AND a.status IN ('finished', 'expired') THEN a.percent END) AS best_full_percent,
       MAX(CASE WHEN a.is_full = 1 AND a.status IN ('finished', 'expired') THEN a.grade END) AS best_full_grade,
       MAX(a.started_at) AS last_started_at
     FROM attempts a JOIN users u ON u.id = a.student_id JOIN classes c ON c.id = u.class_id
     WHERE ${where} AND (? IS NULL OR ${eff} = ?)
     GROUP BY a.student_id, a.mode ORDER BY c.name_norm, u.full_name, a.mode`).bind(...args, status, status).all<Record<string, unknown>>()).results;

  // The latest scored round per student and mode (for "last result").
  const last = cursor ? [] : (await ctx.db.prepare(
    `SELECT a.student_id, a.mode, a.percent, a.points, a.max_points, a.correct, a.total, a.grade, a.topic_id FROM attempts a
     WHERE ${where} AND a.status IN ('finished', 'expired') AND a.started_at = (
       SELECT MAX(b.started_at) FROM attempts b WHERE b.student_id = a.student_id AND b.mode = a.mode AND b.deleted_at IS NULL AND b.status IN ('finished', 'expired')
         AND (? IS NULL OR b.topic_id = ?))`).bind(...args, q.get('topicId'), q.get('topicId')).all<Record<string, unknown>>()).results;
  const lastKey = new Map(last.map((r) => [`${r['student_id']}|${r['mode']}`, r]));

  const before = cursor ? Number(cursor) : Number.MAX_SAFE_INTEGER;
  const { results: rows } = await ctx.db.prepare(
    `SELECT a.*, ${eff} AS eff_status, u.full_name, u.login, c.name AS class_name FROM attempts a JOIN users u ON u.id = a.student_id
     JOIN classes c ON c.id = a.class_id WHERE ${where} AND (? IS NULL OR ${eff} = ?) AND a.started_at < ?
     ORDER BY a.started_at DESC LIMIT 50`).bind(...args, status, status, before).all<AttemptRow & { eff_status: string; full_name: string; login: string; class_name: string }>();

  return json({
    generatedAt: ctx.now,
    summary: summary?.map((r) => ({
      studentId: r['student_id'], fullName: r['full_name'], login: r['login'], className: r['class_name'], mode: r['mode'],
      started: r['started'], finished: r['finished'], expired: r['expired'], abandoned: r['abandoned'], invalid: r['invalid'], inProgress: r['in_progress'],
      durationMs: r['duration_ms'], visibleMs: r['visible_ms'], bestFullPercent: r['best_full_percent'], bestFullGrade: r['best_full_grade'],
      last: (() => { const l = lastKey.get(`${r['student_id']}|${r['mode']}`); return l ? { percent: l['percent'], points: l['points'], maxPoints: l['max_points'], correct: l['correct'], total: l['total'], grade: l['grade'], topicId: l['topic_id'] } : null; })(),
    })) ?? null,
    attempts: rows.map((a) => ({
      id: a.id, studentId: a.student_id, fullName: a.full_name, login: a.login, className: a.class_name, topicId: a.topic_id, mode: a.mode,
      count: a.question_count, isFull: a.is_full === 1, timeLimitMinutes: a.time_limit_min, status: a.eff_status, startedAt: a.started_at,
      durationMs: a.duration_ms, visibleMs: a.visible_ms, timingComplete: a.visible_ms !== null, lateFinish: a.late_finish === 1,
      percent: a.percent, points: a.points, maxPoints: a.max_points, correct: a.correct, total: a.total, grade: a.grade, invalidReason: a.invalid_reason,
    })),
    nextBefore: rows.length === 50 ? rows[rows.length - 1]!.started_at : null,
  });
}

/** DELETE /api/report/attempts/:id — soft delete with a reason (F3-10). */
export async function deleteAttempt(ctx: Ctx, s: Session, id: string, body: Record<string, unknown>) {
  const scope = await teacherScope(ctx, s, body['teacherId']);
  const reason = typeof body['reason'] === 'string' ? body['reason'].normalize('NFC').replace(/\s+/g, ' ').trim() : '';
  if (reason.length < 3 || reason.length > 200) fail(400, 'invalid_reason');
  const a = (await ctx.db.prepare('SELECT id FROM attempts WHERE id = ? AND teacher_id = ? AND deleted_at IS NULL').bind(idParam(id), scope).first<{ id: string }>()) ?? fail(404, 'not_found');
  await ctx.db.batch([
    ctx.db.prepare('UPDATE attempts SET deleted_at = ?, deleted_by = ?, delete_reason = ? WHERE id = ?').bind(ctx.now, s.user.id, reason, a.id),
    ctx.db.prepare('INSERT INTO audit_log (at, actor_id, action, target_type, target_id, teacher_scope, details) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(ctx.now, s.user.id, 'attempt.delete', 'attempt', a.id, scope, JSON.stringify({ reason })),
  ]);
  return json({ ok: true });
}
