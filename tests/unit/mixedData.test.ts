import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { makeMixed, MIXED_LAYERS } from '../../scripts/data/fixtures/make-mixed.ts';
import { writeGeoJson, writeGpkg, writeShapefile, type FixtureFeature } from '../../scripts/data/fixtures/write.ts';
import { readShp, shapeKind } from '../../scripts/data/shapefile.ts';
import { buildTopic, simplifyLine, type TopicConfig } from '../../scripts/data/topic.ts';
import { parseGpkgGeometry, parseWkb } from '../../scripts/data/wkb.ts';
import config from '../fixtures/mixed/topic.ts';

const tmp = () => mkdtempSync(join(tmpdir(), 'topogok-mixed-'));
const cfg = (source: string, extra: Partial<TopicConfig> = {}): TopicConfig => ({ ...config, source, ...extra });

test('WKB: 2D, ISO Z/M and EWKB codes; GeoPackage header with envelope', () => {
  const f64 = (...v: number[]) => { const b = Buffer.alloc(v.length * 8); v.forEach((x, i) => b.writeDoubleLE(x, i * 8)); return b; };
  const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0, 0); return b; };
  const lineZ = Buffer.concat([Buffer.from([1]), u32(1002), u32(2), f64(1, 2, 99, 3, 4, 99)]);
  assert.deepEqual(parseWkb(lineZ).geometry, { type: 'LineString', coordinates: [[1, 2], [3, 4]] });
  const ewkbPointZM = Buffer.concat([Buffer.from([1]), u32(0x80000001 | 0x40000000), f64(5, 6, 7, 8)]);
  assert.deepEqual(parseWkb(ewkbPointZM).geometry, { type: 'Point', coordinates: [5, 6] });
  const multi = Buffer.concat([Buffer.from([1]), u32(5), u32(1), Buffer.from([1]), u32(2), u32(2), f64(0, 0, 1, 1)]);
  assert.deepEqual(parseWkb(multi).geometry, { type: 'MultiLineString', coordinates: [[[0, 0], [1, 1]]] });
  const point = Buffer.concat([Buffer.from([1]), u32(1), f64(9, 8)]);
  const withEnvelope = Buffer.concat([Buffer.from([0x47, 0x50, 0, 0b011, 0xe6, 0x10, 0, 0]), f64(9, 9, 8, 8), point]);
  assert.deepEqual(parseGpkgGeometry(withEnvelope), { srsId: 4326, geometry: { type: 'Point', coordinates: [9, 8] } });
  assert.throws(() => parseWkb(Buffer.concat([Buffer.from([1]), u32(7), u32(0)])), /unsupported/);
});

test('SHP: point and polyline layers are read; Z/M shape types map to their 2D kind', () => {
  assert.deepEqual([1, 11, 21, 3, 13, 23, 5, 15, 25, 8].map(shapeKind), ['point', 'point', 'point', 'line', 'line', 'line', 'polygon', 'polygon', 'polygon', null]);
  const dir = tmp();
  writeShapefile(join(dir, 'p'), MIXED_LAYERS['pontok']!);
  writeShapefile(join(dir, 'l'), MIXED_LAYERS['folyok']!);
  assert.deepEqual(readShp(join(dir, 'p.shp')).records.map((r) => r.point), [[19.5, 9], [14.5, 3], [20, 2]]);
  assert.deepEqual(readShp(join(dir, 'l.shp')).records[2]!.parts.length, 2);
  // PointZ: x, y, z, m in one record.
  const shp = readFileSync(join(dir, 'p.shp'));
  const rec = Buffer.alloc(8 + 36); rec.writeInt32BE(1, 0); rec.writeInt32BE(18, 4); rec.writeInt32LE(11, 8); rec.writeDoubleLE(1.5, 12); rec.writeDoubleLE(2.5, 20);
  const head = Buffer.from(shp.subarray(0, 100)); head.writeInt32LE(11, 32); head.writeInt32BE((100 + rec.length) / 2, 24);
  writeFileSync(join(dir, 'z.shp'), Buffer.concat([head, rec]));
  assert.deepEqual(readShp(join(dir, 'z.shp')).records[0]!.point, [1.5, 2.5]);
  rmSync(dir, { recursive: true });
});

