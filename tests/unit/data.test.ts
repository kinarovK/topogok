import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { partsToPolygons, pointInRing, validatePolygon, type Ring } from '../../scripts/data/geometry.ts';
import { DataError, loadTopic, sha256Hex, validateManifest, validateRegions, type PolygonGeometry } from '../../src/data/validation.ts';

const root = resolve(import.meta.dirname, '../..');
const pkg = join(root, 'public/data/ukraine-administration/2026.11.05.1');
const manifestText = readFileSync(join(pkg, 'manifest.json'), 'utf8');
const regionsText = readFileSync(join(pkg, 'regions.geojson'), 'utf8');
const countryText = readFileSync(join(pkg, 'country.geojson'), 'utf8');
const expected = { id: 'ukraine-administration', dataVersion: '2026.11.05.1' };

// --- geometry validator ---
const sq = (x: number, y: number, s: number): Ring => [[x, y], [x, y + s], [x + s, y + s], [x + s, y], [x, y]]; // clockwise (shapefile shell)
test('geometry: valid square with hole passes; bow-tie, unclosed, NaN and short rings fail', () => {
  const shellCw = sq(0, 0, 10);
  const holeCcw: Ring = [[2, 2], [4, 2], [4, 4], [2, 4], [2, 2]];
  const { polygons, issues } = partsToPolygons('X', [shellCw, holeCcw]);
  assert.equal(issues.length, 0);
  assert.equal(polygons.length, 1);
  assert.equal(polygons[0]!.length, 2);
  assert.deepEqual(validatePolygon('X', polygons[0]!), []);
  const bow: Ring = [[0, 0], [10, 10], [10, 0], [0, 5], [0, 0]];
  assert.ok(validatePolygon('B', [bow]).some((i) => i.code === 'self-intersection'));
  assert.ok(validatePolygon('U', [[[0, 0], [1, 0], [1, 1], [0, 1]]]).some((i) => i.code === 'ring-not-closed'));
  assert.ok(validatePolygon('N', [[[0, 0], [1, 0], [NaN, 1], [0, 0]]]).some((i) => i.code === 'bad-coordinate'));
  assert.ok(validatePolygon('S', [[[0, 0], [1, 0], [0, 0]]]).some((i) => i.code === 'ring-too-short'));
  const outsideHole: Ring = [[20, 20], [22, 20], [22, 22], [20, 22], [20, 20]];
  assert.ok(partsToPolygons('O', [shellCw, outsideHole]).issues.some((i) => i.code === 'orphan-hole'));
});

// --- pipeline end-to-end on corrupted copies ---
function runPipelineOn(mutate: (dir: string) => void): { status: number | null; out: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'topogok-pipe-'));
  cpSync(join(root, 'shp'), join(dir, 'shp'), { recursive: true });
  mutate(dir);
  const r = spawnSync(process.execPath, [join(root, 'scripts/data/build.ts')], { env: { ...process.env, TOPOGOK_ROOT: dir }, encoding: 'utf8' });
  return { status: r.status, out: r.stdout + r.stderr, dir };
}

test('pipeline: clean input builds the same bytes as the committed package', () => {
  const r = runPipelineOn(() => {});
  try {
    assert.equal(r.status, 0, r.out);
    for (const f of ['manifest.json', 'country.geojson', 'regions.geojson']) {
      assert.equal(readFileSync(join(r.dir, 'public/data/ukraine-administration/2026.11.05.1', f), 'utf8'), readFileSync(join(pkg, f), 'utf8'), f);
    }
  } finally { rmSync(r.dir, { recursive: true, force: true }); }
});

test('pipeline rejects a missing .prj and builds nothing', () => {
  const r = runPipelineOn((d) => rmSync(join(d, 'shp/ukraine_oblasts.prj')));
  try {
    assert.equal(r.status, 1);
    assert.match(r.out, /FAIL files-regions/);
    assert.equal(existsSync(join(r.dir, 'public/data')), false);
  } finally { rmSync(r.dir, { recursive: true, force: true }); }
});

