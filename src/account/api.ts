import type { IntegrityLog } from '../../shared/integrity.ts';
// Browser client for /api/*. Same origin, cookie session (HttpOnly; the page never sees the token).
import { deriveKey, passwordPayload } from '../../shared/kdf.ts';

export type Role = 'superadmin' | 'teacher' | 'student';
export type TopicSetting = { disabled: string[]; version: number };
export type Me = { id: string; role: Role; login: string; fullName: string; teacherName?: string | null; className?: string | null; topicSettings?: Record<string, TopicSetting> };
export type ClassItem = { id: string; name: string; status: 'active' | 'archived'; studentCount: number };
export type Student = { id: string; login: string; fullName: string; status: 'active' | 'archived'; classId: string; className: string | null; createdAt: number; passwordChangedAt: number };
export type Teacher = { id: string; login: string; fullName: string; status: 'active' | 'disabled'; studentCount: number; createdAt: number; passwordChangedAt: number };
export type AuditEntry = { id: number; at: number; actor: string | null; action: string; targetType: string | null; targetId: string | null; details: Record<string, unknown> | null };

export type WireEvent = { type: 'SELECT'; t: number; f: string } | { type: 'CONFIRM' | 'REVEAL' | 'NEXT' | 'TIME_CHECK'; t: number };
export type AttemptStart = { topicId: string; dataVersion: string; mode: 'practice' | 'assessment'; count: number | 'all'; showElapsed?: boolean; timeLimitMinutes?: number | null; seed: number; settingsVersion?: number };
export type AttemptResult = { attemptId: string; status: AttemptStatus; reviewStatus: 'pending' | 'approved' | 'rejected' | null; percent: number | null; points: number | null; maxPoints: number | null; correct: number | null; total: number | null; grade: number | null; durationMs: number | null };
export type AttemptStatus = 'in_progress' | 'started' | 'finished' | 'expired' | 'abandoned' | 'invalid';
export type ReportFilters = { teacherId?: string | null; classId?: string | null; studentId?: string | null; topicId?: string | null; mode?: string | null; status?: string | null; from?: number | null; to?: number | null };
export type ReportSummary = {
  studentId: string; fullName: string; login: string; className: string; mode: 'practice' | 'assessment';
  started: number; finished: number; expired: number; abandoned: number; invalid: number; inProgress: number;
  durationMs: number; visibleMs: number; bestFullPercent: number | null; bestFullGrade: number | null;
  last: { percent: number | null; points: number | null; maxPoints: number | null; correct: number | null; total: number | null; grade: number | null; topicId: string } | null;
};
export type ReportAttempt = {
  id: string; studentId: string; fullName: string; login: string; className: string; topicId: string; mode: 'practice' | 'assessment';
  count: string; isFull: boolean; timeLimitMinutes: number | null; status: AttemptStatus; startedAt: number; durationMs: number | null; visibleMs: number | null;
  timingComplete: boolean; lateFinish: boolean; percent: number | null; points: number | null; maxPoints: number | null; correct: number | null; total: number | null;
  grade: number | null; invalidReason: string | null; restricted: boolean;
  leaderboardCandidate: boolean; lbExcluded: boolean; lbExcludeReason: string | null; reviewStatus: 'pending' | 'approved' | 'rejected' | null;
  reviewReason: string | null; integrityVersion: number;
  integrity: { hiddenCount: number; hiddenMs: number; blurCount: number; blurMs: number; offlineCount: number; offlineMs: number; log: IntegrityLog | null } | null;
};
export type BoardRow = { rank: number; studentId: string; fullName: string; correct: number; total: number; percent: number; durationMs: number };
export type Board = { generatedAt: number; periodStart: number | null; rows: BoardRow[]; myStudentId: string | null };
export type PersonalRecord = { correct: number; total: number; percent: number; durationMs: number };

export type Report = { generatedAt: number; summary: ReportSummary[] | null; attempts: ReportAttempt[]; nextBefore: number | null };

export class ApiFailure extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfterSeconds: number | undefined;
  /** The rest of the error body (e.g. the current setting on a conflict). */
  readonly extra: Record<string, unknown> | undefined;
  constructor(status: number, code: string, retryAfterSeconds?: number, extra?: Record<string, unknown>) {
    super(code);
    this.extra = extra;
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
  if (!res.ok) throw new ApiFailure(res.status, typeof data['error'] === 'string' ? data['error'] : 'internal', typeof data['retryAfterSeconds'] === 'number' ? data['retryAfterSeconds'] : undefined, data);
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
  topicSettings: (teacherId: string | null) => call<{ settings: Record<string, TopicSetting> }>('GET', `/api/topic-settings${qs({ teacherId })}`).then((r) => r.settings),
  saveTopicSetting: (teacherId: string | null, topicId: string, disabled: string[], baseVersion: number) =>
    call<{ setting: TopicSetting }>('PUT', `/api/topic-settings/${topicId}`, { ...scope(teacherId), disabled, baseVersion }).then((r) => r.setting),
  leaderboard: (topicId: string, teacherId: string | null) => call<Board>('GET', `/api/leaderboard${qs({ topicId, teacherId })}`),
  record: (topicId: string) => call<{ record: PersonalRecord | null; pendingReview: boolean }>('GET', `/api/record${qs({ topicId })}`),
  newPeriod: (teacherId: string | null, topicId: string) => call('POST', '/api/leaderboard/periods', { ...scope(teacherId), topicId, confirm: true }),
  review: (teacherId: string | null, id: string, decision: 'approved' | 'rejected', reason: string) =>
    call('POST', `/api/report/attempts/${id}/review`, { ...scope(teacherId), decision, reason }),
  setLeaderboardExcluded: (teacherId: string | null, id: string, excluded: boolean, reason = '') =>
    call('POST', `/api/report/attempts/${id}/leaderboard`, { ...scope(teacherId), excluded, ...(excluded ? { reason } : {}) }),
  startAttempt: (body: AttemptStart) => call<{ attemptId: string }>('POST', '/api/attempts', body),
  finishAttempt: (id: string, body: { reason: 'completed' | 'quit'; events?: WireEvent[]; visibleMs?: number; integrity?: IntegrityLog }) =>
    call<{ result: AttemptResult }>('POST', `/api/attempts/${id}/finish`, body).then((r) => r.result),
  report: (f: ReportFilters, before: number | null = null) => call<Report>('GET', `/api/report${qs({
    teacherId: f.teacherId, classId: f.classId, studentId: f.studentId, topicId: f.topicId, mode: f.mode, status: f.status,
    from: f.from ? String(f.from) : null, to: f.to ? String(f.to) : null, before: before ? String(before) : null,
  })}`),
  deleteAttempt: (teacherId: string | null, id: string, reason: string) => call('DELETE', `/api/report/attempts/${id}`, { ...scope(teacherId), reason }),
  audit: (before: number | null) => call<{ entries: AuditEntry[] }>('GET', `/api/audit${qs({ before: before ? String(before) : null })}`).then((r) => r.entries),
};
