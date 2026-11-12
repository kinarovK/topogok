// Teacher area (own classes and students) and superadmin area (teachers, any teacher's scope, audit).
// The server enforces every rule; this UI only offers the actions the role may use.
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAccount } from '../../account/account.tsx';
import { api, type AuditEntry, type ClassItem, type Student, type Teacher } from '../../account/api.ts';
import { useSettings } from '../../app/settings.tsx';
import { Button } from '../../components/ui.tsx';
import app from '../../app/app.module.css';
import { Field, TextInput, formatDate, useAction, usePasswordFields } from './common.tsx';
import { ResultsPanel } from './ResultsPanel.tsx';
import s from './account.module.css';

type Tab = 'students' | 'classes' | 'results' | 'teachers' | 'audit';

export function ManageScreen({ onBack }: { onBack: () => void }) {
  const { t } = useSettings();
  const { me } = useAccount();
  const isAdmin = me?.role === 'superadmin';
  const [tab, setTab] = useState<Tab>(isAdmin ? 'teachers' : 'students');
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const loadTeachers = useCallback(() => (isAdmin ? api.teachers() : Promise.resolve([])).then((list) => {
    setTeachers(list);
    setTeacherId((cur) => cur ?? list.find((x) => x.status === 'active')?.id ?? list[0]?.id ?? null);
  }), [isAdmin]);
  useEffect(() => { loadTeachers().catch(() => undefined); }, [loadTeachers]);
  if (!me || me.role === 'student') return null;
  const scope = isAdmin ? teacherId : null;
  const tabs: Tab[] = isAdmin ? ['teachers', 'students', 'classes', 'results', 'audit'] : ['students', 'classes', 'results'];
  const scoped = tab === 'students' || tab === 'classes' || tab === 'results';
  return (
    <div className={app.page}>
      <h1>{isAdmin ? t('account.admin') : t('account.manage')}</h1>
      <div className={s.tabs} role="group">
        {tabs.map((x) => <Button key={x} aria-pressed={tab === x} onClick={() => setTab(x)}>{t(`account.${x}`)}</Button>)}
      </div>
      {isAdmin && scoped && (
        <Field label={t('account.chooseTeacher')}>
          <select value={teacherId ?? ''} onChange={(e) => setTeacherId(e.target.value || null)}>
            {teachers.map((x) => <option key={x.id} value={x.id}>{x.fullName} ({x.login}){x.status === 'disabled' ? ` – ${t('account.statusDisabled')}` : ''}</option>)}
          </select>
        </Field>
      )}
      {tab === 'teachers' && isAdmin && <TeachersPanel teachers={teachers} reload={loadTeachers} />}
      {scoped && (!isAdmin || scope) && (tab === 'students' ? <StudentsPanel key={scope ?? 'own'} scope={scope} isAdmin={isAdmin} />
        : tab === 'classes' ? <ClassesPanel key={scope ?? 'own'} scope={scope} /> : <ResultsPanel key={scope ?? 'own'} scope={scope} />)}
      {tab === 'audit' && isAdmin && <AuditPanel />}
      <div className={app.actions}><Button onClick={onBack}>{t('common.back')}</Button></div>
    </div>
  );
}

