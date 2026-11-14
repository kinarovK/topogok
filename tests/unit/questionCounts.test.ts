import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countOptions } from '../../src/domain/questionCounts.ts';

test('F4-04: count options are possible and never duplicated', () => {
  const big = [5, 12, 'all'] as const;
  const table: [number, unknown[]][] = [[1, ['all']], [3, ['all']], [5, ['all']], [8, [5, 'all']], [11, [5, 'all']], [12, [5, 'all']], [27, [5, 12, 'all']]];
  for (const [n, expected] of table) assert.deepEqual(countOptions(big, n), expected, `n=${n}`);
  assert.deepEqual(countOptions([5, 'all'], 11), [5, 'all']);
  assert.deepEqual(countOptions([5, 'all'], 4), ['all']);
});