test('one SHP/GeoJSON = one layer; one GeoPackage = one question set: both inputs give the same package', () => {
  const dir = tmp();
  const { folder, gpkg } = makeMixed(dir);
  const a = buildTopic(cfg(folder)); const b = buildTopic(cfg(gpkg));
  assert.ok(a.ok, JSON.stringify(a.checks)); assert.ok(b.ok, JSON.stringify(b.checks));
  assert.equal(a.files.regions, b.files.regions);
  assert.equal(a.files.country, b.files.country);
  const regions = JSON.parse(a.files.regions) as { features: Array<{ id: string; properties: { geomType: string; layer: string; names: { hu: string } } }> };
  assert.deepEqual(regions.features.map((f) => [f.id, f.properties.geomType, f.properties.layer]), [
    ['MX-R1', 'line', 'folyok'], ['MX-R2', 'line', 'folyok'], ['MX-R3', 'line', 'folyok'],
    ['MX-A', 'area', 'orszagok'], ['MX-B', 'area', 'orszagok'],
    ['MX-P1', 'point', 'pontok'], ['MX-P2', 'point', 'pontok'], ['MX-P3', 'point', 'pontok'],
  ]);
  const manifest = JSON.parse(a.files.manifest) as { geometryKind: string; featureCount: number; groups: Array<{ id: string; geomTypes: string[] }> };
  assert.equal(manifest.geometryKind, 'mixed');
  assert.equal(manifest.featureCount, 8);
  assert.deepEqual(manifest.groups.map((g) => [g.id, g.geomTypes]), [['folyok', ['line']], ['orszagok', ['area']], ['pontok', ['point']]]);
  // SHP outer rings are clockwise; the package follows RFC 7946 (counter-clockwise).
  const area = JSON.parse(a.files.regions).features.find((f: { id: string }) => f.id === 'MX-A').geometry.coordinates[0] as number[][];
  const signed = area.reduce((s, p, i) => { const q = area[(i + 1) % area.length]!; return s + p[0]! * q[1]! - q[0]! * p[1]!; }, 0);
  assert.ok(signed > 0);
  rmSync(dir, { recursive: true });
});

test('validation: each problem is reported and no package is produced', () => {
  const dir = tmp();
  const run = (layers: Record<string, FixtureFeature[]>, extra: Partial<TopicConfig> = {}) => {
    const p = join(dir, `t${Math.random().toString(36).slice(2)}.gpkg`);
    writeGpkg(p, layers);
    return buildTopic(cfg(p, { coverage: [], ...extra }));
  };
  const base = { hatter: MIXED_LAYERS['hatter']! };
  const failed = (r: ReturnType<typeof buildTopic>, id: string, re: RegExp) => {
    const c = r.checks.find((x) => x.id === id)!;
    assert.equal(r.ok, false); assert.equal(c.status, 'fail'); assert.match(c.detail, re);
  };
  const river = MIXED_LAYERS['folyok']![0]!;
  failed(run({ ...base, a: [river, river] }), 'features', /duplicate id/);
  failed(run({ ...base, a: [{ ...river, props: { id: 'X1', name_hu: 'Folyó' } }] }), 'features', /missing name_uk/);
  failed(run({ ...base, a: [{ ...river, geometry: { type: 'LineString', coordinates: [[12, 1], [12, 1]] } }] }), 'features', /fewer than 2/);
  failed(run({ ...base, a: [{ ...river, geometry: { type: 'MultiPoint', coordinates: [[12, 1], [13, 1]] } }] }), 'features', /exactly one point/);
  failed(run({ ...base, a: [{ ...river, props: { id: 'bad id!', name_hu: 'x', name_uk: 'y' } }] }), 'features', /id must be/);
  failed(run({ ...base, p: [{ props: { id: 'OUT', name_hu: 'Kint', name_uk: 'Зовні' }, geometry: { type: 'Point', coordinates: [30, 5] } }] }), 'points-on-map', /OUT/);
  failed(run({ a: [river] }), 'background', /hatter/);
  const overlap: FixtureFeature[] = [MIXED_LAYERS['orszagok']![0]!, { props: { id: 'MX-C', name_hu: 'C', name_uk: 'C' }, geometry: { type: 'Polygon', coordinates: [[[14, 0], [18, 0], [18, 10], [14, 10], [14, 0]]] } }];
  failed(run({ ...base, orszagok: overlap }, { coverage: ['orszagok'] }), 'coverage-orszagok', /overlapping/);
  // Field renames per layer, and generated ids when a layer has none.
  const renamed = run({ ...base, r: [{ props: { NEV: 'Folyó', NAZVA: 'Річка' }, geometry: river.geometry }] }, { fields: { r: { name_hu: 'NEV', name_uk: 'NAZVA' } } });
  assert.ok(renamed.ok, JSON.stringify(renamed.checks));
  assert.equal(JSON.parse(renamed.files.regions).features[0].id, 'r-1');
  // Only geographic WGS 84 shapefiles are accepted.
  const folder = join(dir, 'proj'); mkdirSync(folder);
  writeShapefile(join(folder, 'folyok'), MIXED_LAYERS['folyok']!);
  writeFileSync(join(folder, 'folyok.prj'), 'PROJCS["WGS_1984_UTM_Zone_34N",GEOGCS["GCS_WGS_1984"]]');
  failed(buildTopic(cfg(folder)), 'source', /not geographic WGS 84/);
  writeGeoJson(join(folder, 'x.geojson'), []);
  rmSync(dir, { recursive: true });
});

test('lines are simplified with Douglas–Peucker and keep both ends', () => {
  const line: Array<[number, number]> = [[0, 0], [1, 0.001], [2, -0.001], [3, 0], [3, 1]];
  assert.deepEqual(simplifyLine(line, 0.01), [[0, 0], [3, 0], [3, 1]]);
  assert.deepEqual(simplifyLine([[0, 0], [1, 1]], 1), [[0, 0], [1, 1]]);
});
