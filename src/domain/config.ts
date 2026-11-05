import type { GameConfiguration, QuestionCount, TimeLimitMinutes } from './types.ts';

export const QUESTION_COUNTS: readonly QuestionCount[] = [5, 12, 'all'];
export const TIME_LIMITS: readonly TimeLimitMinutes[] = [null, 5, 10, 15, 20];
export const DEFAULT_COUNT: QuestionCount = 12;

export function resolveCount(count: QuestionCount, available: number): number {
  return count === 'all' ? available : Math.min(count, available);
}

/** Runtime validation: anything not matching the discriminated union is rejected. */
export function validateConfig(value: unknown): GameConfiguration | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v['topicId'] !== 'string' || v['topicId'] === '') return null;
  if (!QUESTION_COUNTS.includes(v['count'] as QuestionCount)) return null;
  const count = v['count'] as QuestionCount;
  if (v['mode'] === 'practice') {
    if (typeof v['showElapsed'] !== 'boolean' || 'timeLimitMinutes' in v) return null;
    return { mode: 'practice', topicId: v['topicId'], count, showElapsed: v['showElapsed'] };
  }
  if (v['mode'] === 'assessment') {
    if (!TIME_LIMITS.includes(v['timeLimitMinutes'] as TimeLimitMinutes) || 'showElapsed' in v) return null;
    return { mode: 'assessment', topicId: v['topicId'], count, timeLimitMinutes: v['timeLimitMinutes'] as TimeLimitMinutes };
  }
  return null;
}
