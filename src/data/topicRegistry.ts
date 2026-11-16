import type { QuestionCount } from '../domain/types.ts';
import { loadTopic, type LocalizedText, type Topic } from './validation.ts';

export type TopicId = 'ukraine-administration' | 'ukraine-tectonics' | 'world-continents'
  | 'continent-africa' | 'continent-antarctica' | 'continent-australia-oceania' | 'continent-eurasia' | 'continent-north-america' | 'continent-south-america'
  | 'test-mixed';

export type TopicEntry = {
  id: TopicId;
  /** App and data are released together: this pins the data version of each topic. */
  dataVersion: string;
  title: LocalizedText;
  featureCount: number;
  counts: readonly QuestionCount[];
  /** True when the question units do not cover all land shown (grey background land). */
  partialCoverage: boolean;
  /** Mixed topic (0005): areas, lines and points; texts say "element" instead of "area". */
  mixed?: boolean;
};

const BASE_TOPICS: readonly TopicEntry[] = [
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
  {
    id: 'world-continents', dataVersion: '2026.11.11.1',
    title: { hu: 'Kontinensek topója', uk: 'Материки та океани' },
    featureCount: 11, counts: [5, 'all'], partialCoverage: true,
  },
  // One question set per continent (scripts/data/continents/topics.ts): areas, seas, lines and points.
  {
    id: 'continent-africa', dataVersion: '2026.11.17.1',
    title: { hu: 'Afrika', uk: 'Африка' },
    featureCount: 24, counts: [5, 12, 'all'], partialCoverage: true, mixed: true,
  },
  {
    id: 'continent-eurasia', dataVersion: '2026.11.17.1',
    title: { hu: 'Eurázsia', uk: 'Євразія' },
    featureCount: 58, counts: [5, 12, 'all'], partialCoverage: true, mixed: true,
  },
  {
    id: 'continent-north-america', dataVersion: '2026.11.17.1',
    title: { hu: 'Észak-Amerika', uk: 'Північна Америка' },
    featureCount: 24, counts: [5, 12, 'all'], partialCoverage: true, mixed: true,
  },
  {
    id: 'continent-south-america', dataVersion: '2026.11.17.1',
    title: { hu: 'Dél-Amerika', uk: 'Південна Америка' },
    featureCount: 23, counts: [5, 12, 'all'], partialCoverage: true, mixed: true,
  },
  {
    id: 'continent-australia-oceania', dataVersion: '2026.11.17.1',
    title: { hu: 'Ausztrália és Óceánia', uk: 'Австралія та Океанія' },
    featureCount: 13, counts: [5, 12, 'all'], partialCoverage: true, mixed: true,
  },
  {
    id: 'continent-antarctica', dataVersion: '2026.11.17.1',
    title: { hu: 'Antarktisz', uk: 'Антарктида' },
    featureCount: 11, counts: [5, 'all'], partialCoverage: true, mixed: true,
  },
];

/** Synthetic mixed topic built from scripts/data/fixtures (0005): only in the E2E build, never shown to users. */
const TEST_TOPICS: readonly TopicEntry[] = [
  {
    id: 'test-mixed', dataVersion: '2026.11.17.1',
    title: { hu: 'Teszttéma (vegyes)', uk: 'Тестова тема (змішана)' },
    featureCount: 8, counts: [5, 'all'], partialCoverage: false, mixed: true,
  },
];
const E2E = typeof import.meta.env !== 'undefined' && import.meta.env.MODE === 'e2e';
export const TOPICS: readonly TopicEntry[] = E2E ? [...BASE_TOPICS, ...TEST_TOPICS] : BASE_TOPICS;

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
