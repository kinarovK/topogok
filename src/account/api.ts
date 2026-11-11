// Browser client for /api/*. Same origin, cookie session (HttpOnly; the page never sees the token).
import { deriveKey, passwordPayload } from '../../shared/kdf.ts';

export type Role = 'superadmin' | 'teacher' | 'student';
export type Me = { id: string; role: Role; login: string; fullName: string; teacherName?: string | null; className?: string | null };
export type ClassItem = { id: string; name: string; status: 'active' | 'archived'; studentCount: number };
export type Student = { id: string; login: string; fullName: string; status: 'active' | 'archived'; classId: string; className: string | null; createdAt: number; passwordChangedAt: number };
export type Teacher = { id: string; login: string; fullName: string; status: 'active' | 'disabled'; studentCount: number; createdAt: number; passwordChangedAt: number };
export type AuditEntry = { id: number; at: number; actor: string | null; action: string; targetType: string | null; targetId: string | null; details: Record<string, unknown> | null };

export class ApiFailure extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfterSeconds: number | undefined;
  constructor(status: number, code: string, retryAfterSeconds?: number) {
    super(code);
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'content-type': 'application/json', 'x-topogok': '1' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiFailure(0, 'offline');
  }
  let data: Record<string, unknown> = {};
  try { data = (await res.json()) as Record<string, unknown>; } catch { /* not JSON (e.g. no API on this host) */ }
  if (!res.ok) throw new ApiFailure(res.status, typeof data['error'] === 'string' ? data['error'] : 'internal', typeof data['retryAfterSeconds'] === 'number' ? data['retryAfterSeconds'] : undefined);
  return data as T;
}

const scope = (teacherId: string | null) => (teacherId ? { teacherId } : {});
const qs = (params: Record<string, string | null | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const api = {
  me: () => call<{ user: Me | null }>('GET', '/api/me').then((r) => r.user),
  async login(login: string, password: string) {
    const { salt, iterations } = await call<{ salt: string; iterations: number }>('POST', '/api/auth/salt', { login });
    const key = await deriveKey(password, salt, iterations);
    await call('POST', '/api/auth/login', { login, key });
  },
  logout: () => call('POST', '/api/auth/logout'),
  async setup(code: string, login: string, fullName: string, password: string) {
    return call<{ created: boolean }>('POST', '/api/setup', { code, login, fullName, ...(await passwordPayload(password)) });
  },

  classes: (teacherId: string | null) => call<{ classes: ClassItem[] }>('GET', `/api/classes${qs({ teacherId })}`).then((r) => r.classes),
  createClass: (teacherId: string | null, name: string) => call('POST', '/api/classes', { ...scope(teacherId), name }),
  updateClass: (teacherId: string | null, id: string, patch: { name?: string; status?: 'active' | 'archived' }) => call('PATCH', `/api/classes/${id}`, { ...scope(teacherId), ...patch }),
  deleteClass: (teacherId: string | null, id: string) => call('DELETE', `/api/classes/${id}${qs({ teacherId })}`),

  students: (teacherId: string | null, status: 'active' | 'archived' | 'all', classId: string | null) =>
    call<{ students: Student[] }>('GET', `/api/students${qs({ teacherId, status, classId })}`).then((r) => r.students),
  async createStudent(teacherId: string | null, input: { login: string; fullName: string; classId: string; password: string }) {
    return call('POST', '/api/students', { ...scope(teacherId), login: input.login, fullName: input.fullName, classId: input.classId, ...(await passwordPayload(input.password)) });
  },
  updateStudent: (teacherId: string | null, id: string, patch: { fullName?: string; login?: string; classId?: string; status?: 'active' | 'archived' }) =>
    call('PATCH', `/api/students/${id}`, { ...scope(teacherId), ...patch }),
  async setStudentPassword(teacherId: string | null, id: string, password: string) {
    return call('POST', `/api/students/${id}/password`, { ...scope(teacherId), ...(await passwordPayload(password)) });
  },
  deleteStudent: (id: string, confirmLogin: string) => call('DELETE', `/api/students/${id}`, { confirmLogin }),

  teachers: () => call<{ teachers: Teacher[] }>('GET', '/api/teachers').then((r) => r.teachers),
  async createTeacher(input: { login: string; fullName: string; password: string }) {
    return call('POST', '/api/teachers', { login: input.login, fullName: input.fullName, ...(await passwordPayload(input.password)) });
  },
  updateTeacher: (id: string, patch: { fullName?: string; login?: string; status?: 'active' | 'disabled' }) => call('PATCH', `/api/teachers/${id}`, patch),
  async setTeacherPassword(id: string, password: string) {
    return call('POST', `/api/teachers/${id}/password`, await passwordPayload(password));
  },
  audit: (before: number | null) => call<{ entries: AuditEntry[] }>('GET', `/api/audit${qs({ before: before ? String(before) : null })}`).then((r) => r.entries),
};
