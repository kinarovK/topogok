import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pickFeatureId } from '../../src/map/hitTest.ts';
import { labelPoint } from '../../src/map/labelPoint.ts';
import { pointInRing } from '../../scripts/data/geometry.ts';
import type { PolygonGeometry, RegionFeature } from '../../src/data/validation.ts';

const regions = (JSON.parse(readFileSync(resolve(import.meta.dirname, '../../public/data/ukraine-administration/2026.11.05.1/regions.geojson'), 'utf8')) as { features: RegionFeature[] }).features;

test('T14 hit test: deduplicated, city above surrounding unit, stable ID order, unknown IDs ignored, empty hit = null', () => {
  const allowed = new Set(['UA-30', 'UA-32', 'UA-05', 'UA-07']);
  assert.equal(pickFeatureId([{ id: 'UA-32', kind: 'oblast' }, { id: 'UA-30', kind: 'city' }], allowed), 'UA-30');
  assert.equal(pickFeatureId([{ id: 'UA-30', kind: 'city' }, { id: 'UA-32', kind: 'oblast' }], allowed), 'UA-30');
  assert.equal(pickFeatureId([{ id: 'UA-07', kind: 'oblast' }, { id: 'UA-05', kind: 'oblast' }, { id: 'UA-07', kind: 'oblast' }], allowed), 'UA-05');
  assert.equal(pickFeatureId([{ id: 'XX-99', kind: 'city' }], allowed), null);
  assert.equal(pickFeatureId([], allowed), null);
});

test('T13 label/control point of every region lies inside that region and in no other region', () => {
  const inside = (p: [number, number], r: RegionFeature) => {
    const g = r.geometry as PolygonGeometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    return polys.some((poly) => pointInRing(p, poly[0]!) && !poly.slice(1).some((h) => pointInRing(p, h)));
  };
  assert.equal(regions.length, 27);
  for (const r of regions) {
    const p = labelPoint(r.geometry as PolygonGeometry) as [number, number];
    assert.ok(inside(p, r), `${r.id} point outside`);
    const others = regions.filter((o) => o.id !== r.id && inside(p, o)).map((o) => o.id);
    assert.deepEqual(others, [], `${r.id} point also inside ${others}`);
  }
});
