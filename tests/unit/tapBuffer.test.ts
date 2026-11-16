import assert from 'node:assert/strict';
import { test } from 'node:test';
import { distanceToPath, pickTarget } from '../../src/map/hitTest.ts';
import { lineMidpoint, regionLabelPoint } from '../../src/map/labelPoint.ts';

const all = new Set(['A', 'B', 'R1', 'R2', 'P1']);
const area = [{ id: 'A', kind: 'generic' as const }];

test('screen distance to a polyline and to a single point', () => {
  const line = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
  assert.equal(distanceToPath({ x: 50, y: 15 }, line), 15);
  assert.equal(distanceToPath({ x: 120, y: 50 }, line), 20);
  assert.equal(distanceToPath({ x: -30, y: -40 }, line), 50);
  assert.equal(distanceToPath({ x: 3, y: 4 }, [{ x: 0, y: 0 }]), 5);
});

test('0005 §5: the nearest line or point within the buffer wins over the area under it', () => {
  assert.equal(pickTarget(area, [{ id: 'R1', distance: 15 }], all, 22), 'R1');
  assert.equal(pickTarget(area, [{ id: 'R1', distance: 23 }], all, 22), 'A', 'outside the buffer the area is chosen');
  assert.equal(pickTarget(area, [{ id: 'R2', distance: 9 }, { id: 'R1', distance: 3 }, { id: 'P1', distance: 12 }], all, 22), 'R1', 'nearest wins, no type order');
  assert.equal(pickTarget(area, [{ id: 'P1', distance: 4 }, { id: 'R1', distance: 6 }], all, 22), 'P1');
  assert.equal(pickTarget(area, [{ id: 'R2', distance: 5 }, { id: 'R1', distance: 5 }], all, 22), 'R1', 'ties: stable id order');
  assert.equal(pickTarget([], [{ id: 'R1', distance: 40 }], all, 22), null, 'nothing in reach: no selection change');
  assert.equal(pickTarget(area, [{ id: 'R1', distance: 40 }], all, 48), 'R1', 'a larger buffer (superadmin setting) reaches further');
});

test('F4: switched-off lines and points are never picked', () => {
  const allowed = new Set(['A', 'R2']);
  assert.equal(pickTarget(area, [{ id: 'R1', distance: 2 }, { id: 'R2', distance: 10 }], allowed, 22), 'R2');
  assert.equal(pickTarget(area, [{ id: 'R1', distance: 2 }], allowed, 22), 'A');
});

test('labels: a line is labelled halfway along its longest part; a point on itself', () => {
  assert.deepEqual(lineMidpoint([[[0, 0], [10, 0]], [[0, 0], [0, 4], [4, 4]]]), [5, 0]);
  assert.deepEqual(lineMidpoint([[[0, 0], [0, 4], [4, 4]]]), [0, 4]);
  assert.deepEqual(regionLabelPoint({ properties: {}, geometry: { type: 'Point', coordinates: [3, 4] } }), [3, 4]);
});
