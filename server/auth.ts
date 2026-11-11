import { KDF_ITERATIONS, toBase64 } from '../shared/kdf.ts';
import type { D1Database, Env, UserRow } from './types.ts';
import { DAY, SESSION_TTL, fail, hmac, json, parseCookies, randomToken, sha256, timingSafeEqual, verifierFor } from './util.ts';
import { normalizeLogin } from './validate.ts';

export const COOKIE = 'topogok_session';
const LOGIN_WINDOW = 15 * 60_000;
const LOGIN_FREE_FAILURES = 5;
const IP_MAX_FAILURES = 30;

export type Ctx = {
  db: D1Database;
  env: Env;
  pepper: string;
  now: number;
  request: Request;
  ip: string;
};

export type Session = { id: string; user: UserRow; teacherName: string | null; className: string | null; extendCookie: string | null };

export const minIterations = (env: Env) => Number(env.MIN_KDF_ITERATIONS ?? KDF_ITERATIONS);

export function sessionCookie(token: string, maxAgeMs: number): string {
  return `${COOKIE}=${token}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.floor(maxAgeMs / 1000)}`;
}
export const clearCookie = `${COOKIE}=; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

/** Mutating requests must come from our own pages (SameSite cookie + custom header + Origin). */
export function checkCsrf(request: Request): void {
  if (request.method === 'GET' || request.method === 'HEAD') return;
  if (request.headers.get('x-topogok') !== '1') fail(403, 'csrf');
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) fail(403, 'csrf');
}

/** POST /api/auth/salt — the stored salt, or a stable fake one so the answer never reveals whether a login exists. */
export async function saltFor(ctx: Ctx, body: Record<string, unknown>): Promise<Response> {
  let norm: string | null;
  try { norm = normalizeLogin(body['login']).norm; } catch { norm = null; }
  if (norm) {
    const row = await ctx.db.prepare('SELECT pw_salt, pw_iterations FROM users WHERE login_norm = ?').bind(norm).first<{ pw_salt: string; pw_iterations: number }>();
    if (row) return json({ salt: row.pw_salt, iterations: row.pw_iterations });
  }
  const fake = toBase64((await hmac(ctx.pepper, `salt:${norm ?? String(body['login'] ?? '')}`)).slice(0, 16));
  return json({ salt: fake, iterations: KDF_ITERATIONS });
}

async function throttleState(ctx: Ctx, key: string): Promise<{ failures: number; window_start: number; locked_until: number | null } | null> {
  return ctx.db.prepare('SELECT failures, window_start, locked_until FROM login_throttle WHERE key = ?').bind(key).first();
}

async function recordFailure(ctx: Ctx, key: string, isIp: boolean): Promise<void> {
  const s = await throttleState(ctx, key);
  const fresh = !s || ctx.now - s.window_start > LOGIN_WINDOW && (s.locked_until ?? 0) < ctx.now;
  const failures = fresh ? 1 : s.failures + 1;
  const windowStart = fresh ? ctx.now : s.window_start;
  let locked: number | null = null;
  if (isIp && failures >= IP_MAX_FAILURES) locked = ctx.now + LOGIN_WINDOW;
  if (!isIp && failures >= LOGIN_FREE_FAILURES) locked = ctx.now + Math.min(LOGIN_WINDOW * 2 ** (failures - LOGIN_FREE_FAILURES), DAY);
  await ctx.db.prepare('INSERT INTO login_throttle (key, failures, window_start, locked_until) VALUES (?, ?, ?, ?) ON CONFLICT (key) DO UPDATE SET failures = excluded.failures, window_start = excluded.window_start, locked_until = excluded.locked_until')
    .bind(key, failures, windowStart, locked).run();
}

/** POST /api/auth/login */
export async function login(ctx: Ctx, body: Record<string, unknown>): Promise<Response> {
  const { norm } = normalizeLogin(body['login']);
  const key = body['key'];
  if (typeof key !== 'string') fail(400, 'invalid_key');
  const keys = [`login:${norm}`, `ip:${ctx.ip}`];
  for (const k of keys) {
    const s = await throttleState(ctx, k);
    if (s?.locked_until && s.locked_until > ctx.now) fail(429, 'rate_limited', { retryAfterSeconds: Math.ceil((s.locked_until - ctx.now) / 1000) });
  }
  const user = await ctx.db.prepare('SELECT * FROM users WHERE login_norm = ?').bind(norm).first<UserRow>();
  const verifier = await verifierFor(ctx.pepper, key as string);
  const ok = !!user && timingSafeEqual(verifier, user.pw_verifier);
  if (!ok) {
    await recordFailure(ctx, keys[0]!, false);
    await recordFailure(ctx, keys[1]!, true);
    return fail(401, 'invalid_credentials');
  }
  if (user.status !== 'active') fail(403, 'account_inactive');
  if (user.role === 'student') {
    const t = await ctx.db.prepare('SELECT status FROM users WHERE id = ?').bind(user.teacher_id).first<{ status: string }>();
    if (t?.status !== 'active') fail(403, 'account_inactive');
  }
  await ctx.db.prepare('DELETE FROM login_throttle WHERE key = ?').bind(keys[0]!).run();
  const token = randomToken();
  await ctx.db.prepare('INSERT INTO sessions (id, user_id, created_at, last_seen_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(await sha256(token), user.id, ctx.now, ctx.now, ctx.now + SESSION_TTL, (ctx.request.headers.get('user-agent') ?? '').slice(0, 200)).run();
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie(token, SESSION_TTL) });
}

/** The current session or null. Revoked/expired sessions, inactive users and students of inactive teachers get null. */
export async function currentSession(ctx: Ctx): Promise<Session | null> {
  const token = parseCookies(ctx.request.headers.get('cookie'))[COOKIE];
  if (!token) return null;
  const id = await sha256(token);
  const row = await ctx.db.prepare(
    `SELECT s.id AS session_id, s.last_seen_at, s.expires_at, s.revoked_at, u.*, t.status AS teacher_status, t.full_name AS teacher_name, c.name AS class_name
     FROM sessions s JOIN users u ON u.id = s.user_id LEFT JOIN users t ON t.id = u.teacher_id LEFT JOIN classes c ON c.id = u.class_id
     WHERE s.id = ?`).bind(id).first<UserRow & { session_id: string; last_seen_at: number; expires_at: number; revoked_at: number | null; teacher_status: string | null; teacher_name: string | null; class_name: string | null }>();
  if (!row || row.revoked_at !== null || row.expires_at <= ctx.now || row.status !== 'active') return null;
  if (row.role === 'student' && row.teacher_status !== 'active') return null;
  let extendCookie: string | null = null;
  if (ctx.now - row.last_seen_at > DAY) {
    await ctx.db.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?').bind(ctx.now, ctx.now + SESSION_TTL, id).run();
    extendCookie = sessionCookie(token, SESSION_TTL);
  }
  return { id, user: row, teacherName: row.teacher_name, className: row.class_name, extendCookie };
}

export async function requireSession(ctx: Ctx): Promise<Session> {
  return (await currentSession(ctx)) ?? fail(401, 'unauthenticated');
}

export async function logout(ctx: Ctx): Promise<Response> {
  const s = await currentSession(ctx);
  if (s) await ctx.db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ?').bind(ctx.now, s.id).run();
  return json({ ok: true }, 200, { 'set-cookie': clearCookie });
}

export async function revokeAllSessions(ctx: Ctx, userId: string): Promise<void> {
  await ctx.db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').bind(ctx.now, userId).run();
}

export function meBody(s: Session) {
  const u = s.user;
  return {
    id: u.id, role: u.role, login: u.login, fullName: u.full_name,
    ...(u.role === 'student' ? { teacherName: s.teacherName, className: s.className } : {}),
  };
}

export const constantTimeCodeMatch = (a: string, b: string) => timingSafeEqual(a, b);
