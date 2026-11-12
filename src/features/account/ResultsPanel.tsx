// Teacher results (F3): per-student summary and the list of rounds. One request per refresh, at most every 10 s.
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, ApiFailure, type ClassItem, type Report, type ReportAttempt, type ReportFilters, type ReportSummary, type Student } from '../../account/api.ts';
import { useSettings } from '../../app/settings.tsx';
import { Button } from '../../components/ui.tsx';
import { TOPICS } from '../../data/topicRegistry.ts';
import { formatDuration } from '../../domain/clock.ts';
import { formatPercent } from '../../i18n/translator.ts';
import { Field, TextInput, formatDate, useAction, useErrorText } from './common.tsx';
import s from './account.module.css';

const REFRESH_GAP = 10_000;
const dayStart = (v: string) => (v ? new Date(`${v}T00:00:00`).getTime() : null);

export function ResultsPanel({ scope }: { scope: string | null }) {
  const { t, locale } = useSettings();
  const errorText = useErrorText();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [f, setF] = useState({ classId: '', studentId: '', topicId: '', mode: '', status: '', from: '', to: '' });
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([api.classes(scope), api.students(scope, 'all', null)]).then(([c, st]) => { if (alive) { setClasses(c); setStudents(st); } }, () => undefined);
    return () => { alive = false; };
  }, [scope]);

  const filters = useCallback((): ReportFilters => ({
    teacherId: scope, classId: f.classId || null, studentId: f.studentId || null, topicId: f.topicId || null, mode: f.mode || null, status: f.status || null,
    from: dayStart(f.from), to: f.to ? dayStart(f.to)! + 86_400_000 : null,
  }), [scope, f]);

  const refresh = useCallback(() => {
    setBusy(true); setError(null); setCooldown(true);
    window.setTimeout(() => setCooldown(false), REFRESH_GAP);
    api.report(filters()).then(
      (r) => { setReport(r); setBusy(false); },
      (e: unknown) => {
        setBusy(false);
        setError(e instanceof ApiFailure && e.code === 'rate_limited' ? t('report.wait', { seconds: e.retryAfterSeconds ?? 10 }) : errorText(e));
      },
    );
  }, [filters, t, errorText]);

  // First load when the tab opens; later loads only on the Refresh button (keeps requests low).
  useEffect(() => { void Promise.resolve().then(refresh); }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps

  const more = () => {
    if (!report?.nextBefore) return;
    setBusy(true);
    api.report(filters(), report.nextBefore).then(
      (r) => { setReport((cur) => cur && { ...cur, attempts: [...cur.attempts, ...r.attempts], nextBefore: r.nextBefore }); setBusy(false); },
      (e: unknown) => { setBusy(false); setError(errorText(e)); },
    );
  };

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((cur) => ({ ...cur, [k]: e.target.value, ...(k === 'classId' ? { studentId: '' } : {}) }));
  const shownStudents = students.filter((x) => !f.classId || x.classId === f.classId);
  const topicName = (id: string) => TOPICS.find((x) => x.id === id)?.title[locale] ?? id;

  return (
    <section aria-label={t('report.title')} data-testid="results-panel">
      <form className={s.toolbar} onSubmit={(e: FormEvent) => { e.preventDefault(); refresh(); }}>
        <Field label={t('account.class')}>
          <select value={f.classId} onChange={set('classId')}>
            <option value="">{t('account.allClasses')}</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label={t('report.student')}>
          <select value={f.studentId} onChange={set('studentId')}>
            <option value="">{t('report.allStudents')}</option>
            {shownStudents.map((x) => <option key={x.id} value={x.id}>{x.fullName} ({x.login})</option>)}
          </select>
        </Field>
        <Field label={t('report.topic')}>
          <select value={f.topicId} onChange={set('topicId')}>
            <option value="">{t('report.allTopics')}</option>
            {TOPICS.map((x) => <option key={x.id} value={x.id}>{x.title[locale]}</option>)}
          </select>
        </Field>
        <Field label={t('report.mode')}>
          <select value={f.mode} onChange={set('mode')}>
            <option value="">{t('report.allModes')}</option>
            <option value="practice">{t('game.modePractice')}</option>
            <option value="assessment">{t('game.modeAssessment')}</option>
          </select>
        </Field>
        <Field label={t('account.status')}>
          <select value={f.status} onChange={set('status')}>
            <option value="">{t('report.allStatuses')}</option>
            {(['finished', 'expired', 'abandoned', 'invalid', 'in_progress'] as const).map((x) => <option key={x} value={x}>{t(`report.status.${x}`)}</option>)}
          </select>
        </Field>
        <Field label={t('report.from')}><input type="date" value={f.from} onChange={set('from')} /></Field>
        <Field label={t('report.to')}><input type="date" value={f.to} onChange={set('to')} /></Field>
        <Button type="submit" variant="primary" disabled={busy || cooldown}>{t('report.refresh')}</Button>
      </form>
      {report && <p className={s.hint} data-testid="report-updated">{t('report.updated', { time: formatDate(report.generatedAt, locale) })}</p>}
      {error && <p className={s.error} role="alert">{error}</p>}

      {report?.summary && (
        <>
          <h2>{t('report.summary')}</h2>
          {report.summary.length === 0 ? <p className={s.hint}>{t('account.empty')}</p> : (
            <ul className={s.list} data-testid="report-summary">
              {report.summary.map((r) => <SummaryItem key={`${r.studentId}:${r.mode}`} r={r} topicName={topicName} />)}
            </ul>
          )}
        </>
      )}

      {report && (
        <>
          <h2>{t('report.rounds')}</h2>
          {report.attempts.length === 0 ? <p className={s.hint}>{t('account.empty')}</p> : (
            <ul className={s.list} data-testid="report-attempts">
              {report.attempts.map((a) => (
                <AttemptItem key={a.id} a={a} topicName={topicName} scope={scope} open={deleting === a.id}
                  onOpen={() => setDeleting(deleting === a.id ? null : a.id)}
                  onDeleted={() => { setDeleting(null); setReport((cur) => cur && { ...cur, attempts: cur.attempts.filter((x) => x.id !== a.id) }); }} />
              ))}
            </ul>
          )}
          {report.nextBefore && <Button onClick={more} disabled={busy}>{t('account.loadMore')}</Button>}
        </>
      )}
    </section>
  );
}

