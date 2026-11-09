import type { QuestionCount } from '../domain/types.ts';
import { loadTopic, type LocalizedText, type Topic } from './validation.ts';

export type TopicId = 'ukraine-administration' | 'ukraine-tectonics';

export type TopicEntry = {
  id: TopicId;
  /** App and data are released together: this pins the data version of each topic. */
  dataVersion: string;
  title: LocalizedText;
  featureCount: number;
  counts: readonly QuestionCount[];
  /** True when the question units do not cover the whole country (grey background land). */
  partialCoverage: boolean;
};

export const TOPICS: readonly TopicEntry[] = [
  {
    id: 'ukraine-administration', dataVersion: '2026.11.05.1',
    title: { hu: 'Ukrajna közigazgatása', uk: 'Адміністративний устрій України' },
    featureCount: 27, counts: [5, 12, 'all'], partialCoverage: false,
  },
  {
    id: 'ukraine-tectonics', dataVersion: '2026.11.09.1',
    title: { hu: 'Ukrajna tektonikai szerkezete', uk: 'Тектонічна будова України' },
    featureCount: 11, counts: [5, 'all'], partialCoverage: true,
  },
];

export function topicEntry(id: string): TopicEntry {
  const t = TOPICS.find((x) => x.id === id);
  if (!t) throw new Error(`unknown topic ${id}`);
  return t;
}

export const topicBaseUrl = (t: TopicEntry) => `${import.meta.env.BASE_URL}data/${t.id}/${t.dataVersion}/`;

const cache = new Map<string, Promise<Topic>>();

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** Loads and validates once per page; a failure clears the cache so "retry" refetches. */
export function getTopic(id: TopicId): Promise<Topic> {
  let p = cache.get(id);
  if (!p) {
    const t = topicEntry(id);
    p = loadTopic(topicBaseUrl(t), { id: t.id, dataVersion: t.dataVersion }, fetchText).catch((e: unknown) => { cache.delete(id); throw e; });
    cache.set(id, p);
  }
  return p;
}
