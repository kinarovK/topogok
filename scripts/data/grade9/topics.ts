// 9th grade topics (economic geography of Ukraine and the world). Sources: sources/grade9/<topic>/*.geojson, made by
// make_sources.py. Usage: npm run data:topic -- scripts/data/grade9/topics.ts
import type { ProjectionConfig } from '../projection.ts';
import type { LocalizedText, TopicConfig } from '../topic.ts';

const DATA_VERSION = '2026.11.18.1';
const T: Record<string, LocalizedText> = {
  g20: { hu: 'G20-országok', uk: 'Країни G20' }, asvanykincs: { hu: 'Ásványkincsekben gazdag ország', uk: 'Країна, багата на корисні копалини' },
  szen: { hu: 'Szénmedencék', uk: 'Вугільні басейни' }, koolajfoldgaz: { hu: 'Kőolaj- és földgázmedencék', uk: 'Нафтогазоносні басейни' },
  hoeromuvek: { hu: 'Hőerőművek', uk: 'Теплові електростанції' }, atomeromuvek: { hu: 'Atomerőművek', uk: 'Атомні електростанції' },
  vizeromuvek: { hu: 'Víz- és tározós erőművek', uk: 'Гідро- та гідроакумулювальні електростанції' },
  kozpontok: { hu: 'Központok', uk: 'Центри' }, ercek: { hu: 'Ércbázis', uk: 'Рудна база' },
  csomopontok: { hu: 'Közlekedési csomópontok', uk: 'Транспортні вузли' }, kikotok: { hu: 'Tengeri kikötők', uk: 'Морські порти' },
  csovezetekek: { hu: 'Csővezetékek', uk: 'Трубопроводи' }, udulohelyek: { hu: 'Üdülő- és gyógyhelyek', uk: 'Курорти' },
};
const NE: TopicConfig['provenance'] = { source: 'Natural Earth (public domain), hand-placed points', sourceUrl: 'https://www.naturalearthdata.com/', license: 'Public domain', licenseUrl: 'https://www.naturalearthdata.com/about/terms-of-use/', status: 'unverified' };
const DRAFT: TopicConfig['provenance'] = { ...NE, source: 'Draft outlines and points from atlas knowledge (to be checked by the owner), Natural Earth base' };
const world = { name: 'robinson' as const, centralMeridian: 10 };
const ukraine = { name: 'laea' as const, center: [31, 48.5] as [number, number] };
const topic = (id: string, folder: string, hu: string, uk: string, projection: ProjectionConfig, provenance: TopicConfig['provenance'], extra: Partial<TopicConfig> = {}): TopicConfig => ({
  id, dataVersion: DATA_VERSION, title: { hu, uk }, source: `sources/grade9/${folder}`, projection, layerTitles: T, provenance, ...extra,
});

const topics: TopicConfig[] = [
  topic('world-economy-countries', 'orszagok', 'A világgazdaság országai', 'Країни у світовому господарстві', world, NE, { simplifyAreas: { g20: 0.05, asvanykincs: 0.05 } }),
  topic('world-fuel-basins', 'medencek', 'A világ szén-, kőolaj- és földgázmedencéi', 'Вугільні та нафтогазоносні басейни світу', world, DRAFT),
  topic('ukraine-energy', 'energetika', 'Ukrajna energetikája', 'Енергетика України', ukraine, DRAFT),
  topic('ukraine-metallurgy', 'kohaszat', 'Ukrajna kohászata', 'Металургія України', ukraine, DRAFT),
  topic('ukraine-machinery', 'gepgyartas', 'Ukrajna gépgyártása', 'Машинобудування України', ukraine, DRAFT),
  topic('ukraine-transport', 'kozlekedes', 'Ukrajna közlekedése', 'Транспорт України', ukraine, DRAFT),
  topic('ukraine-resorts', 'udulohelyek', 'Ukrajna üdülő- és gyógyhelyei', 'Курорти України', ukraine, DRAFT),
];
export default topics;
