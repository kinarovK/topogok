// 10th grade topics (regions and countries of the world). Sources: sources/grade10/<topic>/*.geojson, made by
// make_sources.py. Usage: npm run data:topic -- scripts/data/grade10/topics.ts
import type { ProjectionConfig } from '../projection.ts';
import type { LocalizedText, TopicConfig } from '../topic.ts';

const DATA_VERSION = '2026.11.18.1';
const T: Record<string, LocalizedText> = {
  nyugat: { hu: 'Nyugat-Európa', uk: 'Західна Європа' }, eszak: { hu: 'Észak-Európa', uk: 'Північна Європа' }, del: { hu: 'Dél-Európa', uk: 'Південна Європа' },
  kelet: { hu: 'Kelet-Európa', uk: 'Східна Європа' },
  delkelet: { hu: 'Délkelet-Ázsia', uk: 'Південно-Східна Азія' }, kozep: { hu: 'Közép-Ázsia', uk: 'Центральна Азія' },
  foorszagok: { hu: 'Fő országok', uk: 'Головні країни' }, tovabbi: { hu: 'További országok', uk: 'Інші країни' },
  ausztraliavarosok: { hu: 'Ausztrália városai', uk: 'Міста Австралії' }, allamok: { hu: 'Óceánia államai', uk: 'Держави Океанії' },
  orszagok: { hu: 'Országok', uk: 'Країни' }, kozpontok: { hu: 'Központok és bányavidékek', uk: 'Центри та гірничі райони' },
  kikotok: { hu: 'Kikötők', uk: 'Порти' }, csatornak: { hu: 'Csatornák', uk: 'Канали' }, varosok: { hu: 'Városok és térségek', uk: 'Міста та регіони' },
  folyok: { hu: 'Folyók', uk: 'Річки' }, hegysegek: { hu: 'Hegységek', uk: 'Гори' },
};
// Region-wise layer titles where one id names a different region per topic.
const ASIA: Record<string, LocalizedText> = { ...T, kelet: { hu: 'Kelet-Ázsia', uk: 'Східна Азія' }, del: { hu: 'Dél-Ázsia', uk: 'Південна Азія' }, nyugat: { hu: 'Nyugat-Ázsia', uk: 'Західна Азія' } };
const NE: TopicConfig['provenance'] = { source: 'Natural Earth (public domain), points from atlas knowledge (to be checked)', sourceUrl: 'https://www.naturalearthdata.com/', license: 'Public domain', licenseUrl: 'https://www.naturalearthdata.com/about/terms-of-use/', status: 'unverified' };
const laea = (lon: number, lat: number): ProjectionConfig => ({ name: 'laea', center: [lon, lat] });
const topic = (id: string, folder: string, hu: string, uk: string, projection: ProjectionConfig, titles = T, extra: Partial<TopicConfig> = {}): TopicConfig => ({
  id, dataVersion: DATA_VERSION, title: { hu, uk }, source: `sources/grade10/${folder}`, projection, layerTitles: titles, provenance: NE, mountainLayers: ['hegysegek'], ...extra,
});

const topics: TopicConfig[] = [
  topic('europe-countries', 'europa', 'Európa országai', 'Країни Європи', laea(15, 52)),
  topic('asia-countries', 'azsia', 'Ázsia országai', 'Країни Азії', laea(85, 28), ASIA, { pointsAnywhere: true }),
  topic('america-countries', 'amerika', 'Amerika országai', 'Країни Америки', laea(-80, 15)),
  topic('oceania-countries', 'oceania', 'Ausztrália és Óceánia', 'Австралія та Океанія', laea(150, -15), T, { pointsAnywhere: true }),
  topic('africa-economy', 'afrika', 'Afrika gazdasága', 'Господарство Африки', laea(18, 2)),
  topic('western-europe-g7', 'nyugateuropa', 'Németország, Franciaország, Egyesült Királyság, Olaszország, Lengyelország', 'Німеччина, Франція, Велика Британія, Італія, Польща', laea(8, 49)),
  topic('russia', 'oroszorszag', 'Oroszország', 'Росія', { name: 'lcc', centralMeridian: 100, parallels: [52, 68] }),
  topic('east-asia', 'keletazsia', 'Kína, Japán, Dél-Korea', 'Китай, Японія, Південна Корея', laea(118, 34)),
  topic('india', 'india', 'India', 'Індія', laea(80, 22)),
  topic('usa-canada', 'eszakamerika', 'Amerikai Egyesült Államok és Kanada', 'США і Канада', { name: 'lcc', centralMeridian: -100, parallels: [33, 60] }),
  topic('brazil', 'brazilia', 'Brazília', 'Бразилія', laea(-53, -14)),
  topic('egypt-south-africa', 'egyiptomdaf', 'Egyiptom és a Dél-afrikai Köztársaság', 'Єгипет і Південно-Африканська Республіка', laea(25, 0)),
];
export default topics;
