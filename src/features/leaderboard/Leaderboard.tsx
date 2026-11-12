// F5: the full-map leaderboard of one teacher's circle. Loaded once when opened; further loads only by the
// Refresh button, which the server allows once a minute per account.
import { useCallback, useEffect, useState } from 'react';
import { api, ApiFailure, type Board } from '../../account/api.ts';
import { useSettings } from '../../app/settings.tsx';
import { Button } from '../../components/ui.tsx';
import { formatDuration } from '../../domain/clock.ts';
import { formatPercent } from '../../i18n/translator.ts';
import { formatDate, useErrorText } from '../account/common.tsx';
import s from './leaderboard.module.css';

export function Leaderboard({ topicId, teacherId }: { topicId: string; teacherId: string | null }) {
  const { t, locale } = useSettings();
  const errorText = useErrorText();
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [readyAt, setReadyAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(() => {
    setBusy(true); setError(null);
    api.leaderboard(topicId, teacherId).then(
      (b) => { setBoard(b); setBusy(false); setReadyAt(Date.now() + 60_000); setNow(Date.now()); },
      (e: unknown) => {
        setBusy(false);
        if (e instanceof ApiFailure && e.code === 'rate_limited') {
          const sec = e.retryAfterSeconds ?? 60;
          setReadyAt(Date.now() + sec * 1000); setNow(Date.now());
          setError(t('board.wait', { seconds: sec }));
        } else setError(errorText(e));
      },
    );
  }, [topicId, teacherId, t, errorText]);

  // Exactly one automatic load per opened topic: every request counts against the server's 60 s limit.
  useEffect(() => { void Promise.resolve().then(load); }, [topicId, teacherId]); // eslint-disable-line react-hooks/exhaustive-deps
  // Countdown on the button only (no automatic reload).
  useEffect(() => {
    if (readyAt <= now) return undefined;
    const id = window.setTimeout(() => setNow(Date.now()), 1000);
    return () => window.clearTimeout(id);
  }, [readyAt, now]);
  const wait = Math.max(0, Math.ceil((readyAt - now) / 1000));

  return (
    <section className={s.board} data-testid="leaderboard">
      <div className={s.bar}>
        <Button onClick={load} disabled={busy || wait > 0} data-testid="board-refresh">
          {wait > 0 ? t('board.refreshIn', { seconds: wait }) : t('board.refresh')}
        </Button>
        {board && <span className={s.meta}>{t('board.updated', { time: formatDate(board.generatedAt, locale) })}</span>}
      </div>
      {board?.periodStart && <p className={s.meta}>{t('board.period', { time: formatDate(board.periodStart, locale) })}</p>}
      {error && <p className={s.error} role="alert">{error}</p>}
      {board && board.rows.length === 0 && <p className={s.empty}>{t('board.empty')}</p>}
      {board && board.rows.length > 0 && (
        <ol className={s.rows}>
          {board.rows.map((r) => (
            <li key={r.studentId} className={r.studentId === board.myStudentId ? s.mine : undefined} data-rank={r.rank} aria-current={r.studentId === board.myStudentId ? 'true' : undefined}>
              <span className={s.rank}>{r.rank}.</span>
              <span className={s.name}>{r.fullName}</span>
              <span className={s.score}>{r.correct} / {r.total} · {formatPercent(locale, r.percent)}</span>
              <span className={s.time}>{formatDuration(r.durationMs)}</span>
            </li>
          ))}
        </ol>
      )}
      <p className={s.meta}>{t('board.rule')}</p>
    </section>
  );
}

/** Full page from the topic screen (students and teachers). */
export function LeaderboardScreen({ topicId, title, onBack }: { topicId: string; title: string; onBack: () => void }) {
  const { t } = useSettings();
  return (
    <div className={s.page}>
      <h1>{t('board.title')}</h1>
      <p className={s.meta}>{title}</p>
      <Leaderboard topicId={topicId} teacherId={null} />
      <div><Button onClick={onBack}>{t('common.back')}</Button></div>
    </div>
  );
}

/** Personal record line on the topic screen (students). One small request when the screen opens. */
export function RecordLine({ topicId }: { topicId: string }) {
  const { t, locale } = useSettings();
  const [state, setState] = useState<{ topicId: string; text: string } | null>(null);
  useEffect(() => {
    let alive = true;
    api.record(topicId).then(
      (r) => { if (alive) setState({ topicId, text: r ? t('board.record', { correct: r.correct, total: r.total, percent: formatPercent(locale, r.percent), time: formatDuration(r.durationMs) }) : t('board.noRecord') }); },
      () => { if (alive) setState(null); },
    );
    return () => { alive = false; };
  }, [topicId, t, locale]);
  if (!state || state.topicId !== topicId) return null;
  return <p className={s.record} data-testid="personal-record">{state.text}</p>;
}
