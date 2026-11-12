// Classes, students, teachers, audit log, first superadmin / recovery. Every query on teacher-owned
// data is filtered by the teacher scope from the session (F2_DESIGN.md §6): foreign ids answer 404.
import { minIterations, revokeAllSessions, type Ctx, type Session } from './auth.ts';
import type { ClassRow, UserRow } from './types.ts';
import { fail, json, sha256, timingSafeEqual, verifierFor } from './util.ts';
import { className, fullName, idParam, nameKey, normalizeLogin, passwordInput } from './validate.ts';

const uuid = () => crypto.randomUUID();

export async function audit(ctx: Ctx, actor: string | null, action: string, targetType: string | null, targetId: string | null, scope: string | null, details?: Record<string, unknown>) {
  await ctx.db.prepare('INSERT INTO audit_log (at, actor_id, action, target_type, target_id, teacher_scope, details) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(ctx.now, actor, action, targetType, targetId, scope, details ? JSON.stringify(details) : null).run();
}

/** Teacher: always their own id. Superadmin: the explicit teacherId (must be a teacher). Others: forbidden. */
export async function teacherScope(ctx: Ctx, s: Session, requested: unknown): Promise<string> {
  if (s.user.role === 'teacher') return s.user.id;
  if (s.user.role !== 'superadmin') return fail(403, 'forbidden');
  const id = idParam(requested);
  const t = await ctx.db.prepare("SELECT id FROM users WHERE id = ? AND role = 'teacher'").bind(id).first();
  return t ? id : fail(404, 'not_found');
}

const requireSuperadmin = (s: Session) => { if (s.user.role !== 'superadmin') fail(403, 'forbidden'); };

async function loginFree(ctx: Ctx, norm: string, exceptId: string | null): Promise<void> {
  const row = await ctx.db.prepare('SELECT id FROM users WHERE login_norm = ?').bind(norm).first<{ id: string }>();
  if (row && row.id !== exceptId) fail(409, 'login_taken');
}

const classOut = (c: ClassRow & { student_count?: number }) => ({ id: c.id, name: c.name, status: c.status, studentCount: c.student_count ?? 0 });
const userOut = (u: UserRow & { class_name?: string | null }) => ({
  id: u.id, login: u.login, fullName: u.full_name, status: u.status, createdAt: u.created_at, passwordChangedAt: u.pw_changed_at,
  ...(u.role === 'student' ? { classId: u.class_id, className: u.class_name ?? null } : {}),
});

// ---------------------------------------------------------------- classes
export async function listClasses(ctx: Ctx, s: Session, q: URLSearchParams) {
  const scope = await teacherScope(ctx, s, q.get('teacherId'));
  const { results } = await ctx.db.prepare(
    `SELECT c.*, (SELECT COUNT(*) FROM users u WHERE u.class_id = c.id AND u.status = 'active') AS student_count
     FROM classes c WHERE c.teacher_id = ? ORDER BY c.status, c.name_norm`).bind(scope).all<ClassRow & { student_count: number }>();
  return json({ classes: results.map(classOut) });
}

async function getClass(ctx: Ctx, scope: string, id: unknown): Promise<ClassRow> {
  return (await ctx.db.prepare('SELECT * FROM classes WHERE id = ? AND teacher_id = ?').bind(idParam(id), scope).first<ClassRow>()) ?? fail(404, 'not_found');
}

export async function createClass(ctx: Ctx, s: Session, body: Record<string, unknown>) {
  const scope = await teacherScope(ctx, s, body['teacherId']);
  const name = className(body['name']);
  const dup = await ctx.db.prepare('SELECT id FROM classes WHERE teacher_id = ? AND name_norm = ?').bind(scope, nameKey(name)).first();
  if (dup) fail(409, 'class_name_taken');
  const id = uuid();
  await ctx.db.prepare('INSERT INTO classes (id, teacher_id, name, name_norm, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, scope, name, nameKey(name), ctx.now).run();
  await audit(ctx, s.user.id, 'class.create', 'class', id, scope, { name });
  return json({ class: { id, name, status: 'active', studentCount: 0 } }, 201);
}

export async function updateClass(ctx: Ctx, s: Session, id: string, body: Record<string, unknown>) {
  const scope = await teacherScope(ctx, s, body['teacherId']);
  const c = await getClass(ctx, scope, id);
  const changed: string[] = [];
  if (body['name'] !== undefined) {
    const name = className(body['name']);
    const dup = await ctx.db.prepare('SELECT id FROM classes WHERE teacher_id = ? AND name_norm = ? AND id <> ?').bind(scope, nameKey(name), c.id).first();
    if (dup) fail(409, 'class_name_taken');
    await ctx.db.prepare('UPDATE classes SET name = ?, name_norm = ? WHERE id = ?').bind(name, nameKey(name), c.id).run();
    changed.push('name');
  }
  if (body['status'] !== undefined) {
    const status = body['status'];
    if (status !== 'active' && status !== 'archived') fail(400, 'invalid_status');
    if (status === 'archived') {
      const n = await ctx.db.prepare("SELECT COUNT(*) AS n FROM users WHERE class_id = ? AND status = 'active'").bind(c.id).first<{ n: number }>();
      if ((n?.n ?? 0) > 0) fail(409, 'class_not_empty');
    }
    await ctx.db.prepare('UPDATE classes SET status = ?, archived_at = ? WHERE id = ?').bind(status as string, status === 'archived' ? ctx.now : null, c.id).run();
    changed.push('status');
  }
  await audit(ctx, s.user.id, 'class.update', 'class', c.id, scope, { fields: changed });
  return json({ ok: true });
}

export async function deleteClass(ctx: Ctx, s: Session, id: string, q: URLSearchParams) {
  const scope = await teacherScope(ctx, s, q.get('teacherId'));
  const c = await getClass(ctx, scope, id);
  const n = await ctx.db.prepare('SELECT COUNT(*) AS n FROM users WHERE class_id = ?').bind(c.id).first<{ n: number }>();
  if ((n?.n ?? 0) > 0) fail(409, 'class_not_empty'); // archived students keep their class for history
  await ctx.db.prepare('DELETE FROM classes WHERE id = ?').bind(c.id).run();
  await audit(ctx, s.user.id, 'class.delete', 'class', c.id, scope, { name: c.name });
  return json({ ok: true });
}

// ---------------------------------------------------------------- students
export async function listStudents(ctx: Ctx, s: Session, q: URLSearchParams) {
  const scope = await teacherScope(ctx, s, q.get('teacherId'));
  const status = q.get('status') ?? 'active';
  if (!['active', 'archived', 'all'].includes(status)) fail(400, 'invalid_status');
  const classId = q.get('classId');
  const { results } = await ctx.db.prepare(
    `SELECT u.*, c.name AS class_name FROM users u JOIN classes c ON c.id = u.class_id
     WHERE u.role = 'student' AND u.teacher_id = ? AND (? = 'all' OR u.status = ?) AND (? IS NULL OR u.class_id = ?)
     ORDER BY c.name_norm, u.full_name`).bind(scope, status, status, classId, classId).all<UserRow & { class_name: string }>();
  return json({ students: results.map(userOut) });
}

async function getStudent(ctx: Ctx, scope: string, id: unknown): Promise<UserRow> {
  return (await ctx.db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student' AND teacher_id = ?").bind(idParam(id), scope).first<UserRow>()) ?? fail(404, 'not_found');
}

async function activeClassOf(ctx: Ctx, scope: string, id: unknown): Promise<ClassRow> {
  const c = await getClass(ctx, scope, id);
  if (c.status !== 'active') fail(409, 'class_archived');
  return c;
}

export async function createStudent(ctx: Ctx, s: Session, body: Record<string, unknown>) {
  const scope = await teacherScope(ctx, s, body['teacherId']);
  const { login, norm } = normalizeLogin(body['login']);
  const name = fullName(body['fullName']);
  const cls = await activeClassOf(ctx, scope, body['classId']);
  const pw = passwordInput(body, minIterations(ctx.env));
  await loginFree(ctx, norm, null);
  const id = uuid();
  await ctx.db.prepare(
    `INSERT INTO users (id, role, login, login_norm, full_name, teacher_id, class_id, pw_salt, pw_iterations, pw_verifier, pw_changed_at, created_at, created_by, updated_at)
     VALUES (?, 'student', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, login, norm, name, scope, cls.id, pw.salt, pw.iterations, await verifierFor(ctx.pepper, pw.key), ctx.now, ctx.now, s.user.id, ctx.now).run();
  await audit(ctx, s.user.id, 'student.create', 'user', id, scope, { login, classId: cls.id });
  return json({ student: { id, login, fullName: name, status: 'active', classId: cls.id, className: cls.name } }, 201);
}

export async function updateStudent(ctx: Ctx, s: Session, id: string, body: Record<string, unknown>) {
  const scope = await teacherScope(ctx, s, body['teacherId']);
  const st = await getStudent(ctx, scope, id);
  const changed: string[] = [];
  const set = async (sql: string, ...v: (string | number | null)[]) => { await ctx.db.prepare(`UPDATE users SET ${sql}, updated_at = ? WHERE id = ?`).bind(...v, ctx.now, st.id).run(); };
  if (body['fullName'] !== undefined) { await set('full_name = ?', fullName(body['fullName'])); changed.push('fullName'); }
  if (body['login'] !== undefined) {
    const { login, norm } = normalizeLogin(body['login']);
    await loginFree(ctx, norm, st.id);
    await set('login = ?, login_norm = ?', login, norm); changed.push('login');
  }
  if (body['classId'] !== undefined) { const c = await activeClassOf(ctx, scope, body['classId']); await set('class_id = ?', c.id); changed.push('classId'); }
  if (body['status'] !== undefined) {
    const status = body['status'];
    if (status !== 'active' && status !== 'archived') fail(400, 'invalid_status');
    if (status === 'active') {
      const cls = await getClass(ctx, scope, (await ctx.db.prepare('SELECT class_id FROM users WHERE id = ?').bind(st.id).first<{ class_id: string }>())!.class_id);
      if (cls.status !== 'active') fail(409, 'class_archived');
    }
    await set('status = ?, archived_at = ?', status as string, status === 'archived' ? ctx.now : null);
    if (status === 'archived') await revokeAllSessions(ctx, st.id);
    changed.push('status');
  }
  if (changed.includes('login')) await revokeAllSessions(ctx, st.id);
  await audit(ctx, s.user.id, 'student.update', 'user', st.id, scope, { fields: changed, ...(body['status'] !== undefined ? { status: body['status'] } : {}) });
  return json({ ok: true });
}

export async function setStudentPassword(ctx: Ctx, s: Session, id: string, body: Record<string, unknown>) {
  const scope = await teacherScope(ctx, s, body['teacherId']);
  const st = await getStudent(ctx, scope, id);
  await setPassword(ctx, st.id, body);
  await audit(ctx, s.user.id, 'student.password', 'user', st.id, scope);
  return json({ ok: true });
}

async function setPassword(ctx: Ctx, userId: string, body: Record<string, unknown>) {
  const pw = passwordInput(body, minIterations(ctx.env));
  await ctx.db.prepare('UPDATE users SET pw_salt = ?, pw_iterations = ?, pw_verifier = ?, pw_changed_at = ?, updated_at = ? WHERE id = ?')
    .bind(pw.salt, pw.iterations, await verifierFor(ctx.pepper, pw.key), ctx.now, ctx.now, userId).run();
  await revokeAllSessions(ctx, userId);
}

/** Superadmin only; the caller must type the student's login as confirmation. */
export async function deleteStudent(ctx: Ctx, s: Session, id: string, body: Record<string, unknown>) {
  requireSuperadmin(s);
  const st = (await ctx.db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").bind(idParam(id)).first<UserRow>()) ?? fail(404, 'not_found');
  if (body['confirmLogin'] !== st.login) fail(400, 'confirmation_mismatch');
  await ctx.db.batch([
    ctx.db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(st.id),
    ctx.db.prepare('DELETE FROM users WHERE id = ?').bind(st.id),
  ]);
  await audit(ctx, s.user.id, 'student.delete', 'user', st.id, st.teacher_id, { login: st.login });
  return json({ ok: true });
}

// ---------------------------------------------------------------- teachers (superadmin)
export async function listTeachers(ctx: Ctx, s: Session) {
  requireSuperadmin(s);
  const { results } = await ctx.db.prepare(
    `SELECT u.*, (SELECT COUNT(*) FROM users x WHERE x.teacher_id = u.id AND x.status = 'active') AS student_count
     FROM users u WHERE u.role = 'teacher' ORDER BY u.status, u.full_name`).all<UserRow & { student_count: number }>();
  return json({ teachers: results.map((t) => ({ ...userOut(t), studentCount: t.student_count })) });
}

export async function createTeacher(ctx: Ctx, s: Session, body: Record<string, unknown>) {
  requireSuperadmin(s);
  const { login, norm } = normalizeLogin(body['login']);
  const name = fullName(body['fullName']);
  const pw = passwordInput(body, minIterations(ctx.env));
  await loginFree(ctx, norm, null);
  const id = uuid();
  await ctx.db.prepare(
    `INSERT INTO users (id, role, login, login_norm, full_name, pw_salt, pw_iterations, pw_verifier, pw_changed_at, created_at, created_by, updated_at)
     VALUES (?, 'teacher', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, login, norm, name, pw.salt, pw.iterations, await verifierFor(ctx.pepper, pw.key), ctx.now, ctx.now, s.user.id, ctx.now).run();
  await audit(ctx, s.user.id, 'teacher.create', 'user', id, id, { login });
  return json({ teacher: { id, login, fullName: name, status: 'active', studentCount: 0 } }, 201);
}

export async function updateTeacher(ctx: Ctx, s: Session, id: string, body: Record<string, unknown>) {
  requireSuperadmin(s);
  const t = (await ctx.db.prepare("SELECT * FROM users WHERE id = ? AND role = 'teacher'").bind(idParam(id)).first<UserRow>()) ?? fail(404, 'not_found');
  const changed: string[] = [];
  const set = async (sql: string, ...v: (string | number | null)[]) => { await ctx.db.prepare(`UPDATE users SET ${sql}, updated_at = ? WHERE id = ?`).bind(...v, ctx.now, t.id).run(); };
  if (body['fullName'] !== undefined) { await set('full_name = ?', fullName(body['fullName'])); changed.push('fullName'); }
  if (body['login'] !== undefined) {
    const { login, norm } = normalizeLogin(body['login']);
    await loginFree(ctx, norm, t.id);
    await set('login = ?, login_norm = ?', login, norm); changed.push('login');
    await revokeAllSessions(ctx, t.id);
  }
  if (body['status'] !== undefined) {
    const status = body['status'];
    if (status !== 'active' && status !== 'disabled') fail(400, 'invalid_status');
    await set('status = ?, archived_at = ?', status as string, status === 'disabled' ? ctx.now : null);
    if (status === 'disabled') await revokeAllSessions(ctx, t.id); // students are blocked at request time
    changed.push('status');
  }
  await audit(ctx, s.user.id, 'teacher.update', 'user', t.id, t.id, { fields: changed, ...(body['status'] !== undefined ? { status: body['status'] } : {}) });
  return json({ ok: true });
}

export async function setTeacherPassword(ctx: Ctx, s: Session, id: string, body: Record<string, unknown>) {
  requireSuperadmin(s);
  const t = (await ctx.db.prepare("SELECT id FROM users WHERE id = ? AND role = 'teacher'").bind(idParam(id)).first<{ id: string }>()) ?? fail(404, 'not_found');
  await setPassword(ctx, t.id, body);
  await audit(ctx, s.user.id, 'teacher.password', 'user', t.id, t.id);
  return json({ ok: true });
}

export async function listAudit(ctx: Ctx, s: Session, q: URLSearchParams) {
  requireSuperadmin(s);
  const before = Number(q.get('before') ?? Number.MAX_SAFE_INTEGER);
  const { results } = await ctx.db.prepare(
    `SELECT a.*, u.login AS actor_login FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id WHERE a.id < ? ORDER BY a.id DESC LIMIT 50`)
    .bind(Number.isFinite(before) ? before : Number.MAX_SAFE_INTEGER).all<Record<string, unknown>>();
  return json({ entries: results.map((r) => ({ id: r['id'], at: r['at'], actor: r['actor_login'] ?? null, action: r['action'], targetType: r['target_type'], targetId: r['target_id'], details: r['details'] ? JSON.parse(r['details'] as string) : null })) });
}

// ---------------------------------------------------------------- first superadmin / recovery
/**
 * POST /api/setup. With SETUP_CODE and no superadmin yet: creates the superadmin.
 * With a valid one-time recovery code (issued by the admin-recovery workflow): sets a new password
 * for the given superadmin login and revokes all its sessions.
 */
export async function setup(ctx: Ctx, body: Record<string, unknown>) {
  const code = body['code'];
  if (typeof code !== 'string' || code.length < 16) fail(403, 'invalid_code');
  const { login, norm } = normalizeLogin(body['login']);
  const pw = passwordInput(body, minIterations(ctx.env));
  const admin = await ctx.db.prepare("SELECT id FROM users WHERE role = 'superadmin' AND status = 'active' LIMIT 1").first<{ id: string }>();
  if (!admin) {
    if (!ctx.env.SETUP_CODE || !timingSafeEqual(code as string, ctx.env.SETUP_CODE)) fail(403, 'invalid_code');
    const name = fullName(body['fullName']);
    await loginFree(ctx, norm, null);
    const id = uuid();
    await ctx.db.prepare(
      `INSERT INTO users (id, role, login, login_norm, full_name, pw_salt, pw_iterations, pw_verifier, pw_changed_at, created_at, updated_at)
       VALUES (?, 'superadmin', ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, login, norm, name, pw.salt, pw.iterations, await verifierFor(ctx.pepper, pw.key), ctx.now, ctx.now, ctx.now).run();
    await audit(ctx, id, 'superadmin.setup', 'user', id, null, { login });
    return json({ ok: true, created: true }, 201);
  }
  const hash = await sha256(code as string);
  const rc = await ctx.db.prepare('SELECT * FROM recovery_codes WHERE code_hash = ?').bind(hash).first<{ expires_at: number; used_at: number | null }>();
  if (!rc || rc.used_at !== null || rc.expires_at <= ctx.now) fail(403, 'invalid_code');
  const target = (await ctx.db.prepare("SELECT id FROM users WHERE login_norm = ? AND role = 'superadmin'").bind(norm).first<{ id: string }>()) ?? fail(403, 'invalid_code');
  await ctx.db.prepare('UPDATE recovery_codes SET used_at = ? WHERE code_hash = ?').bind(ctx.now, hash).run();
  await ctx.db.prepare("UPDATE users SET status = 'active', updated_at = ? WHERE id = ?").bind(ctx.now, target.id).run();
  await setPassword(ctx, target.id, body);
  await audit(ctx, target.id, 'superadmin.recover', 'user', target.id, null);
  return json({ ok: true, created: false });
}
