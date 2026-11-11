// Validates build/world/{units,background}.geojson (from derive.py) and writes the versioned topic package
// public/data/world-continents/<dataVersion>/{manifest.json,country.geojson,regions.geojson}
// plus reports/world-validation.json. Usage: node scripts/data/world/build.ts [--check]
// --check: rebuild in memory and fail if the committed package differs (reproducibility gate).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pointInRing, validatePolygon, type Issue, type PolygonCoords } from '../geometry.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const TOPIC_ID = 'world-continents';
const DATA_VERSION = '2026.11.11.1';
const CHECK = process.argv.includes('--check');
const sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');

const EXPECTED: Record<string, { hu: string; uk: string; kind: 'continent' | 'ocean' }> = {
  'C-AF': { hu: 'Afrika', uk: 'Африка', kind: 'continent' },
  'C-AN': { hu: 'Antarktisz', uk: 'Антарктида', kind: 'continent' },
  'C-AU': { hu: 'Ausztrália', uk: 'Австралія', kind: 'continent' },
  'C-EA': { hu: 'Eurázsia', uk: 'Євразія', kind: 'continent' },
  'C-NA': { hu: 'Észak-Amerika', uk: 'Північна Америка', kind: 'continent' },
  'C-SA': { hu: 'Dél-Amerika', uk: 'Південна Америка', kind: 'continent' },
  'O-AR': { hu: 'Északi-Jeges-tenger', uk: 'Північний Льодовитий океан', kind: 'ocean' },
  'O-AT': { hu: 'Atlanti-óceán', uk: 'Атлантичний океан', kind: 'ocean' },
  'O-IN': { hu: 'Indiai-óceán', uk: 'Індійський океан', kind: 'ocean' },
  'O-PA': { hu: 'Csendes-óceán', uk: 'Тихий океан', kind: 'ocean' },
  'O-SO': { hu: 'Déli-óceán', uk: 'Південний океан', kind: 'ocean' },
};

type Geometry = { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown };
type Feature = { type: 'Feature'; id: string; properties: { id: string; names: { hu: string; uk: string }; kind: string; label?: [number, number]; labelMinZoom?: { hu: number; uk: number }; labelWidth?: { hu: number; uk: number } }; geometry: Geometry };
const polysOf = (g: Geometry): PolygonCoords[] => (g.type === 'Polygon' ? [g.coordinates as PolygonCoords] : (g.coordinates as PolygonCoords[]));
const inPoly = (p: [number, number], polys: PolygonCoords[]) => polys.some((poly) => pointInRing(p, poly[0]!) && !poly.slice(1).some((h) => pointInRing(p, h)));

const checks: Array<{ id: string; status: 'pass' | 'fail'; detail: string }> = [];
const issues: Issue[] = [];
const check = (id: string, ok: boolean, detail: string) => checks.push({ id, status: ok ? 'pass' : 'fail', detail });

const units = (JSON.parse(readFileSync(join(root, 'build/world/units.geojson'), 'utf8')) as { features: Feature[] }).features;
const land = (JSON.parse(readFileSync(join(root, 'build/world/background.geojson'), 'utf8')) as { features: Feature[] }).features[0]!;
// Robinson display coordinates (see derive.py): this is what the package ships; checks below run on geographic data.
const display = JSON.parse(readFileSync(join(root, 'build/world/display.geojson'), 'utf8')) as { bounds: [number, number, number, number]; labels: Record<string, unknown>; features: Feature[]; background: Feature };
const derive = JSON.parse(readFileSync(join(root, 'build/world/derive-report.json'), 'utf8')) as { checks: Array<{ id: string; ok: boolean; detail: unknown }> };
const sources = ['shp/ne_110m_land.shp', 'shp/ne_110m_land.dbf'].map((f) => ({ file: f, sha256: sha(readFileSync(join(root, f))) }));

