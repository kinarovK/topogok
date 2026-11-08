import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSettings } from '../../app/settings.tsx';
import { Button, ConfirmDialog } from '../../components/ui.tsx';
import type { Topic } from '../../data/validation.ts';
import { browserTimeSource, createClock, formatDuration, formatRemaining, limitMs, type Clock } from '../../domain/clock.ts';
import { canConfirm, currentFeatureId, currentTask, progress, reduce, startGame } from '../../domain/game.ts';
import { randomSeed } from '../../domain/random.ts';
import { assessmentResult, MAX_PRACTICE_ATTEMPTS, practiceResult } from '../../domain/scoring.ts';
import type { GameConfiguration, GameEvent, GameResult, GameState } from '../../domain/types.ts';
import { InsetSection } from '../../map/InsetSection.tsx';
import { padBounds, type Feedback } from '../../map/mapAdapter.ts';
import { MapView } from '../../map/MapView.tsx';
import s from '../../app/app.module.css';

const NO_FEEDBACK: Feedback = { wrongIds: [], correctId: null };

const questionKeyFor = (g: GameState | null) => (g ? `${g.mode === 'practice' ? g.stage : 'a'}-${progress(g).position}` : 'none');

export function GameScreen({ topic, config, onFinish, onRestart, onExit, onRenderError }: {
  topic: Topic; config: GameConfiguration; onFinish: (r: GameResult) => void; onRestart: () => void; onExit: () => void; onRenderError: () => void;
}) {
  const { t, locale } = useSettings();
  const [game, setGame] = useState<GameState | null>(null);
  const clockRef = useRef<Clock | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [inset, setInset] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'restart' | 'exit' | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const finished = useRef(false);
  const feedbackSince = useRef(0);

  const ids = useMemo(() => topic.regions.map((r) => r.id), [topic]);
  const names = useMemo(() => new Map(topic.regions.map((r) => [r.id, r.properties.names])), [topic]);
  const viewBounds = topic.manifest.bounds;
  const maxBounds = useMemo(() => padBounds(topic.manifest.bounds, 0.6), [topic]);

  const send = useCallback((make: (elapsedMs: number) => GameEvent) => {
    const clock = clockRef.current;
    if (!clock) return;
    const e = make(clock.elapsed());
    setGame((g) => (g ? reduce(g, e) : g));
  }, []);

  // Start only when the map is selectable: loading time is not part of the round.
  const onMapReady = useCallback(() => {
    if (clockRef.current) return;
    clockRef.current = createClock(browserTimeSource);
    setGame(startGame(config, ids, randomSeed()));
  }, [config, ids]);

  // Deadline checks: timer tick plus every return to the page.
  const limit = config.mode === 'assessment' ? limitMs(config.timeLimitMinutes) : null;
  const showClock = config.mode === 'assessment' ? limit !== null : config.showElapsed;
  useEffect(() => {
    if (!game || game.phase === 'finished') return;
    const check = () => {
      if (limit !== null) send((elapsedMs) => ({ type: 'TIME_CHECK', elapsedMs }));
      if (clockRef.current) setElapsed(clockRef.current.elapsed());
    };
    const iv = showClock || limit !== null ? window.setInterval(check, 250) : 0;
    const onVis = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pageshow', check);
    window.addEventListener('focus', check);
    return () => {
      if (iv) window.clearInterval(iv);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pageshow', check);
      window.removeEventListener('focus', check);
    };
  }, [game, limit, showClock, send]);

  const inFeedbackPhase = game?.phase === 'feedback';
  useEffect(() => { if (inFeedbackPhase) feedbackSince.current = performance.now(); }, [inFeedbackPhase]);

  // Hand over the result exactly once.
  useEffect(() => {
    if (!game || game.phase !== 'finished' || finished.current) return;
    finished.current = true;
    onFinish(game.mode === 'practice' ? practiceResult(game) : assessmentResult(game));
  }, [game, onFinish]);

  // Same reset for every question: country view, insets closed.
  const questionKey = questionKeyFor(game);
  const [resetKey, setResetKey] = useState(0);
  const lastKey = useRef(questionKey);
  useEffect(() => {
    if (lastKey.current === questionKey) return;
    lastKey.current = questionKey;
    setResetKey((k) => k + 1);
    setInset(null);
    // After answering in an inset the question may be scrolled out of view on small screens.
    const bar = document.getElementById('question');
    if (bar && bar.getBoundingClientRect().top < 0) bar.scrollIntoView({ block: 'start' });
  }, [questionKey]);

  const featureId = game ? currentFeatureId(game) : null;
  const targetName = featureId ? names.get(featureId)?.[locale] ?? '' : '';

  let feedback = NO_FEEDBACK;
  let task = null as ReturnType<typeof currentTask> | null;
  if (game?.mode === 'practice' && game.phase !== 'finished') {
    task = currentTask(game) ?? null;
    if (task) feedback = { wrongIds: task.wrongIds, correctId: task.outcome ? task.featureId : null };
  }
  const feedbackMemo = useMemo(() => feedback, [feedback.wrongIds, feedback.correctId]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSelect = useCallback((id: string) => send((elapsedMs) => ({ type: 'SELECT', featureId: id, elapsedMs })), [send]);
  const confirm = () => {
    if (!game || !canConfirm(game)) return;
    const before = game;
    send((elapsedMs) => ({ type: 'CONFIRM', elapsedMs }));
    if (before.mode === 'assessment') setAnnouncement(t('assessment.answered', { position: Math.min(before.index + 2, before.answers.length) }));
  };

  // Live status text. Assessment never reveals correctness.
  let statusText = '';
  let statusClass = s.feedbackNeutral;
  let icon = '';
  if (game && game.phase !== 'finished') {
    if (game.mode === 'practice' && task) {
      const last = task.wrongIds[task.wrongIds.length - 1];
      if (task.outcome === 'correct') { statusText = t('practice.correct'); statusClass = s.feedbackCorrect; icon = '✓'; }
      else if (task.outcome === 'failed') { statusText = t('practice.failed', { name: targetName }); statusClass = s.feedbackWrong; icon = '✗'; }
      else if (task.outcome === 'revealed') { statusText = t('practice.revealed', { name: targetName }); statusClass = s.feedbackCorrect; icon = 'ⓘ'; }
      else if (game.selection && task.wrongIds.includes(game.selection)) { statusText = t('game.alreadyTried'); }
      else if (game.selection) { statusText = t('game.selected'); }
      else if (last) { statusText = t('practice.wrong'); statusClass = s.feedbackWrong; icon = '✗'; }
      else statusText = t('game.noSelection');
    } else {
      statusText = game.selection ? t('game.selected') : t('game.noSelection');
    }
  }

  const timerText = limit !== null ? formatRemaining(limit - elapsed) : formatDuration(elapsed);
  const prog = game ? progress(game) : null;
  const isReview = game?.mode === 'practice' && game.stage === 'review';
  const inFeedback = game?.mode === 'practice' && game.phase === 'feedback';
  const isLastPractice = game?.mode === 'practice' && inFeedback && prog !== null && prog.position === prog.total
    && (game.stage === 'review' || !game.base.some((x) => x.wrongIds.length > 0 || x.outcome === 'revealed'));

  return (
    <div className={s.game}>
      <section className={s.questionBar} aria-labelledby="question">
        <div className={s.meta}>
          <span>
            {config.mode === 'practice' ? t('game.modePractice') : t('game.modeAssessment')}
            {prog && ` · ${isReview ? `${t('practice.repeat')} • ` : ''}${t('game.progress', { position: prog.position, total: prog.total })}`}
          </span>
          {showClock && game && (
            <span className={s.timer} role="timer" aria-live="off">
              <span className="visually-hidden">{limit !== null ? t('game.remaining') : t('game.elapsed')}: </span>
              {timerText}
            </span>
          )}
        </div>
        <h1 id="question" className={s.question}>{game && targetName ? t('game.find', { name: targetName }) : t('game.loadingMap')}</h1>
        {isReview && <p className={s.reviewNote}>{t('practice.repeatNote')}</p>}
      </section>

      <div className={s.mapArea}>
        <MapView topic={topic} name="main" ariaLabel={t('game.map')} viewBounds={viewBounds} maxBounds={maxBounds}
          selection={game?.selection ?? null} feedback={feedbackMemo} onSelect={onSelect} onReady={onMapReady}
          onError={onRenderError} resetKey={resetKey} />
      </div>

      <div className={s.panel}>
        <InsetSection topic={topic} open={inset} onOpen={setInset} selection={game?.selection ?? null} feedback={feedbackMemo} onSelect={onSelect} onError={onRenderError} />
        {game && (
          <div className={[s.feedback, statusClass].join(' ')} data-testid="status" aria-live={config.mode === 'practice' ? 'polite' : 'off'}>
            {icon && <span className={s.icon} aria-hidden="true">{icon}</span>}
            <span>{statusText}</span>
            {game.mode === 'practice' && task && !task.outcome && (
              <span className={s.attempts}>{t('practice.attemptsLeft', { count: MAX_PRACTICE_ATTEMPTS - task.wrongIds.length })}</span>
            )}
          </div>
        )}
        {config.mode === 'assessment' && <p className="visually-hidden" aria-live="polite">{announcement}</p>}
        <div className={s.stickyActions}>
          {inFeedback ? (
            <Button variant="primary" block onClick={() => {
              // The "Next" button appears where "Confirm" was: ignore the second click of a double-click.
              if (performance.now() - feedbackSince.current < 400) return;
              send((elapsedMs) => ({ type: 'NEXT', elapsedMs }));
            }}>
              {isLastPractice ? t('game.toResults') : t('game.next')}
            </Button>
          ) : (
            <Button variant="primary" block disabled={!game || !canConfirm(game)} onClick={confirm}>{t('game.confirm')}</Button>
          )}
          <div className={s.secondaryActions}>
            {game?.mode === 'practice' && !inFeedback && (
              <Button onClick={() => send((elapsedMs) => ({ type: 'REVEAL', elapsedMs }))} disabled={!game}>{t('practice.reveal')}</Button>
            )}
            <Button onClick={() => setDialog('restart')}>{t('common.restart')}</Button>
            <Button onClick={() => setDialog('exit')}>{t('common.exit')}</Button>
          </div>
        </div>
      </div>

      {dialog === 'restart' && (
        <ConfirmDialog title={t('game.confirmRestartTitle')} body={t('game.confirmRestartBody')} safeLabel={t('common.continue')} dangerLabel={t('game.restartAnyway')}
          onSafe={() => setDialog(null)} onDanger={() => { setDialog(null); onRestart(); }} />
      )}
      {dialog === 'exit' && (
        <ConfirmDialog title={t('game.confirmExitTitle')} body={t('game.confirmExitBody')} safeLabel={t('common.continue')} dangerLabel={t('game.exitAnyway')}
          onSafe={() => setDialog(null)} onDanger={() => { setDialog(null); onExit(); }} />
      )}
    </div>
  );
}
