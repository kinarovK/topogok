// One topic per continent from the owner's GeoPackage (layers named <continent>_<layer>), each drawn on its own
// continent only: the base is that continent cut from Natural Earth 1:50m land (scripts/data/coast.ts), land areas
// are clipped to the coast and seas to the water.
// Projections as in school atlases: Lambert azimuthal equal-area centred on the compact continents, Lambert
// conformal conic for the wide northern ones (Europe keeps its familiar shape), polar Hammer for Antarctica. Usage: npm run data:topic -- scripts/data/continents/topics.ts
import type { ProjectionConfig } from '../projection.ts';
import type { LocalizedText, TopicConfig } from '../topic.ts';

const DATA_VERSION = '2026.11.16.3';
const SOURCE = 'sources/continents/foldrajz_07_osztaly.gpkg';
const BASE = 'build/world/world_continents.shp';

const LAND = 'shp/ne_50m_land.shp';
const SEA_LAYERS = ['tengerek', 'oceanok'];
// Bays kept in the "teruletek" layers of the source: clipped to the water, drawn as water.
const SEA_IDS = ['guineaiobol', 'bengaliobol', 'perzsaobol', 'vizcayaiobol', 'hudsonobol', 'kaliforniaiobol', 'mexikoiobol', 'carpentariaobol', 'nagyausztraliaiobol', 'laplata'];
// Lakes: drawn as water, kept as drawn (they lie on the land).
const LAKE_IDS = ['csadto', 'nyaszato', 'tanganyikato', 'viktoriato', 'bajkalto', 'kaszpitenger', 'maracaiboto', 'titicacato', 'nagytavak'];
// Kept as drawn: lakes, and the reef (it lies in the sea).
const KEEP_IDS = [...LAKE_IDS, 'nagykorallzatony'];
// Island groups: their islands, each grown by ~45 km so that small islands stay visible and tappable.
const ISLAND_IDS = ['polinezia', 'mikronezia', 'melanezia', 'kisantillak'];
// Countries are left out (owner decision 2026-11-16): they come in a later political topic.
const COUNTRIES = ['brazilia', 'argentina', 'chile', 'kanada', 'amerikaiegyesultallamok', 'mexiko'];

const LAYER_TITLES: Record<string, LocalizedText> = {
  teruletek: { hu: 'Területek', uk: 'Території' },
  tengerek: { hu: 'Tengerek', uk: 'Моря' },
  oceanok: { hu: 'Óceánok', uk: 'Океани' },
  vonalak: { hu: 'Vonalak', uk: 'Лінії' },
  pontok: { hu: 'Pontok', uk: 'Точки' },
};

const continent = (id: string, prefix: string, base: string, projection: ProjectionConfig, title: LocalizedText, extra: Partial<TopicConfig> = {}): TopicConfig => ({
  id, dataVersion: DATA_VERSION, title, source: SOURCE, layerPrefix: `${prefix}_`,
  coast: { land: LAND, continents: BASE, continent: base, seaLayers: SEA_LAYERS, seaIds: SEA_IDS, keepIds: KEEP_IDS, islandIds: ISLAND_IDS },
  excludeIds: COUNTRIES,
  projection,
  layerTitles: LAYER_TITLES,
  waterLayers: SEA_LAYERS,
  waterIds: [...SEA_IDS, ...LAKE_IDS],
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