// ---------------------------------------------------------------- classes
function ClassesPanel({ scope }: { scope: string | null }) {
  const { t } = useSettings();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const action = useAction();
  const reload = useCallback(async () => setClasses(await api.classes(scope)), [scope]);
  useEffect(() => { void action.run(reload); }, [reload]); // eslint-disable-line react-hooks/exhaustive-deps
  const create = (e: FormEvent) => { e.preventDefault(); void action.run(async () => { await api.createClass(scope, name); setName(''); await reload(); return t('account.saved'); }); };
  return (
    <section aria-label={t('account.classes')}>
      <form className={s.toolbar} onSubmit={create}>
        <Field label={t('account.className')}><TextInput value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Button type="submit" variant="primary" disabled={action.busy || !name.trim()}>{t('account.newClass')}</Button>
      </form>
      {action.messages}
      {classes.length === 0 ? <p className={s.hint}>{t('account.empty')}</p> : (
        <ul className={s.list}>
          {classes.map((c) => (
            <li key={c.id} className={s.item} data-class={c.name}>
              {editing === c.id ? (
                <form className={s.toolbar} onSubmit={(e) => { e.preventDefault(); void action.run(async () => { await api.updateClass(scope, c.id, { name: editName }); setEditing(null); await reload(); return t('account.saved'); }); }}>
                  <Field label={t('account.className')}><TextInput value={editName} onChange={(e) => setEditName(e.target.value)} /></Field>
                  <Button type="submit" variant="primary">{t('account.save')}</Button>
                  <Button onClick={() => setEditing(null)}>{t('account.cancel')}</Button>
                </form>
              ) : (
                <>
                  <div className={s.itemHead}>
                    <strong>{c.name}</strong>
                    <span className={s.meta}>{t('account.studentCount', { count: c.studentCount })}{c.status === 'archived' ? ` · ${t('account.statusArchived')}` : ''}</span>
                  </div>
                  <div className={s.itemActions}>
                    <Button onClick={() => { setEditing(c.id); setEditName(c.name); }}>{t('account.rename')}</Button>
                    <Button onClick={() => void action.run(async () => { await api.updateClass(scope, c.id, { status: c.status === 'active' ? 'archived' : 'active' }); await reload(); return t('account.saved'); })}>
                      {c.status === 'active' ? t('account.archive') : t('account.restore')}
                    </Button>
                    <Button onClick={() => void action.run(async () => { await api.deleteClass(scope, c.id); await reload(); return t('account.saved'); })}>{t('account.delete')}</Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- students
function StudentsPanel({ scope, isAdmin }: { scope: string | null; isAdmin: boolean }) {
  const { t, locale } = useSettings();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [status, setStatus] = useState<'active' | 'archived' | 'all'>('active');
  const [classFilter, setClassFilter] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<{ id: string; mode: 'edit' | 'password' | 'delete' } | null>(null);
  const action = useAction();
  const reload = useCallback(async () => {
    const [c, st] = await Promise.all([api.classes(scope), api.students(scope, status, classFilter || null)]);
    setClasses(c); setStudents(st);
  }, [scope, status, classFilter]);
  useEffect(() => { void action.run(reload); }, [reload]); // eslint-disable-line react-hooks/exhaustive-deps
  const activeClasses = classes.filter((c) => c.status === 'active');
  return (
    <section aria-label={t('account.students')}>
      <div className={s.toolbar}>
        <Field label={t('account.class')}>
          <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
            <option value="">{t('account.allClasses')}</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label={t('account.status')}>
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="active">{t('account.statusActive')}</option>
            <option value="archived">{t('account.statusArchived')}</option>
            <option value="all">{t('account.statusAll')}</option>
          </select>
        </Field>
        <Button variant="primary" onClick={() => setCreating((v) => !v)} disabled={activeClasses.length === 0}>{t('account.newStudent')}</Button>
      </div>
      {activeClasses.length === 0 && <p className={s.hint}>{t('account.noClassesYet')}</p>}
      {creating && <StudentForm scope={scope} classes={activeClasses} onDone={async () => { setCreating(false); await reload(); }} onCancel={() => setCreating(false)} />}
      {action.messages}
      {students.length === 0 ? <p className={s.hint}>{t('account.empty')}</p> : (
        <ul className={s.list}>
          {students.map((st) => (
            <li key={st.id} className={s.item} data-student={st.login}>
              <div className={s.itemHead}>
                <strong>{st.fullName}</strong>
                <span className={s.meta}>{st.login} · {st.className}{st.status === 'archived' ? ` · ${t('account.statusArchived')}` : ''}</span>
              </div>
              <span className={s.meta}>{formatDate(st.createdAt, locale)}</span>
              <div className={s.itemActions}>
                <Button onClick={() => setOpen(open?.id === st.id && open.mode === 'edit' ? null : { id: st.id, mode: 'edit' })}>{t('account.edit')}</Button>
                <Button onClick={() => setOpen(open?.id === st.id && open.mode === 'password' ? null : { id: st.id, mode: 'password' })}>{t('account.setPassword')}</Button>
                <Button onClick={() => void action.run(async () => { await api.updateStudent(scope, st.id, { status: st.status === 'active' ? 'archived' : 'active' }); await reload(); return t('account.saved'); })}>
                  {st.status === 'active' ? t('account.archive') : t('account.restore')}
                </Button>
                {isAdmin && <Button onClick={() => setOpen({ id: st.id, mode: 'delete' })}>{t('account.deleteForever')}</Button>}
              </div>
              {open?.id === st.id && open.mode === 'edit' && <StudentForm scope={scope} classes={activeClasses} student={st} onDone={async () => { setOpen(null); await reload(); }} onCancel={() => setOpen(null)} />}
              {open?.id === st.id && open.mode === 'password' && <PasswordForm onSave={(p) => api.setStudentPassword(scope, st.id, p)} onDone={() => setOpen(null)} />}
              {open?.id === st.id && open.mode === 'delete' && <DeleteForm login={st.login} onDelete={async (typed) => { await api.deleteStudent(st.id, typed); setOpen(null); await reload(); }} onCancel={() => setOpen(null)} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StudentForm({ scope, classes, student, onDone, onCancel }: { scope: string | null; classes: ClassItem[]; student?: Student; onDone: () => Promise<void>; onCancel: () => void }) {
  const { t } = useSettings();
  const [fullName, setFullName] = useState(student?.fullName ?? '');
  const [login, setLogin] = useState(student?.login ?? '');
  const [classId, setClassId] = useState(student?.classId ?? classes[0]?.id ?? '');
  const pw = usePasswordFields();
  const action = useAction();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void action.run(async () => {
      if (student) {
        const patch: { fullName?: string; login?: string; classId?: string } = {};
        if (fullName !== student.fullName) patch.fullName = fullName;
        if (login.trim().toLowerCase() !== student.login) patch.login = login.trim();
        if (classId !== student.classId) patch.classId = classId;
        await api.updateStudent(scope, student.id, patch);
      } else {
        await api.createStudent(scope, { login: login.trim(), fullName, classId, password: pw.validate() });
      }
      await onDone();
    });
  };
  return (
    <form className={s.form} onSubmit={submit}>
      <Field label={t('account.fullName')}><TextInput autoComplete="off" value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>
      <Field label={t('account.loginField')}><TextInput autoComplete="off" value={login} onChange={(e) => setLogin(e.target.value)} /></Field>
      <Field label={t('account.class')}>
        <select value={classId} onChange={(e) => setClassId(e.target.value)}>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      {!student && pw.fields}
      {action.messages}
      <div className={app.actions}>
        <Button type="submit" variant="primary" disabled={action.busy}>{action.busy ? t('account.working') : student ? t('account.save') : t('account.create')}</Button>
        <Button onClick={onCancel}>{t('account.cancel')}</Button>
      </div>
    </form>
  );
}

function PasswordForm({ onSave, onDone }: { onSave: (password: string) => Promise<unknown>; onDone: () => void }) {
  const { t } = useSettings();
  const pw = usePasswordFields();
  const action = useAction();
  return (
    <form className={s.form} onSubmit={(e) => { e.preventDefault(); void action.run(async () => { await onSave(pw.validate()); pw.reset(); return t('account.passwordChanged'); }); }}>
      {pw.fields}
      {action.messages}
      <div className={app.actions}>
        <Button type="submit" variant="primary" disabled={action.busy}>{action.busy ? t('account.working') : t('account.save')}</Button>
        <Button onClick={onDone}>{t('common.close')}</Button>
      </div>
    </form>
  );
}

function DeleteForm({ login, onDelete, onCancel }: { login: string; onDelete: (typed: string) => Promise<void>; onCancel: () => void }) {
  const { t } = useSettings();
  const [typed, setTyped] = useState('');
  const action = useAction();
  return (
    <form className={s.form} onSubmit={(e) => { e.preventDefault(); void action.run(() => onDelete(typed)); }}>
      <Field label={t('account.confirmDelete', { login })}><TextInput value={typed} onChange={(e) => setTyped(e.target.value)} /></Field>
      {action.messages}
      <div className={app.actions}>
        <Button type="submit" disabled={action.busy || typed !== login}>{t('account.deleteForever')}</Button>
        <Button variant="primary" onClick={onCancel}>{t('account.cancel')}</Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- teachers (superadmin)
function TeachersPanel({ teachers, reload }: { teachers: Teacher[]; reload: () => Promise<void> }) {
  const { t } = useSettings();
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<{ id: string; mode: 'edit' | 'password' } | null>(null);
  const action = useAction();
  return (
    <section aria-label={t('account.teachers')}>
      <div className={s.toolbar}><Button variant="primary" onClick={() => setCreating((v) => !v)}>{t('account.newTeacher')}</Button></div>
      {creating && <TeacherForm onDone={async () => { setCreating(false); await reload(); }} onCancel={() => setCreating(false)} />}
      {action.messages}
      {teachers.length === 0 ? <p className={s.hint}>{t('account.empty')}</p> : (
        <ul className={s.list}>
          {teachers.map((x) => (
            <li key={x.id} className={s.item} data-teacher={x.login}>
              <div className={s.itemHead}>
                <strong>{x.fullName}</strong>
                <span className={s.meta}>{x.login} · {t('account.studentCount', { count: x.studentCount })}{x.status === 'disabled' ? ` · ${t('account.statusDisabled')}` : ''}</span>
              </div>
              <div className={s.itemActions}>
                <Button onClick={() => setOpen(open?.id === x.id && open.mode === 'edit' ? null : { id: x.id, mode: 'edit' })}>{t('account.edit')}</Button>
                <Button onClick={() => setOpen(open?.id === x.id && open.mode === 'password' ? null : { id: x.id, mode: 'password' })}>{t('account.setPassword')}</Button>
                <Button onClick={() => void action.run(async () => { await api.updateTeacher(x.id, { status: x.status === 'active' ? 'disabled' : 'active' }); await reload(); return t('account.saved'); })}>
                  {x.status === 'active' ? t('account.disable') : t('account.enable')}
                </Button>
              </div>
              {open?.id === x.id && open.mode === 'edit' && <TeacherForm teacher={x} onDone={async () => { setOpen(null); await reload(); }} onCancel={() => setOpen(null)} />}
              {open?.id === x.id && open.mode === 'password' && <PasswordForm onSave={(p) => api.setTeacherPassword(x.id, p)} onDone={() => setOpen(null)} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TeacherForm({ teacher, onDone, onCancel }: { teacher?: Teacher; onDone: () => Promise<void>; onCancel: () => void }) {
  const { t } = useSettings();
  const [fullName, setFullName] = useState(teacher?.fullName ?? '');
  const [login, setLogin] = useState(teacher?.login ?? '');
  const pw = usePasswordFields();
  const action = useAction();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void action.run(async () => {
      if (teacher) {
        const patch: { fullName?: string; login?: string } = {};
        if (fullName !== teacher.fullName) patch.fullName = fullName;
        if (login.trim().toLowerCase() !== teacher.login) patch.login = login.trim();
        await api.updateTeacher(teacher.id, patch);
      } else {
        await api.createTeacher({ login: login.trim(), fullName, password: pw.validate() });
      }
      await onDone();
    });
  };
  return (
    <form className={s.form} onSubmit={submit}>
      <Field label={t('account.fullName')}><TextInput autoComplete="off" value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>
      <Field label={t('account.loginField')}><TextInput autoComplete="off" value={login} onChange={(e) => setLogin(e.target.value)} /></Field>
      {!teacher && pw.fields}
      {action.messages}
      <div className={app.actions}>
        <Button type="submit" variant="primary" disabled={action.busy}>{action.busy ? t('account.working') : teacher ? t('account.save') : t('account.create')}</Button>
        <Button onClick={onCancel}>{t('account.cancel')}</Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- audit (superadmin)
function AuditPanel() {
  const { t, locale } = useSettings();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const action = useAction();
  useEffect(() => { void action.run(async () => setEntries(await api.audit(null))); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const more = () => void action.run(async () => { const last = entries[entries.length - 1]; if (last) setEntries([...entries, ...(await api.audit(last.id))]); });
  return (
    <section aria-label={t('account.audit')}>
      {action.messages}
      <table className={s.auditTable}>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td>{formatDate(e.at, locale)}</td>
              <td>{e.actor ?? '—'}</td>
              <td><code>{e.action}</code></td>
              <td>{e.details ? Object.entries(e.details).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`).join('; ') : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {entries.length > 0 && entries.length % 50 === 0 && <Button onClick={more}>{t('account.loadMore')}</Button>}
    </section>
  );
}