const ids = units.map((f) => f.id).sort();
check('unit-ids', JSON.stringify(ids) === JSON.stringify(Object.keys(EXPECTED).sort()), `${ids.length} units: ${ids.join(', ')}`);
const nameProblems = units.filter((f) => { const e = EXPECTED[f.id]; return !e || f.properties.names.hu !== e.hu || f.properties.names.uk !== e.uk || f.properties.kind !== e.kind; }).map((f) => f.id);
check('unit-names', nameProblems.length === 0, nameProblems.length ? `mismatch: ${nameProblems.join(', ')}` : 'hu/uk names and kinds match');
for (const f of [...units, land]) for (const poly of polysOf(f.geometry)) issues.push(...validatePolygon(f.id, poly));
check('geometry-validity', issues.length === 0, issues.length ? `${issues.length} issue(s)` : 'all rings closed, finite, no self-intersections, holes inside shells');
const displayIssues: Issue[] = [];
for (const f of [...display.features, display.background]) for (const poly of polysOf(f.geometry)) displayIssues.push(...validatePolygon(`display:${f.id}`, poly));
issues.push(...displayIssues);
check('display-geometry-validity', displayIssues.length === 0, displayIssues.length ? `${displayIssues.length} issue(s)` : 'Robinson display geometry is valid');
const badLabels = display.features.filter((f) => !f.properties.label || !inPoly(f.properties.label, polysOf(f.geometry))).map((f) => f.id);
check('labels-inside', badLabels.length === 0, badLabels.length ? `outside: ${badLabels.join(', ')}` : `label points inside their unit; placement ${JSON.stringify(display.labels)}`);
for (const c of derive.checks) check(`derive-${c.id}`, c.ok, JSON.stringify(c.detail));

// Sampling on a 1° grid (cell centres): every point is in exactly one ocean, or on land; continents lie on land.
const unitPolys = units.map((f) => ({ id: f.id, kind: f.properties.kind, polys: polysOf(f.geometry) }));
const landPolys = polysOf(land.geometry);
let overlap = 0, gaps = 0, continentOffLand = 0, samples = 0;
for (let y = -89.5; y < 90; y += 1) for (let x = -179.5; x < 180; x += 1) {
  const p: [number, number] = [x, y];
  samples++;
  const hits = unitPolys.filter((u) => inPoly(p, u.polys));
  const onLand = inPoly(p, landPolys);
  if (hits.length > 1) overlap++;
  if (hits.length === 0 && !onLand && !(x > 46 && x < 55.5 && y > 36 && y < 47.5)) gaps++; // Caspian Sea is neither land nor ocean
  if (hits.some((h) => h.kind === 'continent') && !onLand) continentOffLand++;
}
check('no-overlap', overlap === 0, `${overlap} of ${samples} sample points in more than one unit`);
check('oceans-fill-water', gaps === 0, `${gaps} water sample points outside every ocean (Caspian excluded)`);
check('continents-on-land', continentOffLand === 0, `${continentOffLand} continent sample points off land`);

