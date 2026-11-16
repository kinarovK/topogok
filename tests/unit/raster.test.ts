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
