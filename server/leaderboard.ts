// F5: full-map leaderboard and personal record. Eligibility is decided at query time from the attempt rows,
// so deletions, exclusions, archiving and new periods take effect at once.
// See docs/project/tasks/0003_ONLINE_PLATFORM/phases/F5_DESIGN.md.
import { TOPICS } from '../src/data/topicRegistry.ts';
import { audit, teacherScope } from './admin.ts';
import { RULES_VERSION } from './rules.ts';
import type { Ctx, Session } from './auth.ts';
import { currentIds } from './topicSettings.ts';
import type { D1Database } from './types.ts';
import { fail, json } from './util.ts';
import { idParam } from './validate.ts';

const REFRESH_GAP = 60_000;

/** SQL condition for a leaderboard candidate (everything except the period and the exact ID-set check). */
export const CANDIDATE_SQL = `a.mode = 'assessment' AND a.status = 'finished' AND a.time_limit_min IS NULL AND a.restricted = 0 AND a.is_full = 1
  AND a.deleted_at IS NULL AND a.rules_version = ${RULES_VERSION}`;
const ELIGIBLE_SQL = `${CANDIDATE_SQL} AND a.lb_excluded_at IS NULL AND (a.review_status IS NULL OR a.review_status = 'approved')`;

type Row = { id: string; student_id: string; full_name: string; correct: number; total: number; duration_ms: number; started_at: number; question_ids: string };
export type BoardRow = { rank: number; studentId: string; fullName: string; correct: number; total: number; percent: number; durationMs: number };

/** The question set must be exactly the topic's full current set (not just "all" or N/N). */
export function fullSet(topicId: string): ((questionIds: string) => boolean) | null {
  const ids = currentIds(topicId);
  if (!ids) return null;
  const key = [...ids].sort().join('|');
  return (q) => { try { return [...(JSON.parse(q) as string[])].sort().join('|') === key; } catch { return false; } };
}

/** Better first: more correct answers, then less time, then the earlier round (stable, not better). */
const better = (a: Row, b: Row) => b.correct - a.correct || a.duration_ms - b.duration_ms || a.started_at - b.started_at;

export async function periodStart(db: D1Database, teacherId: string, topicId: string): Promise<number> {
  const r = await db.prepare('SELECT MAX(started_at) AS s FROM lb_periods WHERE teacher_id = ? AND topic_id = ?').bind(teacherId, topicId).first<{ s: number | null }>();
  return r?.s ?? 0;
}

async function eligibleRows(db: D1Database, teacherId: string, topicId: string, from: number, studentId: string | null): Promise<Row[]> {
  const isFull = fullSet(topicId) ?? fail(404, 'not_found');
  const { results } = await db.prepare(
    `SELECT a.id, a.student_id, u.full_name, a.correct, a.total, a.duration_ms, a.started_at, a.question_ids
     FROM attempts a JOIN users u ON u.id = a.student_id
     WHERE a.teacher_id = ? AND a.topic_id = ? AND ${ELIGIBLE_SQL} AND u.status = 'active' AND u.teacher_id = ? AND a.started_at >= ?
       AND (? IS NULL OR a.student_id = ?)`)
    .bind(teacherId, topicId, teacherId, from, studentId, studentId).all<Row>();
  return results.filter((r) => isFull(r.question_ids));
}

/** One best row per student, ranked with shared places for exact ties (1, 1, 3). */
export function rank(rows: Row[]): BoardRow[] {
  const best = new Map<string, Row>();
  for (const r of rows) { const cur = best.get(r.student_id); if (!cur || better(r, cur) < 0) best.set(r.student_id, r); }
  const sorted = [...best.values()].sort((a, b) => better(a, b) || a.full_name.localeCompare(b.full_name, 'hu'));
  return sorted.map((r, i) => {
    let place = i + 1;
    for (let j = i - 1; j >= 0 && sorted[j]!.correct === r.correct && sorted[j]!.duration_ms === r.duration_ms; j--) place = j + 1;
    return { rank: place, studentId: r.student_id, fullName: r.full_name, correct: r.correct, total: r.total, percent: Math.round((r.correct / r.total) * 10_000) / 100, durationMs: r.duration_ms };
  });
}

function topicParam(q: URLSearchParams | Record<string, unknown>, key = 'topicId'): string {
  const v = q instanceof URLSearchParams ? q.get(key) : q[key];
  if (typeof v !== 'string' || !TOPICS.some((t) => t.id === v)) return fail(404, 'not_found');
  return v;
}

/** GET /api/leaderboard — one successful request per account per 60 s (all tabs and devices). */
export async function leaderboard(ctx: Ctx, s: Session, q: URLSearchParams) {
  const topicId = topicParam(q);
  const teacherId = s.user.role === 'student' ? s.user.teacher_id! : await teacherScope(ctx, s, q.get('teacherId'));
  const u = await ctx.db.prepare('SELECT last_leaderboard_at FROM users WHERE id = ?').bind(s.user.id).first<{ last_leaderboard_at: number | null }>();
  const wait = u?.last_leaderboard_at ? u.last_leaderboard_at + REFRESH_GAP - ctx.now : 0;
  if (wait > 0) fail(429, 'rate_limited', { retryAfterSeconds: Math.ceil(wait / 1000) });
  await ctx.db.prepare('UPDATE users SET last_leaderboard_at = ? WHERE id = ?').bind(ctx.now, s.user.id).run();
  const from = await periodStart(ctx.db, teacherId, topicId);
  const rows = rank(await eligibleRows(ctx.db, teacherId, topicId, from, null));
  return json({ generatedAt: ctx.now, periodStart: from || null, rows, myStudentId: s.user.role === 'student' ? s.user.id : null, nextRefreshAt: ctx.now + REFRESH_GAP });
}

