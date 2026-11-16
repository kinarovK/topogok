// One topic per continent from the owner's GeoPackage (layers named <continent>_<layer>), each drawn on its own
// continent only: the base is that continent from the world topic's land (build/world, made by data:world).
// Projections as in school atlases: Lambert azimuthal equal-area centred on the compact continents, Lambert
// conformal conic for the wide northern ones (Europe keeps its familiar shape), polar Hammer for Antarctica. Usage: npm run data:topic -- scripts/data/continents/topics.ts
import type { ProjectionConfig } from '../projection.ts';
import type { LocalizedText, TopicConfig } from '../topic.ts';

const DATA_VERSION = '2026.11.16.2';
const SOURCE = 'sources/continents/foldrajz_07_osztaly.gpkg';
const BASE = 'build/world/world_continents.shp';

const LAYER_TITLES: Record<string, LocalizedText> = {
  teruletek: { hu: 'Területek', uk: 'Території' },
  tengerek: { hu: 'Tengerek', uk: 'Моря' },
  oceanok: { hu: 'Óceánok', uk: 'Океани' },
  vonalak: { hu: 'Vonalak', uk: 'Лінії' },
  pontok: { hu: 'Pontok', uk: 'Точки' },
};

const continent = (id: string, prefix: string, base: string, projection: ProjectionConfig, title: LocalizedText, extra: Partial<TopicConfig> = {}): TopicConfig => ({
  id, dataVersion: DATA_VERSION, title, source: SOURCE, layerPrefix: `${prefix}_`,
  background: BASE, backgroundIds: [base],
  projection,
  layerTitles: LAYER_TITLES,
  waterLayers: ['tengerek', 'oceanok'],
  // Lakes and bays kept in the "teruletek" layers of the source.
  waterIds: [
    'csadto', 'guineaiobol', 'nyaszato', 'tanganyikato', 'viktoriato',
    'bajkalto', 'bengaliobol', 'kaszpitenger', 'perzsaobol', 'vizcayaiobol',
    'hudsonobol', 'kaliforniaiobol', 'mexikoiobol',
    'maracaiboto', 'titicacato',
    'carpentariaobol', 'nagyausztraliaiobol',
  ],
  // Owner-made data: no source link or licence was given, so none is claimed.
  provenance: { source: 'foldrajz_07_osztaly.gpkg (owner)', sourceUrl: null, license: null, licenseUrl: null, status: 'unverified' },
  ...extra,
});

const topics: TopicConfig[] = [
  continent('continent-africa', 'afrika', 'C-AF', { name: 'laea', center: [18, 2] }, { hu: 'Afrika', uk: 'Африка' }),
  continent('continent-antarctica', 'antarktisz', 'C-AN', { name: 'hammer', center: [0, -90] }, { hu: 'Antarktisz', uk: 'Антарктида' }),
  continent('continent-australia-oceania', 'ausztraliaesoceania', 'C-AU', { name: 'laea', center: [155, -22] }, { hu: 'Ausztrália és Óceánia', uk: 'Австралія та Океанія' }),
  continent('continent-south-america', 'delamerika', 'C-SA', { name: 'laea', center: [-60, -22] }, { hu: 'Dél-Amerika', uk: 'Південна Америка' }),
  continent('continent-north-america', 'eszakamerika', 'C-NA', { name: 'lcc', centralMeridian: -100, parallels: [25, 65] }, { hu: 'Észak-Amerika', uk: 'Північна Америка' },
    // The Arctic archipelago makes Canada and the USA very detailed: coarser outlines keep the package small.
    { simplifyAreas: { teruletek: 0.03 } }),
  continent('continent-eurasia', 'eurazsia', 'C-EA', { name: 'lcc', centralMeridian: 60, parallels: [30, 62] }, { hu: 'Eurázsia', uk: 'Євразія' }),
];
export default topics;
