// 8th grade topics (Ukraine's physical geography). Sources: sources/ukraine8/<topic>/*.geojson, made by
// make_sources.py from Natural Earth 1:10m (Ukraine point of view) plus hand-placed points and ridge lines.
// Usage: npm run data:topic -- scripts/data/ukraine8/topics.ts
import type { LocalizedText, TopicConfig } from '../topic.ts';

const DATA_VERSION = '2026.11.18.1';
const LAYER_TITLES: Record<string, LocalizedText> = {
  orszagok: { hu: 'Országok', uk: 'Країни' },
  tengerek: { hu: 'Tengerek', uk: 'Моря' },
  hegysegek: { hu: 'Hegységek', uk: 'Гори' },
  pontok: { hu: 'Pontok', uk: 'Точки' },
  alfoldek: { hu: 'Alföldek és síkságok', uk: 'Низовини та рівнини' },
  hatsagok: { hu: 'Hátságok', uk: 'Височини' },
  csucsok: { hu: 'Csúcsok', uk: 'Вершини' },
  szen: { hu: 'Szénmedencék', uk: 'Вугільні басейни' },
  koolajfoldgaz: { hu: 'Kőolaj- és földgázvidékek', uk: 'Нафтогазоносні регіони' },
  ercek: { hu: 'Ércmedencék', uk: 'Рудні басейни' },
  ovezetek: { hu: 'Természeti övezetek', uk: 'Природні зони' },
};
const provenance: TopicConfig['provenance'] = { source: 'Natural Earth 1:10m (public domain), hand-placed points and ridge lines', sourceUrl: 'https://www.naturalearthdata.com/', license: 'Public domain', licenseUrl: 'https://www.naturalearthdata.com/about/terms-of-use/', status: 'unverified' };

const DRAFT = { ...provenance, source: 'Draft outlines from atlas knowledge (to be corrected by the owner), Natural Earth 1:10m base' };

const topics: TopicConfig[] = [
  {
    id: 'ukraine-position', dataVersion: DATA_VERSION,
    title: { hu: 'Ukrajna fekvése és határai', uk: 'Географічне положення та кордони України' },
    source: 'sources/ukraine8/fekves',
    projection: { name: 'laea', center: [31, 47.5] },
    waterLayers: ['tengerek'], mountainLayers: ['hegysegek'], layerTitles: LAYER_TITLES,
    provenance,
  },
  {
    id: 'ukraine-relief', dataVersion: DATA_VERSION,
    title: { hu: 'Ukrajna felszínformái', uk: 'Рельєф України' },
    source: 'sources/ukraine8/felszin', projection: { name: 'laea', center: [31, 48.5] },
    mountainLayers: ['hegysegek'], layerTitles: LAYER_TITLES, provenance: DRAFT,
  },
  {
    id: 'ukraine-minerals', dataVersion: DATA_VERSION,
    title: { hu: 'Ukrajna ásványkincsei', uk: 'Корисні копалини України' },
    source: 'sources/ukraine8/asvanykincs', projection: { name: 'laea', center: [31, 48.5] },
    layerTitles: LAYER_TITLES, provenance: DRAFT,
  },
  {
    id: 'ukraine-zones', dataVersion: DATA_VERSION,
    title: { hu: 'Ukrajna természeti övezetei', uk: 'Природні зони України' },
    source: 'sources/ukraine8/ovezetek', projection: { name: 'laea', center: [31, 48.5] },
    layerTitles: LAYER_TITLES, provenance: DRAFT,
  },
];
export default topics;
