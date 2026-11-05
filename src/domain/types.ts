export type Mode = 'practice' | 'assessment';
export type QuestionCount = 5 | 12 | 'all';
export type TimeLimitMinutes = null | 5 | 10 | 15 | 20;

export type PracticeConfiguration = { mode: 'practice'; topicId: string; count: QuestionCount; showElapsed: boolean };
export type AssessmentConfiguration = { mode: 'assessment'; topicId: string; count: QuestionCount; timeLimitMinutes: TimeLimitMinutes };
export type GameConfiguration = PracticeConfiguration | AssessmentConfiguration;

export type Points = 0 | 30 | 60 | 100;

export type PracticeOutcome = 'correct' | 'failed' | 'revealed';

/** One practice task (base or review). `wrongIds` are confirmed wrong answers, in order. */
export type PracticeTask = {
  featureId: string;
  wrongIds: string[];
  outcome: PracticeOutcome | null;
  points: Points;
};

export type PracticeState = {
  mode: 'practice';
  config: PracticeConfiguration;
  stage: 'base' | 'review';
  base: PracticeTask[];
  review: PracticeTask[];
  index: number; // index into the current stage's list
  selection: string | null;
  phase: 'answering' | 'feedback' | 'finished';
  seed: number;
  lastClosedElapsedMs: number;
  durationMs: number | null;
};

export type AssessmentAnswer = { featureId: string; selectedId: string | null };

export type AssessmentState = {
  mode: 'assessment';
  config: AssessmentConfiguration;
  answers: AssessmentAnswer[];
  index: number;
  selection: string | null;
  phase: 'answering' | 'finished';
  finishReason: 'completed' | 'timeout' | null;
  durationMs: number | null;
};

export type GameState = PracticeState | AssessmentState;

export type GameEvent =
  | { type: 'SELECT'; featureId: string; elapsedMs: number }
  | { type: 'CONFIRM'; elapsedMs: number }
  | { type: 'REVEAL'; elapsedMs: number }
  | { type: 'NEXT'; elapsedMs: number }
  | { type: 'TIME_CHECK'; elapsedMs: number };

export type AssessmentResult = {
  mode: 'assessment'; total: number; correct: number; durationMs: number; percent: number; grade: number;
  finishReason: 'completed' | 'timeout';
};
export type PracticeResult = {
  mode: 'practice'; total: number; firstTryCorrect: number; points: number; maxPoints: number; percent: number; durationMs: number;
};
export type GameResult = AssessmentResult | PracticeResult;
