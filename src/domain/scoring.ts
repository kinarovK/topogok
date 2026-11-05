import type { AssessmentResult, AssessmentState, PracticeResult, PracticeState, Points } from './types.ts';

export const PRACTICE_POINTS: readonly Points[] = [100, 60, 30];
export const MAX_PRACTICE_ATTEMPTS = 3;

/** Points for a success after `wrongBefore` wrong confirmed attempts. */
export function pointsForSuccess(wrongBefore: number): Points {
  return PRACTICE_POINTS[wrongBefore] ?? 0;
}

/** Ukrainian 12-point grade: max(1, ceil(12 * correct / total)), integer arithmetic only. */
export function grade(correct: number, total: number): number {
  if (!Number.isInteger(correct) || !Number.isInteger(total) || total <= 0 || correct < 0 || correct > total) {
    throw new RangeError(`invalid grade input ${correct}/${total}`);
  }
  return Math.max(1, Math.floor((12 * correct + total - 1) / total));
}

export function rawPercent(correct: number, total: number): number {
  return (100 * correct) / total;
}

export function assessmentResult(s: AssessmentState): AssessmentResult {
  if (s.phase !== 'finished' || s.durationMs === null || s.finishReason === null) throw new Error('assessment not finished');
  const total = s.answers.length;
  const correct = s.answers.filter((a) => a.selectedId !== null && a.selectedId === a.featureId).length;
  return { mode: 'assessment', total, correct, durationMs: s.durationMs, percent: rawPercent(correct, total), grade: grade(correct, total), finishReason: s.finishReason };
}

export function practiceResult(s: PracticeState): PracticeResult {
  if (s.phase !== 'finished' || s.durationMs === null) throw new Error('practice not finished');
  const total = s.base.length;
  const firstTryCorrect = s.base.filter((t) => t.outcome === 'correct' && t.wrongIds.length === 0).length;
  const points = s.base.reduce((n, t) => n + t.points, 0);
  return { mode: 'practice', total, firstTryCorrect, points, maxPoints: 100 * total, percent: rawPercent(firstTryCorrect, total), durationMs: s.durationMs };
}
