// Pure game rules. No DOM, fetch, storage or map code here.
import { resolveCount } from './config.ts';
import { createRng, shuffle } from './random.ts';
import { MAX_PRACTICE_ATTEMPTS, pointsForSuccess } from './scoring.ts';
import { limitMs } from './clock.ts';
import type { AssessmentState, GameConfiguration, GameEvent, GameState, PracticeState, PracticeTask } from './types.ts';

const newTask = (featureId: string): PracticeTask => ({ featureId, wrongIds: [], outcome: null, points: 0 });

/** Uniform random sample of N distinct IDs in random order (Fisher–Yates on the full list, first N). */
export function selectQuestions(featureIds: readonly string[], count: GameConfiguration['count'], rng: () => number): string[] {
  const unique = [...new Set(featureIds)].sort();
  return shuffle(unique, rng).slice(0, resolveCount(count, unique.length));
}

export function startGame(config: GameConfiguration, featureIds: readonly string[], seed: number): GameState {
  const rng = createRng(seed);
  const questions = selectQuestions(featureIds, config.count, rng);
  if (questions.length === 0) throw new Error('no questions');
  if (config.mode === 'practice') {
    return {
      mode: 'practice', config, stage: 'base', base: questions.map(newTask), review: [], index: 0, selection: null,
      phase: 'answering', seed, lastClosedElapsedMs: 0, durationMs: null,
    };
  }
  return {
    mode: 'assessment', config, answers: questions.map((featureId) => ({ featureId, selectedId: null })), index: 0,
    selection: null, phase: 'answering', finishReason: null, durationMs: null,
  };
}

export function currentFeatureId(s: GameState): string | null {
  if (s.phase === 'finished') return null;
  if (s.mode === 'assessment') return s.answers[s.index]?.featureId ?? null;
  return currentTask(s)?.featureId ?? null;
}

export function currentTask(s: PracticeState): PracticeTask | undefined {
  return (s.stage === 'base' ? s.base : s.review)[s.index];
}

/** True when a confirm would be accepted (used for button state; the reducer re-checks). */
export function canConfirm(s: GameState): boolean {
  if (s.phase !== 'answering' || s.selection === null) return false;
  if (s.mode === 'practice') return !currentTask(s)!.wrongIds.includes(s.selection);
  return true;
}

export function reduce(s: GameState, e: GameEvent): GameState {
  if (s.phase === 'finished') return s; // a closed round never changes
  return s.mode === 'practice' ? reducePractice(s, e) : reduceAssessment(s, e);
}

function replaceTask(s: PracticeState, task: PracticeTask): Pick<PracticeState, 'base' | 'review'> {
  const list = (s.stage === 'base' ? s.base : s.review).map((t, i) => (i === s.index ? task : t));
  return s.stage === 'base' ? { base: list, review: s.review } : { base: s.base, review: list };
}

function reducePractice(s: PracticeState, e: GameEvent): PracticeState {
  const task = currentTask(s)!;
  switch (e.type) {
    case 'SELECT':
      if (s.phase !== 'answering') return s;
      return s.selection === e.featureId ? s : { ...s, selection: e.featureId };
    case 'CONFIRM': {
      if (!canConfirm(s)) return s;
      const sel = s.selection!;
      if (sel === task.featureId) {
        const done: PracticeTask = { ...task, outcome: 'correct', points: s.stage === 'base' ? pointsForSuccess(task.wrongIds.length) : 0 };
        return { ...s, ...replaceTask(s, done), phase: 'feedback', lastClosedElapsedMs: e.elapsedMs };
      }
      const wrongIds = [...task.wrongIds, sel];
      if (wrongIds.length >= MAX_PRACTICE_ATTEMPTS) {
        const done: PracticeTask = { ...task, wrongIds, outcome: 'failed', points: 0 };
        return { ...s, ...replaceTask(s, done), selection: null, phase: 'feedback', lastClosedElapsedMs: e.elapsedMs };
      }
      return { ...s, ...replaceTask(s, { ...task, wrongIds }), selection: null };
    }
    case 'REVEAL': {
      if (s.phase !== 'answering') return s;
      const done: PracticeTask = { ...task, outcome: 'revealed', points: 0 };
      return { ...s, ...replaceTask(s, done), selection: null, phase: 'feedback', lastClosedElapsedMs: e.elapsedMs };
    }
    case 'NEXT': {
      if (s.phase !== 'feedback') return s;
      const list = s.stage === 'base' ? s.base : s.review;
      if (s.index + 1 < list.length) return { ...s, index: s.index + 1, selection: null, phase: 'answering' };
      if (s.stage === 'base') {
        const toRepeat = s.base.filter((t) => t.wrongIds.length > 0 || t.outcome === 'revealed').map((t) => t.featureId);
        if (toRepeat.length > 0) {
          // Separate deterministic stream derived from the round seed.
          const order = shuffle([...new Set(toRepeat)], createRng((s.seed ^ 0x9e3779b9) >>> 0));
          return { ...s, stage: 'review', review: order.map(newTask), index: 0, selection: null, phase: 'answering' };
        }
      }
      return { ...s, selection: null, phase: 'finished', durationMs: s.lastClosedElapsedMs };
    }
    case 'TIME_CHECK':
      return s; // practice has no deadline
  }
}

function reduceAssessment(s: AssessmentState, e: GameEvent): AssessmentState {
  const limit = limitMs(s.config.timeLimitMinutes);
  // Deadline has priority over every event, including a confirm arriving at/after the limit.
  if (limit !== null && e.elapsedMs >= limit) {
    return { ...s, selection: null, phase: 'finished', finishReason: 'timeout', durationMs: limit };
  }
  switch (e.type) {
    case 'SELECT':
      return s.selection === e.featureId ? s : { ...s, selection: e.featureId };
    case 'CONFIRM': {
      if (s.selection === null) return s;
      const answers = s.answers.map((a, i) => (i === s.index ? { ...a, selectedId: s.selection } : a));
      const index = s.index + 1;
      if (index >= answers.length) return { ...s, answers, index: s.index, selection: null, phase: 'finished', finishReason: 'completed', durationMs: e.elapsedMs };
      return { ...s, answers, index, selection: null };
    }
    case 'REVEAL':
    case 'NEXT':
    case 'TIME_CHECK':
      return s;
  }
}

/** Progress shown to the player, identical for right and wrong assessment answers. */
export function progress(s: GameState): { position: number; total: number; stage: 'base' | 'review' } {
  if (s.mode === 'assessment') return { position: Math.min(s.index + 1, s.answers.length), total: s.answers.length, stage: 'base' };
  const list = s.stage === 'base' ? s.base : s.review;
  return { position: s.index + 1, total: list.length, stage: s.stage };
}