function SummaryItem({ r, topicName }: { r: ReportSummary; topicName: (id: string) => string }) {
  const { t, locale } = useSettings();
  const last = r.last;
  const score = (x: { percent: number | null; points: number | null; maxPoints: number | null; grade: number | null }) =>
    [x.percent !== null ? formatPercent(locale, x.percent) : null, x.points !== null ? t('report.pointsShort', { points: x.points, max: x.maxPoints ?? 0 }) : null,
      x.grade !== null ? t('result.gradeValue', { grade: x.grade }) : null].filter(Boolean).join(' · ');
  return (
    <li className={s.item} data-student={r.login} data-mode={r.mode}>
      <div className={s.itemHead}>
        <strong>{r.fullName}</strong>
        <span className={s.meta}>{r.className} · {r.mode === 'practice' ? t('game.modePractice') : t('game.modeAssessment')}</span>
      </div>
      <span className={s.meta}>
        {t('report.counts', { started: r.started, finished: r.finished, expired: r.expired, abandoned: r.abandoned, invalid: r.invalid })}
        {r.inProgress > 0 ? ` · ${t('report.inProgress', { count: r.inProgress })}` : ''}
      </span>
      <span className={s.meta}>{t('report.time', { total: formatDuration(r.durationMs), visible: formatDuration(r.visibleMs) })}</span>
      {last && <span className={s.meta} data-testid="summary-last">{t('report.last')}: {score(last)} ({topicName(last.topicId)})</span>}
      <span className={s.meta} data-testid="summary-best">
        {t('report.bestFull')}: {r.bestFullPercent !== null ? `${formatPercent(locale, r.bestFullPercent)}${r.bestFullGrade !== null ? ` · ${t('result.gradeValue', { grade: r.bestFullGrade })}` : ''}` : '–'}
      </span>
    </li>
  );
}

function AttemptItem({ a, topicName, scope, open, onOpen, onDeleted }: {
  a: ReportAttempt; topicName: (id: string) => string; scope: string | null; open: boolean; onOpen: () => void; onDeleted: () => void;
}) {
  const { t, locale } = useSettings();
  const [reason, setReason] = useState('');
  const action = useAction();
  const scored = a.status === 'finished' || a.status === 'expired';
  return (
    <li className={s.item} data-attempt={a.id} data-status={a.status}>
      <div className={s.itemHead}>
        <strong>{a.fullName}</strong>
        <span className={s.meta}>{formatDate(a.startedAt, locale)} · {a.className}</span>
      </div>
      <span className={s.meta}>
        {topicName(a.topicId)} · {a.mode === 'practice' ? t('game.modePractice') : t('game.modeAssessment')} · {a.count === 'all' ? t('report.allQuestions') : t('report.questions', { count: Number(a.count) })}
        {a.timeLimitMinutes ? ` · ${t('report.limit', { minutes: a.timeLimitMinutes })}` : ''}
        {a.restricted ? ` · ${t('report.restricted')}` : ''}
      </span>
      <span className={s.meta}>
        <span className={s.badge}>{t(`report.status.${a.status === 'started' ? 'in_progress' : a.status}`)}</span>
        {scored && a.percent !== null && <> {formatPercent(locale, a.percent)}</>}
        {scored && a.points !== null && <> · {t('report.pointsShort', { points: a.points, max: a.maxPoints ?? 0 })}</>}
        {scored && a.grade !== null && <> · {t('result.gradeValue', { grade: a.grade })}</>}
        {scored && a.total !== null && <> · {t('result.fraction', { value: a.correct ?? 0, total: a.total })}</>}
      </span>
      {a.durationMs !== null && (
        <span className={s.meta}>
          {t('report.time', { total: formatDuration(a.durationMs), visible: a.visibleMs !== null ? formatDuration(a.visibleMs) : '–' })}
        </span>
      )}
      {(!a.timingComplete || a.lateFinish || a.invalidReason) && (
        <span className={s.meta}>
          {!a.timingComplete && t('report.incomplete')}
          {a.lateFinish && ` ${t('report.late')}`}
          {a.invalidReason && ` ${t('report.invalidReason', { reason: a.invalidReason })}`}
        </span>
      )}
      <div className={s.itemActions}><Button onClick={onOpen}>{t('account.delete')}</Button></div>
      {open && (
        <form className={s.toolbar} onSubmit={(e) => { e.preventDefault(); void action.run(async () => { await api.deleteAttempt(scope, a.id, reason); onDeleted(); }); }}>
          <Field label={t('report.deleteReason')}><TextInput value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} /></Field>
          <Button type="submit" variant="primary" disabled={action.busy || reason.trim().length < 3}>{t('report.deleteConfirm')}</Button>
        </form>
      )}
      {action.messages}
    </li>
  );
}
