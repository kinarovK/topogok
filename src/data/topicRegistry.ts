import type { QuestionCount } from '../domain/types.ts';
import { loadTopic, type LocalizedText, type Topic } from './validation.ts';

export type TopicId = 'ukraine-administration' | 'ukraine-tectonics' | 'world-continents'
  | 'continent-africa' | 'continent-antarctica' | 'continent-australia-oceania' | 'continent-eurasia' | 'continent-north-america' | 'continent-south-america'
  | 'ukraine-position' | 'ukraine-relief' | 'ukraine-minerals' | 'ukraine-zones' | 'ukraine-admin-centres'
  | 'europe-countries' | 'asia-countries' | 'america-countries' | 'oceania-countries' | 'africa-economy' | 'western-europe-g7' | 'russia' | 'east-asia' | 'india' | 'usa-canada' | 'brazil' | 'egypt-south-africa'
  | 'world-economy-countries' | 'world-fuel-basins' | 'ukraine-energy' | 'ukraine-metallurgy' | 'ukraine-machinery' | 'ukraine-transport' | 'ukraine-resorts'
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
  /** School grade the topic belongs to; the topic lists are grouped by it. */
  grade: number;
};

const BASE_TOPICS: readonly TopicEntry[] = [
  {
    id: 'ukraine-administration', dataVersion: '2026.11.05.1',
    title: { hu: 'Ukrajna közigazgatása', uk: 'Адміністративний устрій України' },
    featureCount: 27, counts: [5, 12, 'all'], partialCoverage: false, grade: 8,
  },
  {
    id: 'ukraine-position', dataVersion: '2026.11.18.1',
    title: { hu: 'Ukrajna fekvése és határai', uk: 'Географічне положення та кордони України' },
    featureCount: 20, counts: [5, 12, 'all'], partialCoverage: true, grade: 8, mixed: true,
  },
  {
    id: 'ukraine-relief', dataVersion: '2026.11.18.1',
    title: { hu: 'Ukrajna felszínformái', uk: 'Рельєф України' },
    featureCount: 19, counts: [5, 12, 'all'], partialCoverage: true, grade: 8, mixed: true,
  },
  {
    id: 'ukraine-minerals', dataVersion: '2026.11.18.1',
    title: { hu: 'Ukrajna ásványkincsei', uk: 'Корисні копалини України' },
    featureCount: 8, counts: [5, 'all'], partialCoverage: true, grade: 8, mixed: true,
  },
  {
    id: 'ukraine-zones', dataVersion: '2026.11.18.1',
    title: { hu: 'Ukrajna természeti övezetei', uk: 'Природні зони України' },
    featureCount: 6, counts: [5, 'all'], partialCoverage: true, grade: 8, mixed: true,
  },
  {
    id: 'ukraine-admin-centres', dataVersion: '2026.11.18.1',
    title: { hu: 'Ukrajna megyéi és megyeközpontjai', uk: 'Області та обласні центри України' },
    featureCount: 53, counts: [5, 12, 'all'], partialCoverage: false, grade: 8, mixed: true,
  },
  {
    id: 'world-economy-countries', dataVersion: '2026.11.18.1',
    title: { hu: 'A világgazdaság országai', uk: 'Країни у світовому господарстві' },
    featureCount: 20, counts: [5, 12, 'all'], partialCoverage: true, grade: 9, mixed: true,
  },
  {
    id: 'world-fuel-basins', dataVersion: '2026.11.18.1',
    title: { hu: 'A világ szén-, kőolaj- és földgázmedencéi', uk: 'Вугільні та нафтогазоносні басейни світу' },
    featureCount: 16, counts: [5, 12, 'all'], partialCoverage: true, grade: 9, mixed: true,
  },
  {
    id: 'ukraine-energy', dataVersion: '2026.11.18.1',
    title: { hu: 'Ukrajna energetikája', uk: 'Енергетика України' },
    featureCount: 19, counts: [5, 12, 'all'], partialCoverage: true, grade: 9, mixed: true,
  },
  {
    id: 'ukraine-metallurgy', dataVersion: '2026.11.18.1',
    title: { hu: 'Ukrajna kohászata', uk: 'Металургія України' },
    featureCount: 17, counts: [5, 12, 'all'], partialCoverage: true, grade: 9, mixed: true,
  },
  {
    id: 'ukraine-machinery', dataVersion: '2026.11.18.1',
    title: { hu: 'Ukrajna gépgyártása', uk: 'Машинобудування України' },
    featureCount: 26, counts: [5, 12, 'all'], partialCoverage: true, grade: 9, mixed: true,
  },
  {
    id: 'ukraine-transport', dataVersion: '2026.11.18.1',
    title: { hu: 'Ukrajna közlekedése', uk: 'Транспорт України' },
    featureCount: 22, counts: [5, 12, 'all'], partialCoverage: true, grade: 9, mixed: true,
  },
  {
    id: 'ukraine-resorts', dataVersion: '2026.11.18.1',
    title: { hu: 'Ukrajna üdülő- és gyógyhelyei', uk: 'Курорти України' },
    featureCount: 19, counts: [5, 12, 'all'], partialCoverage: true, grade: 9, mixed: true,
  },
  {
    id: 'europe-countries', dataVersion: '2026.11.18.1',
    title: { hu: 'Európa országai', uk: 'Країни Європи' },
    featureCount: 44, counts: [5, 12, 'all'], partialCoverage: true, grade: 10, mixed: true,
  },
  {
    id: 'asia-countries', dataVersion: '2026.11.18.1',
    title: { hu: 'Ázsia országai', uk: 'Країни Азії' },
    featureCount: 49, counts: [5, 12, 'all'], partialCoverage: true, grade: 10, mixed: true,
  },
  {
    id: 'america-countries', dataVersion: '2026.11.18.1',
    title: { hu: 'Amerika országai', uk: 'Країни Америки' },
    featureCount: 28, counts: [5, 12, 'all'], partialCoverage: true, grade: 10, mixed: true,
  },
  {
    id: 'oceania-countries', dataVersion: '2026.11.18.1',
    title: { hu: 'Ausztrália és Óceánia', uk: 'Австралія та Океанія' },
    featureCount: 21, counts: [5, 12, 'all'], partialCoverage: true, grade: 10, mixed: true,
  },
  {
    id: 'africa-economy', dataVersion: '2026.11.18.1',
    title: { hu: 'Afrika gazdasága', uk: 'Господарство Африки' },
    featureCount: 36, counts: [5, 12, 'all'], partialCoverage: true, grade: 10, mixed: true,
  },
  {
    id: 'western-europe-g7', dataVersion: '2026.11.18.1',
    title: { hu: 'Németország, Franciaország, Egyesült Királyság, Olaszország, Lengyelország', uk: 'Німеччина, Франція, Велика Британія, Італія, Польща' },
    featureCount: 47, counts: [5, 12, 'all'], partialCoverage: true, grade: 10, mixed: true,
  },
  {
    id: 'russia', dataVersion: '2026.11.18.1',
    title: { hu: 'Oroszország', uk: 'Росія' },
    featureCount: 15, counts: [5, 12, 'all'], partialCoverage: true, grade: 10, mixed: true,
  },
  {
    id: 'east-asia', dataVersion: '2026.11.18.1',
    title: { hu: 'Kína, Japán, Dél-Korea', uk: 'Китай, Японія, Південна Корея' },
    featureCount: 21, counts: [5, 12, 'all'], partialCoverage: true, grade: 10, mixed: true,
  },
  {
    id: 'india', dataVersion: '2026.11.18.1',
    title: { hu: 'India', uk: 'Індія' },
    featureCount: 6, counts: [5, 'all'], partialCoverage: true, grade: 10, mixed: true,
  },
  {
    id: 'usa-canada', dataVersion: '2026.11.18.1',
    title: { hu: 'Amerikai Egyesült Államok és Kanada', uk: 'США і Канада' },
    featureCount: 20, counts: [5, 12, 'all'], partialCoverage: true, grade: 10, mixed: true,
  },
  {
    id: 'brazil', dataVersion: '2026.11.18.1',
    title: { hu: 'Brazília', uk: 'Бразилія' },
    featureCount: 7, counts: [5, 'all'], partialCoverage: true, grade: 10, mixed: true,
  },
  {
    id: 'egypt-south-africa', dataVersion: '2026.11.18.1',
    title: { hu: 'Egyiptom és a Dél-afrikai Köztársaság', uk: 'Єгипет і Південно-Африканська Республіка' },
    featureCount: 14, counts: [5, 12, 'all'], partialCoverage: true, grade: 10, mixed: true,
  },
  {
    id: 'ukraine-tectonics', dataVersion: '2026.11.09.1',
    title: { hu: 'Ukrajna tektonikai szerkezete', uk: 'Тектонічна будова України' },
    featureCount: 11, counts: [5, 'all'], partialCoverage: true, grade: 8,
  },
  {
    id: 'world-continents', dataVersion: '2026.11.11.1',
    title: { hu: 'Kontinensek topója', uk: 'Материки та океани' },
    featureCount: 11, counts: [5, 'all'], partialCoverage: true, grade: 7,
  },
  // One question set per continent (scripts/data/continents/topics.ts): areas, seas, lines and points.
  {
    id: 'continent-africa', dataVersion: '2026.11.17.4',
    title: { hu: 'Afrika', uk: 'Африка' },
    featureCount: 28, counts: [5, 12, 'all'], partialCoverage: true, grade: 7, mixed: true,
  },
  {
    id: 'continent-eurasia', dataVersion: '2026.11.17.4',
    title: { hu: 'Eurázsia', uk: 'Євразія' },
    featureCount: 64, counts: [5, 12, 'all'], partialCoverage: true, grade: 7, mixed: true,
  },
  {
    id: 'continent-north-america', dataVersion: '2026.11.17.4',
    title: { hu: 'Észak-Amerika', uk: 'Північна Америка' },
    featureCount: 28, counts: [5, 12, 'all'], partialCoverage: true, grade: 7, mixed: true,
  },
  {
    id: 'continent-south-america', dataVersion: '2026.11.17.4',
    title: { hu: 'Dél-Amerika', uk: 'Південна Америка' },
    featureCount: 26, counts: [5, 12, 'all'], partialCoverage: true, grade: 7, mixed: true,
  },
  {
    id: 'continent-australia-oceania', dataVersion: '2026.11.17.4',
    title: { hu: 'Ausztrália és Óceánia', uk: 'Австралія та Океанія' },
    featureCount: 17, counts: [5, 12, 'all'], partialCoverage: true, grade: 7, mixed: true,
  },
  {
    id: 'continent-antarctica', dataVersion: '2026.11.17.4',
    title: { hu: 'Antarktisz', uk: 'Антарктида' },
    featureCount: 11, counts: [5, 'all'], partialCoverage: true, grade: 7, mixed: true,
  },
];

/** Synthetic mixed topic built from scripts/data/fixtures (0005): only in the E2E build, never shown to users. */
const TEST_TOPICS: readonly TopicEntry[] = [
  {
    id: 'test-mixed', dataVersion: '2026.11.17.4',
    title: { hu: 'Teszttéma (vegyes)', uk: 'Тестова тема (змішана)' },
    featureCount: 8, counts: [5, 'all'], partialCoverage: false, grade: 7, mixed: true,
  },
];
const E2E = typeof import.meta.env !== 'undefined' && import.meta.env.MODE === 'e2e';
export const TOPICS: readonly TopicEntry[] = E2E ? [...BASE_TOPICS, ...TEST_TOPICS] : BASE_TOPICS;

/** Topics grouped by grade (ascending), keeping the registry order within a grade. */
export function topicsByGrade(list: readonly TopicEntry[] = TOPICS): Array<{ grade: number; topics: TopicEntry[] }> {
  const grades = [...new Set(list.map((x) => x.grade))].sort((a, b) => a - b);
  return grades.map((grade) => ({ grade, topics: list.filter((x) => x.grade === grade) }));
}

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
