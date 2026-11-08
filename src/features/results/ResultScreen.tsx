import { useEffect, useRef } from 'react';
import { useSettings } from '../../app/settings.tsx';
import { Button } from '../../components/ui.tsx';
import { formatDuration } from '../../domain/clock.ts';
import type { GameResult } from '../../domain/types.ts';
import { formatPercent } from '../../i18n/translator.ts';
import s from '../../app/app.module.css';

export function ResultScreen({ result, onNewRound, onHome }: { result: GameResult; onNewRound: () => void; onHome: () => void }) {
  const { t, locale } = useSettings();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus(); }, []);
  const n = (v: number) => new Intl.NumberFormat(locale === 'uk' ? 'uk-UA' : 'hu-HU').format(v);
  return (
    <div className={s.page}>
      <h1 ref={headingRef} tabIndex={-1}>{result.mode === 'practice' ? t('result.titlePractice') : t('result.titleAssessment')}</h1>
      {result.mode === 'assessment' && result.finishReason === 'timeout' && <p className={s.notice} role="status">{t('result.expiredNote')}</p>}
      <dl className={s.stats} data-testid="result">
        <div className={s.stat}><dt>{t('result.duration')}</dt><dd data-testid="duration">{formatDuration(result.durationMs)}</dd></div>
        {result.mode === 'assessment' ? (
          <>
            <div className={s.stat}><dt>{t('result.correct')}</dt><dd data-testid="correct">{t('result.fraction', { value: result.correct, total: result.total })}</dd></div>
            <div className={s.stat}><dt>{t('result.percent')}</dt><dd data-testid="percent">{formatPercent(locale, result.percent)}</dd></div>
            <div className={s.stat}><dt>{t('result.grade')}</dt><dd data-testid="grade">{t('result.gradeValue', { grade: result.grade })}</dd></div>
          </>
        ) : (
          <>
            <div className={s.stat}><dt>{t('result.firstTry')}</dt><dd data-testid="correct">{t('result.fraction', { value: result.firstTryCorrect, total: result.total })}</dd></div>
            <div className={s.stat}><dt>{t('result.hitRate')}</dt><dd data-testid="percent">{formatPercent(locale, result.percent)}</dd></div>
            <div className={s.stat}><dt>{t('result.points')}</dt><dd data-testid="points">{t('result.pointsValue', { points: n(result.points), max: n(result.maxPoints) })}</dd></div>
          </>
        )}
      </dl>
      <p className={s.note}>{t('result.notSaved')}</p>
      <div className={s.actions}>
        <Button variant="primary" onClick={onNewRound}>{t('result.newRound')}</Button>
        <Button onClick={onHome}>{t('result.home')}</Button>
      </div>
    </div>
  );
}