const failed = checks.some((c) => c.status === 'fail');
const sorted = [...display.features].sort((a, b) => (a.id < b.id ? -1 : 1)).map((f) => ({ type: 'Feature', id: f.id, properties: { id: f.id, names: f.properties.names, kind: f.properties.kind, label: f.properties.label, labelMinZoom: f.properties.labelMinZoom, labelWidth: f.properties.labelWidth }, geometry: f.geometry }));
const regionsText = JSON.stringify({ type: 'FeatureCollection', features: sorted }) + '\n';
const countryText = JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', id: 'LAND', properties: { id: 'LAND', names: { hu: 'Szárazföld', uk: 'Суходіл' } }, geometry: display.background.geometry }] }) + '\n';
const manifest = {
  schemaVersion: 1,
  id: TOPIC_ID,
  dataVersion: DATA_VERSION,
  title: { hu: 'Kontinensek topója', uk: 'Материки та океани' },
  geometryKind: 'polygon',
  featureCount: 11,
  bounds: display.bounds,
  projection: 'robinson-display',
  layers: { background: { path: 'country.geojson', sha256: sha(countryText) }, questions: { path: 'regions.geojson', sha256: sha(regionsText) } },
  insets: [],
  provenance: {
    source: 'Natural Earth, 1:110m Physical Vectors: Land, v4.1.0', sourceUrl: 'https://www.naturalearthdata.com/downloads/110m-physical-vectors/',
    license: 'Public domain', licenseUrl: 'https://www.naturalearthdata.com/about/terms-of-use/', status: 'verified',
    ownerStatement: {
      hu: 'A kontinensek és az öt óceán határát a TopoGok pipeline-ja vezette le a Natural Earth szárazföldi poligonjaiból (Szuez és Panama mentén bontva; az óceánhatárok egyszerűsített, oktatási célú vonalak). Az óceáni szigetek (pl. Új-Zéland, Hawaii) nem tartoznak kontinenshez.',
      uk: 'Межі материків і п’яти океанів TopoGok вивів із полігонів суходолу Natural Earth (поділ уздовж Суецу й Панами; межі океанів — спрощені навчальні лінії). Океанічні острови (напр., Нова Зеландія, Гаваї) не належать до материків.',
    },
  },
};
const manifestText = JSON.stringify(manifest) + '\n';

const report = {
  topicId: TOPIC_ID, dataVersion: DATA_VERSION, node: process.version, sources, checks, issues,
  metrics: { samples, overlap, gaps, continentOffLand },
  outputs: [
    { file: `public/data/${TOPIC_ID}/${DATA_VERSION}/manifest.json`, sha256: sha(manifestText) },
    { file: `public/data/${TOPIC_ID}/${DATA_VERSION}/regions.geojson`, sha256: sha(regionsText), bytes: Buffer.byteLength(regionsText) },
    { file: `public/data/${TOPIC_ID}/${DATA_VERSION}/country.geojson`, sha256: sha(countryText), bytes: Buffer.byteLength(countryText) },
  ],
};
for (const c of checks) console.log(`${c.status === 'pass' ? 'PASS' : 'FAIL'} ${c.id}: ${c.detail}`);
for (const i of issues.slice(0, 20)) console.log(`  ${i.featureId} ${i.code}: ${i.detail}`);
if (failed) { console.error('Validation failed; package not written.'); process.exit(1); }

const outRoot = join(root, 'public/data', TOPIC_ID);
const finalDir = join(outRoot, DATA_VERSION);
const files: Record<string, string> = { 'manifest.json': manifestText, 'regions.geojson': regionsText, 'country.geojson': countryText };
if (CHECK) {
  const diff = Object.entries(files).filter(([n, text]) => !existsSync(join(finalDir, n)) || readFileSync(join(finalDir, n), 'utf8') !== text).map(([n]) => n);
  if (diff.length) { console.error(`FAIL: committed package differs from a fresh build: ${diff.join(', ')}`); process.exit(1); }
  console.log(`OK: committed package ${DATA_VERSION} is byte-identical to a fresh build.`);
  process.exit(0);
}
mkdirSync(join(root, 'reports'), { recursive: true });
writeFileSync(join(root, 'reports/world-validation.json'), JSON.stringify(report, null, 2) + '\n');
const tmp = join(outRoot, `.tmp-${process.pid}`);
mkdirSync(tmp, { recursive: true });
for (const [n, text] of Object.entries(files)) writeFileSync(join(tmp, n), text);
if (existsSync(finalDir)) rmSync(finalDir, { recursive: true, force: true });
renameSync(tmp, finalDir);
console.log(`Wrote ${finalDir} (regions ${(Buffer.byteLength(regionsText) / 1024).toFixed(0)} KiB, land ${(Buffer.byteLength(countryText) / 1024).toFixed(0)} KiB)`);
