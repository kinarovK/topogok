import type { QuestionCount } from './types.ts';

/**
 * Question-count options when `enabled` features may be asked (F4-04): the topic's numeric options below
 * the enabled count, then "all". Equal counts are not offered twice (8 enabled → 5 and All (8)).
 */
export function countOptions(topicCounts: readonly QuestionCount[], enabled: number): QuestionCount[] {
  return [...topicCounts.filter((c): c is Exclude<QuestionCount, 'all'> => c !== 'all' && c < enabled), 'all'];
}