test('pipeline rejects an empty Ukrainian name', () => {
  const r = runPipelineOn((d) => {
    const p = join(d, 'shp/ukraine_oblasts.dbf');
    const b = readFileSync(p);
    const needle = Buffer.from('Вінницька область', 'utf8');
    const at = b.indexOf(needle);
    assert.ok(at > 0);
    b.fill(0x20, at, at + needle.length);
    writeFileSync(p, b);
  });
  try {
    assert.equal(r.status, 1);
    assert.match(r.out, /FAIL region-names: UA-05: empty name_uk/);
    assert.equal(existsSync(join(r.dir, 'public/data/ukraine-administration/2026.11.05.1')), false);
  } finally { rmSync(r.dir, { recursive: true, force: true }); }
});

test('pipeline rejects a corrupted coordinate', () => {
  const r = runPipelineOn((d) => {
    const p = join(d, 'shp/ukraine_oblasts.shp');
    const b = readFileSync(p);
    // first record: header 100 + record header 8 + content: type(4) bbox(32) nParts(4) nPoints(4) parts(4*n)
    const nParts = b.readInt32LE(100 + 8 + 36);
    const firstPoint = 100 + 8 + 44 + 4 * nParts;
    b.writeDoubleLE(Number.NaN, firstPoint + 16 * 5);
    writeFileSync(p, b);
  });
  try {
    assert.equal(r.status, 1);
    assert.match(r.out, /FAIL geometry-validity/);
  } finally { rmSync(r.dir, { recursive: true, force: true }); }
});

// --- runtime loader (T12 / T24) ---
const fetchFrom = (files: Record<string, string>) => async (url: string) => {
  const name = url.split('/').pop()!;
  if (!(name in files)) throw new Error('404');
  return files[name]!;
};
const good = { 'manifest.json': manifestText, 'regions.geojson': regionsText, 'country.geojson': countryText };

test('T12 committed package: 27 IDs, names in both languages, country, insets, provenance unverified', async () => {
  const topic = await loadTopic('/data/', expected, fetchFrom(good));
  assert.equal(topic.regions.length, 27);
  assert.equal(new Set(topic.regions.map((r) => r.id)).size, 27);
  for (const r of topic.regions) {
    assert.equal(r.id, r.properties.id);
    assert.ok(r.properties.names.hu.length > 0 && r.properties.names.uk.length > 0);
  }
  assert.equal(topic.regions.find((r) => r.id === 'UA-40')!.properties.kind, 'city');
  assert.equal(topic.regions.find((r) => r.id === 'UA-43')!.properties.kind, 'autonomous-republic');
  assert.deepEqual(topic.manifest.insets.map((i) => i.anchorFeatureId), ['UA-30', 'UA-40']);
  assert.equal(topic.manifest.provenance.status, 'unverified');
  assert.match(topic.manifest.provenance.source ?? '', /Гільберг.*Генеза, 2025.*ISBN 978-617-8468-07-1/);
  assert.equal(topic.manifest.provenance.license, null);
  assert.equal(topic.country.id, 'UA');
  assert.equal(await sha256Hex(regionsText), topic.manifest.layers.questions.sha256);
});

test('T24 loader rejects hash mismatch, missing name, wrong data version, missing file and bad JSON', async () => {
  const reject = async (files: Record<string, string>, kind: 'load' | 'invalid', re: RegExp) => {
    await assert.rejects(loadTopic('/data/', expected, fetchFrom(files)), (e: unknown) => e instanceof DataError && e.kind === kind && re.test(e.message));
  };
  await reject({ ...good, 'regions.geojson': regionsText.replace('"Volinyi terület"', '"Volinyi terulet"') }, 'invalid', /hash mismatch/);
  const noName = JSON.parse(regionsText);
  noName.features[3].properties.names.uk = '';
  assert.throws(() => validateRegions(noName, JSON.parse(manifestText)), /names for/);
  noName.features[3].properties.names.uk = 'x';
  noName.features.pop();
  assert.throws(() => validateRegions(noName, JSON.parse(manifestText)), /expected 27 features/);
  assert.throws(() => validateManifest(JSON.parse(manifestText), { ...expected, dataVersion: '2099.01.01.1' }), /dataVersion/);
  await reject({ 'manifest.json': manifestText, 'country.geojson': countryText }, 'load', /regions.geojson/);
  await reject({ ...good, 'manifest.json': '{not json' }, 'invalid', /invalid JSON/);
});

