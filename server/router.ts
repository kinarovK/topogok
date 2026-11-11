import * as admin from './admin.ts';
import { checkCsrf, currentSession, login, logout, meBody, requireSession, saltFor, type Ctx } from './auth.ts';
import type { Env } from './types.ts';
import { ApiError, fail, json } from './util.ts';
import { readBody } from './validate.ts';

export const SCHEMA_VERSION = 1;

/** Entry point for every /api/* request (Cloudflare Pages Function and the local test server). */
export async function handle(request: Request, env: Env, now = Date.now()): Promise<Response> {
  try {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '');
    if (path === '/api/health' && request.method === 'GET') return await health(env);
    if (!env.DB) fail(503, 'db_unavailable');
    if (!env.PEPPER || env.PEPPER.length < 32) fail(503, 'not_configured');
    checkCsrf(request);
    const ctx: Ctx = { db: env.DB!, env, pepper: env.PEPPER!, now, request, ip: request.headers.get('cf-connecting-ip') ?? 'local' };
    const body = await readBody(request);
    const route = `${request.method} ${path}`;
    const q = url.searchParams;

    switch (route) {
      case 'POST /api/auth/salt': return await saltFor(ctx, body);
      case 'POST /api/auth/login': return await login(ctx, body);
      case 'POST /api/auth/logout': return await logout(ctx);
      case 'POST /api/setup': return await admin.setup(ctx, body);
      case 'GET /api/me': {
        const s = await currentSession(ctx);
        if (!s) return json({ user: null });
        return json({ user: meBody(s) }, 200, s.extendCookie ? { 'set-cookie': s.extendCookie } : {});
      }
    }

    const s = await requireSession(ctx);
    const withCookie = (r: Response) => { if (s.extendCookie) r.headers.append('set-cookie', s.extendCookie); return r; };
    const m = path.match(/^\/api\/(classes|students|teachers)(?:\/([^/]+))?(?:\/(password))?$/);
    if (path === '/api/audit' && request.method === 'GET') return withCookie(await admin.listAudit(ctx, s, q));
    if (m) {
      const [, kind, id, sub] = m;
      const key = `${request.method} ${kind}${id ? '/:id' : ''}${sub ? '/password' : ''}`;
      switch (key) {
        case 'GET classes': return withCookie(await admin.listClasses(ctx, s, q));
        case 'POST classes': return withCookie(await admin.createClass(ctx, s, body));
        case 'PATCH classes/:id': return withCookie(await admin.updateClass(ctx, s, id!, body));
        case 'DELETE classes/:id': return withCookie(await admin.deleteClass(ctx, s, id!, q));
        case 'GET students': return withCookie(await admin.listStudents(ctx, s, q));
        case 'POST students': return withCookie(await admin.createStudent(ctx, s, body));
        case 'PATCH students/:id': return withCookie(await admin.updateStudent(ctx, s, id!, body));
        case 'DELETE students/:id': return withCookie(await admin.deleteStudent(ctx, s, id!, body));
        case 'POST students/:id/password': return withCookie(await admin.setStudentPassword(ctx, s, id!, body));
        case 'GET teachers': return withCookie(await admin.listTeachers(ctx, s));
        case 'POST teachers': return withCookie(await admin.createTeacher(ctx, s, body));
        case 'PATCH teachers/:id': return withCookie(await admin.updateTeacher(ctx, s, id!, body));
        case 'POST teachers/:id/password': return withCookie(await admin.setTeacherPassword(ctx, s, id!, body));
      }
    }
    return fail(404, 'not_found');
  } catch (e) {
    if (e instanceof ApiError) return json({ error: e.code, ...(e.extra ?? {}) }, e.status, e.status === 429 ? { 'retry-after': String(e.extra?.['retryAfterSeconds'] ?? 60) } : {});
    const msg = e instanceof Error ? e.message : String(e);
    if (/UNIQUE constraint failed: users\.login_norm/.test(msg)) return json({ error: 'login_taken' }, 409);
    if (/student_scope/.test(msg)) return json({ error: 'invalid_scope' }, 400);
    console.error('api error', msg);
    return json({ error: 'internal' }, 500);
  }
}

async function health(env: Env): Promise<Response> {
  let db = false; let schema: number | null = null;
  if (env.DB) {
    try {
      const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name IN ('users', 'classes', 'sessions', 'login_throttle', 'audit_log', 'recovery_codes')").first<{ n: number }>();
      db = true; schema = r?.n === 6 ? SCHEMA_VERSION : 0;
    } catch { db = false; }
  }
  // Presence and length only — never the values.
  const pepper = !env.PEPPER ? 'missing' : env.PEPPER.length < 32 ? 'too_short' : 'ok';
  const setupCode = !env.SETUP_CODE ? 'missing' : env.SETUP_CODE.length < 16 ? 'too_short' : 'ok';
  return json({ ok: db && schema === SCHEMA_VERSION && pepper === 'ok', db, schema, configured: pepper === 'ok', pepper, setupCode, build: env.APP_BUILD ?? null });
}
