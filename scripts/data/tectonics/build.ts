// Validates build/tectonics/units.geojson (from vectorize.py) and writes the versioned topic package
// public/data/ukraine-tectonics/<dataVersion>/{manifest.json,country.geojson,regions.geojson}
// plus reports/tectonics-validation.{json,md}. Usage: node scripts/data/tectonics/build.ts
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bboxOf, makeLaea, pointInRing, projectedArea, validatePolygon, type Issue, type PolygonCoords } from '../geometry.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const TOPIC_ID = 'ukraine-tectonics';
const DATA_VERSION = '2026.11.09.1';
const ADMIN = 'public/data/ukraine-administration/2026.11.05.1';
const sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');

const EXPECTED: Record<string, { hu: string; uk: string }> = {
  'TU-01': { hu: 'Ukrán-pajzs', uk: 'Український щит' },
  'TU-02': { hu: 'Voronyezsi kristályos masszívum', uk: 'Воронезький кристалічний масив' },
  'TU-03': { hu: 'Volinyi–Podóliai-tábla', uk: 'Волино-Подільська плита' },
  'TU-04': { hu: 'Donyeci gyűrt szerkezet', uk: 'Донецька складчаста споруда' },
  'TU-05': { hu: 'Dnyeper–Donyeci-medence', uk: 'Дніпровсько-Донецька западина' },
  'TU-06': { hu: 'Lembergi-medence', uk: 'Львівська западина' },
  'TU-07': { hu: 'Fekete-tenger melléki medence', uk: 'Причорноморська западина' },
  'TU-08': { hu: 'Kárpátok előtere menti süllyedék', uk: 'Передкарпатський прогин' },
  'TU-09': { hu: 'Kárpáti gyűrt szerkezet', uk: 'Карпатська складчаста споруда' },
  'TU-10': { hu: 'Kárpátaljai-medence', uk: 'Закарпатський прогин' },
  'TU-11': { hu: 'A Krími-hegység gyűrt-rögös szerkezete', uk: 'Складчасто-брилова споруда Гірського Криму' },
};

type Feature = { type: 'Feature'; id: string; properties: { id: string; names: { hu: string; uk: string }; kind: string }; geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown } };
const polysOf = (g: Feature['geometry']): PolygonCoords[] => (g.type === 'Polygon' ? [g.coordinates as PolygonCoords] : (g.coordinates as PolygonCoords[]));
const inPoly = (p: [number, number], polys: PolygonCoords[]) => polys.some((poly) => pointInRing(p, poly[0]!) && !poly.slice(1).some((h) => pointInRing(p, h)));

const checks: Array<{ id: string; status: 'pass' | 'fail'; detail: string }> = [];
const issues: Issue[] = [];
const check = (id: string, ok: boolean, detail: string) => checks.push({ id, status: ok ? 'pass' : 'fail', detail });

const srcText = readFileSync(join(root, 'build/tectonics/units.geojson'), 'utf8');
const vecReport = JSON.parse(readFileSync(join(root, 'build/tectonics/vectorize-report.json'), 'utf8'));
const sourceImage = readFileSync(join(root, 'sources/tectonics/ukraine-tectonics-source.png'));
const features = (JSON.parse(srcText) as { features: Feature[] }).features;
const countryText = readFileSync(join(root, ADMIN, 'country.geojson'), 'utf8');
const country = (JSON.parse(countryText) as { features: Feature[] }).features[0]!;
const countryPolys = polysOf(country.geometry);

const ids = features.map((f) => f.id).sort();
check('unit-ids', JSON.stringify(ids) === JSON.stringify(Object.keys(EXPECTED).sort()), `${ids.length} units: ${ids.join(', ')}`);
const nameProblems = features.filter((f) => f.properties.names.hu !== EXPECTED[f.id]?.hu || f.properties.names.uk !== EXPECTED[f.id]?.uk).map((f) => f.id);
check('unit-names', nameProblems.length === 0, nameProblems.length ? `mismatch: ${nameProblems.join(', ')}` : 'hu/uk names match the owner-provided list');
for (const f of features) for (const poly of polysOf(f.geometry)) issues.push(...validatePolygon(f.id, poly));
check('geometry-validity', issues.length === 0, issues.length ? `${issues.length} issue(s)` : 'all rings closed, finite, no self-intersections, holes inside shells');

// Sampling check on a 0.02° grid: overlaps between units, unit area outside the country, gaps between adjacent units.
const step = 0.02;
const [w, s, e, n] = bboxOf(countryPolys);
let overlap = 0, outside = 0, total = 0, inCountry = 0, covered = 0;
const unitPolys = features.map((f) => ({ id: f.id, polys: polysOf(f.geometry), bbox: bboxOf(polysOf(f.geometry)) }));
for (let y = s + step / 2; y < n; y += step) for (let x = w + step / 2; x < e; x += step) {
  const p: [number, number] = [x, y];
  const inC = inPoly(p, countryPolys);
  if (inC) inCountry++;
  let hits = 0;
  for (const u of unitPolys) {
    if (x < u.bbox[0] || x > u.bbox[2] || y < u.bbox[1] || y > u.bbox[3]) continue;
    if (inPoly(p, u.polys)) hits++;
  }
  if (hits) { total++; if (!inC) outside++; if (inC) covered++; }
  if (hits > 1) overlap++;
}
check('no-overlap', overlap === 0, `${overlap} of ${total} sample points (0.02° grid) fall in more than one unit`);
const outsideShare = outside / Math.max(1, total);
check('inside-country', outsideShare < 0.002, `${outside} of ${total} unit sample points outside the country outline (${(outsideShare * 100).toFixed(2)}%)`);