test('tectonics package: 11 units with hu/uk names, kind tectonic-unit, provenance unverified, valid via the runtime loader', async () => {
  const dir = join(root, 'public/data/ukraine-tectonics/2026.11.09.1');
  const files = Object.fromEntries(['manifest.json', 'regions.geojson', 'country.geojson'].map((f) => [f, readFileSync(join(dir, f), 'utf8')]));
  const topic = await loadTopic('/t/', { id: 'ukraine-tectonics', dataVersion: '2026.11.09.1' }, fetchFrom(files));
  assert.equal(topic.regions.length, 11);
  assert.deepEqual(topic.regions.map((r) => r.id), ['TU-01', 'TU-02', 'TU-03', 'TU-04', 'TU-05', 'TU-06', 'TU-07', 'TU-08', 'TU-09', 'TU-10', 'TU-11']);
  for (const r of topic.regions) {
    assert.equal(r.properties.kind, 'tectonic-unit');
    assert.ok(r.properties.names.hu && r.properties.names.uk);
  }
  assert.equal(topic.regions.find((r) => r.id === 'TU-01')!.properties.names.uk, 'Український щит');
  assert.equal(topic.manifest.provenance.status, 'unverified');
  assert.match(topic.manifest.provenance.source ?? '', /Гільберг.*мал\. 14\.2/);
  assert.deepEqual(topic.manifest.insets, []);
  // Same country background as the administration topic.
  assert.equal(files['country.geojson'], countryText);
});

test('continents package: 6 continents + 5 oceans with hu/uk names, Natural Earth provenance, precomputed label points inside their unit', async () => {
  const dir = join(root, 'public/data/world-continents/2026.11.11.1');
  const files = Object.fromEntries(['manifest.json', 'regions.geojson', 'country.geojson'].map((f) => [f, readFileSync(join(dir, f), 'utf8')]));
  const topic = await loadTopic('/w/', { id: 'world-continents', dataVersion: '2026.11.11.1' }, fetchFrom(files));
  assert.deepEqual(topic.regions.map((r) => r.id), ['C-AF', 'C-AN', 'C-AU', 'C-EA', 'C-NA', 'C-SA', 'O-AR', 'O-AT', 'O-IN', 'O-PA', 'O-SO']);
  assert.equal(topic.regions.filter((r) => r.properties.kind === 'continent').length, 6);
  assert.equal(topic.regions.filter((r) => r.properties.kind === 'ocean').length, 5);
  assert.equal(topic.regions.find((r) => r.id === 'O-AR')!.properties.names.uk, 'Північний Льодовитий океан');
  assert.equal(topic.regions.find((r) => r.id === 'C-EA')!.properties.names.hu, 'Eurázsia');
  assert.equal(topic.manifest.provenance.status, 'verified');
  assert.equal(topic.manifest.provenance.license, 'Public domain');
  assert.equal(topic.country.id, 'LAND');
  assert.equal((JSON.parse(files['manifest.json']!) as { projection?: string }).projection, 'robinson-display');
  for (const r of topic.regions) {
    const p = r.properties.label;
    assert.ok(p, `${r.id} has a label point`);
    const g = r.geometry as PolygonGeometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    assert.ok(polys.some((poly) => pointInRing(p as [number, number], poly[0] as [number, number][]) && !poly.slice(1).some((h) => pointInRing(p as [number, number], h as [number, number][]))), `${r.id} label point inside`);
  }
});
