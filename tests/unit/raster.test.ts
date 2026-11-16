import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validatePolygon } from '../../scripts/data/geometry.ts';
import { combine, count, emptyMask, fill, makeGrid, trace } from '../../scripts/data/raster.ts';

test('raster clip: a square with a hole, minus the right half, traces back exactly', () => {
  const g = makeGrid([0, 0, 10, 10], 0.5, 0);
  const a = fill(emptyMask(g), [[[[1, 1], [9, 1], [9, 9], [1, 9], [1, 1]], [[3, 3], [3, 7], [7, 7], [7, 3], [3, 3]]]]);
  assert.equal(count(a), 256 - 64);
  const [poly] = trace(a, 0);
  assert.equal(poly!.length, 2, 'outer ring and hole');
  const right = fill(emptyMask(g), [[[[5, 0], [10, 0], [10, 10], [5, 10], [5, 0]]]]);
  const left = trace(combine(a, right, 'andNot'), 0);
  assert.deepEqual(left, [[[[1, 9], [5, 9], [5, 7], [3, 7], [3, 3], [5, 3], [5, 1], [1, 1], [1, 9]]]]);
  assert.equal(count(combine(a, right, 'and')), 96);
});

test('raster trace: diagonal contacts and a wavy outline still give valid smoothed polygons', () => {
  const g = makeGrid([0, 0, 4, 4], 1, 0);
  const m = emptyMask(g); m.data[0] = 1; m.data[5] = 1; m.data[10] = 1;
  const polys = trace(m, 0, 1);
  assert.equal(polys.length, 1);
  assert.deepEqual(validatePolygon('t', polys[0]!), []);
  // A rough coast: every row offset a little; rounding of row centres must never skip a row.
  const ring: Array<[number, number]> = [];
  for (let i = 0; i <= 40; i++) ring.push([10 + Math.sin(i) * 0.3, i * 0.25]);
  ring.push([0, 10], [0, 0], [10, 0]);
  const w = makeGrid([0, 0, 11, 10], 0.025);
  const shape = trace(fill(emptyMask(w), [[ring]]), 0.02);
  assert.equal(shape.length, 1);
  assert.deepEqual(validatePolygon('t', shape[0]!), []);
  assert.ok(shape[0]!.every((r) => r.every((p) => p[0] < 10.5)), 'no stray full-width rows');
});

test('coast: relief units are cut against each other (smaller wins), outlines and seas follow their own rules', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { writeShapefile } = await import('../../scripts/data/fixtures/write.ts');
  const { prepareCoast } = await import('../../scripts/data/coast.ts');
  const sq = (x0: number, y0: number, x1: number, y1: number) => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] as Array<Array<[number, number]>>;
  const dir = mkdtempSync(join(tmpdir(), 'topogok-coast-'));
  writeShapefile(join(dir, 'land'), [{ props: { id: 'L' }, geometry: { type: 'Polygon', coordinates: sq(0, 0, 10, 10) } }]);
  writeShapefile(join(dir, 'cont'), [{ props: { id: 'C-X' }, geometry: { type: 'Polygon', coordinates: sq(0, 0, 10, 10) } }]);
  const coast = prepareCoast({ land: join(dir, 'land.shp'), continents: join(dir, 'cont.shp'), continent: 'C-X', cell: 0.25, seaLayers: ['tengerek'], partition: { outlinePattern: /felsziget$/ } }, (p) => p, [sq(-2, -2, 12, 12)]);
  const out = coast.clipAll([
    { id: 'big', layer: 'teruletek', polys: [sq(1, 1, 8, 8)] },
    { id: 'small', layer: 'teruletek', polys: [sq(6, 6, 9, 9)] },
    { id: 'xfelsziget', layer: 'teruletek', polys: [sq(5, 5, 12, 12)] },
    { id: 'sea', layer: 'tengerek', polys: [sq(8, -2, 12, 4)] },
  ]);
  const area = (ps: Array<Array<Array<[number, number]>>> | null | undefined) => (ps ?? []).reduce((s, poly) => s + poly.reduce((t, r, k) => {
    let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i]![0] * r[i + 1]![1] - r[i + 1]![0] * r[i]![1]; return t + (k === 0 ? 1 : -1) * Math.abs(a / 2);
  }, 0), 0);
  assert.equal(area(out.get('small') as never), 9, 'the smaller unit keeps all of its land');
  assert.equal(area(out.get('big') as never), 49 - 4, 'the larger one loses the shared 2×2');
  assert.equal(area(out.get('xfelsziget') as never), 25, 'an outline is only clipped to the land');
  assert.equal(area(out.get('sea') as never), 24 - 8, 'a sea keeps only the water');
  assert.equal(area(coast.base as never), 100);
  rmSync(dir, { recursive: true });
});