/** GET /api/record — the student's own current best (same eligible set), or null. */
export async function record(ctx: Ctx, s: Session, q: URLSearchParams) {
  if (s.user.role !== 'student') fail(403, 'forbidden');
  const topicId = topicParam(q);
  const from = await periodStart(ctx.db, s.user.teacher_id!, topicId);
  const mine = rank(await eligibleRows(ctx.db, s.user.teacher_id!, topicId, from, s.user.id))[0];
  // F6: tell the student when a round waits for the teacher's review (no history, just the fact).
  const pending = await ctx.db.prepare(`SELECT COUNT(*) AS n FROM attempts a WHERE a.student_id = ? AND a.topic_id = ? AND a.review_status = 'pending' AND ${CANDIDATE_SQL} AND a.started_at >= ?`)
    .bind(s.user.id, topicId, from).first<{ n: number }>();
  return json({ record: mine ? { correct: mine.correct, total: mine.total, percent: mine.percent, durationMs: mine.durationMs } : null, pendingReview: (pending?.n ?? 0) > 0 });
}

/** POST /api/leaderboard/periods {topicId, confirm: true} — starts a new competition period; history stays. */
export async function newPeriod(ctx: Ctx, s: Session, body: Record<string, unknown>) {
  const teacherId = await teacherScope(ctx, s, body['teacherId']);
  const topicId = topicParam(body);
  if (body['confirm'] !== true) fail(400, 'confirmation_required');
  await ctx.db.prepare('INSERT OR IGNORE INTO lb_periods (teacher_id, topic_id, started_at, started_by) VALUES (?, ?, ?, ?)').bind(teacherId, topicId, ctx.now, s.user.id).run();
  await audit(ctx, s.user.id, 'leaderboard.new_period', 'topic', topicId, teacherId);
  return json({ periodStart: ctx.now });
}

/** POST /api/report/attempts/:id/leaderboard {excluded, reason} — reversible exclusion from the leaderboard only. */
export async function setExcluded(ctx: Ctx, s: Session, id: string, body: Record<string, unknown>) {
  const teacherId = await teacherScope(ctx, s, body['teacherId']);
  const a = (await ctx.db.prepare('SELECT id FROM attempts WHERE id = ? AND teacher_id = ? AND deleted_at IS NULL').bind(idParam(id), teacherId).first<{ id: string }>()) ?? fail(404, 'not_found');
  if (body['excluded'] === true) {
    const reason = typeof body['reason'] === 'string' ? body['reason'].normalize('NFC').replace(/\s+/g, ' ').trim() : '';
    if (reason.length < 3 || reason.length > 200) fail(400, 'invalid_reason');
    await ctx.db.prepare('UPDATE attempts SET lb_excluded_at = ?, lb_excluded_by = ?, lb_exclude_reason = ? WHERE id = ?').bind(ctx.now, s.user.id, reason, a.id).run();
    await audit(ctx, s.user.id, 'attempt.leaderboard_exclude', 'attempt', a.id, teacherId, { reason });
  } else if (body['excluded'] === false) {
    await ctx.db.prepare('UPDATE attempts SET lb_excluded_at = NULL, lb_excluded_by = NULL, lb_exclude_reason = NULL WHERE id = ?').bind(a.id).run();
    await audit(ctx, s.user.id, 'attempt.leaderboard_include', 'attempt', a.id, teacherId);
  } else fail(400, 'invalid_request');
  return json({ ok: true });
}

/** POST /api/report/attempts/:id/review {decision, reason} — F6: approve or reject a round that needs review. */
export async function review(ctx: Ctx, s: Session, id: string, body: Record<string, unknown>) {
  const teacherId = await teacherScope(ctx, s, body['teacherId']);
  const decision = body['decision'];
  if (decision !== 'approved' && decision !== 'rejected') return fail(400, 'invalid_request');
  const reason = typeof body['reason'] === 'string' ? body['reason'].normalize('NFC').replace(/\s+/g, ' ').trim() : '';
  if (reason.length < 3 || reason.length > 200) fail(400, 'invalid_reason');
  const a = (await ctx.db.prepare('SELECT id FROM attempts WHERE id = ? AND teacher_id = ? AND deleted_at IS NULL AND review_status IS NOT NULL')
    .bind(idParam(id), teacherId).first<{ id: string }>()) ?? fail(404, 'not_found');
  await ctx.db.prepare('UPDATE attempts SET review_status = ?, review_by = ?, review_at = ?, review_reason = ? WHERE id = ?').bind(decision, s.user.id, ctx.now, reason, a.id).run();
  await audit(ctx, s.user.id, `attempt.review_${decision}`, 'attempt', a.id, teacherId, { reason });
  return json({ ok: true });
}