const laea = makeLaea(31.5, 48.5);
const areas = Object.fromEntries(features.map((f) => [f.id, Math.round(projectedArea(polysOf(f.geometry), laea) / 1e6)]));
const countryKm2 = Math.round(projectedArea(countryPolys, laea) / 1e6);
const unitsKm2 = Object.values(areas).reduce((a, b) => a + b, 0);

const failed = checks.some((c) => c.status === 'fail');
const sorted = [...features].sort((a, b) => (a.id < b.id ? -1 : 1)).map((f) => ({ type: 'Feature', id: f.id, properties: { id: f.id, names: f.properties.names, kind: 'tectonic-unit' }, geometry: f.geometry }));
const regionsText = JSON.stringify({ type: 'FeatureCollection', features: sorted }) + '\n';
const manifest = {
  schemaVersion: 1,
  id: TOPIC_ID,
  dataVersion: DATA_VERSION,
  title: { hu: 'Ukrajna tektonikai szerkezete', uk: 'Тектонічна будова України' },
  geometryKind: 'polygon',
  featureCount: 11,
  bounds: bboxOf(countryPolys).map((v) => Number(v.toFixed(6))),
  layers: { background: { path: 'country.geojson', sha256: sha(countryText) }, questions: { path: 'regions.geojson', sha256: sha(regionsText) } },
  insets: [],
  provenance: {
    source: null, sourceUrl: null, license: null, licenseUrl: null, status: 'unverified',
    ownerStatement: {
      hu: 'A tulajdonos közlése szerint a tankönyvi/tanmeneti tektonikai térkép szerzői jogi szempontból szabadon felhasználhatónak van jelölve. A pontos forrás (könyv, kiadó, oldal) még nincs rögzítve; független ellenőrzés nem történt. A poligonok a térképképről félautomatikusan vektorizált, egyszerűsített oktatási ábrázolások.',
      uk: 'За повідомленням власника, тектонічна карта з підручника/навчальної програми позначена як вільна для використання. Точне джерело (книга, видавець, сторінка) ще не зафіксоване; незалежної перевірки не проводилося. Полігони — напівавтоматично векторизоване спрощене освітнє зображення карти.',
    },
  },
};
const manifestText = JSON.stringify(manifest) + '\n';

const report = {
  topicId: TOPIC_ID, dataVersion: DATA_VERSION, node: process.version,
  source: { file: 'sources/tectonics/ukraine-tectonics-source.png', sha256: sha(sourceImage), bytes: sourceImage.length },
  vectorize: vecReport, checks, issues,
  metrics: { countryKm2, unitsKm2, unitShareOfCountry: Number((unitsKm2 / countryKm2).toFixed(3)), areasKm2: areas, overlapSamples: overlap, outsideSamples: outside, coveredSamples: covered, countrySamples: inCountry },
  outputs: [
    { file: `public/data/${TOPIC_ID}/${DATA_VERSION}/manifest.json`, sha256: sha(manifestText) },
    { file: `public/data/${TOPIC_ID}/${DATA_VERSION}/regions.geojson`, sha256: sha(regionsText), bytes: Buffer.byteLength(regionsText) },
    { file: `public/data/${TOPIC_ID}/${DATA_VERSION}/country.geojson`, sha256: sha(countryText) },
  ],
};
mkdirSync(join(root, 'reports'), { recursive: true });
writeFileSync(join(root, 'reports/tectonics-validation.json'), JSON.stringify(report, null, 2) + '\n');
for (const c of checks) console.log(`${c.status === 'pass' ? 'PASS' : 'FAIL'} ${c.id}: ${c.detail}`);
console.log(`areas km²: ${JSON.stringify(areas)}; units ${unitsKm2} of country ${countryKm2}`);
if (failed) { console.error('Validation failed; package not written.'); process.exit(1); }

const outRoot = join(root, 'public/data', TOPIC_ID);
const finalDir = join(outRoot, DATA_VERSION);
const tmp = join(outRoot, `.tmp-${process.pid}`);
mkdirSync(tmp, { recursive: true });
writeFileSync(join(tmp, 'manifest.json'), manifestText);
writeFileSync(join(tmp, 'regions.geojson'), regionsText);
writeFileSync(join(tmp, 'country.geojson'), countryText);
if (existsSync(finalDir)) rmSync(finalDir, { recursive: true, force: true });
renameSync(tmp, finalDir);
console.log(`Wrote ${finalDir} (regions ${(Buffer.byteLength(regionsText) / 1024).toFixed(0)} KiB)`);
