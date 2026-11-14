import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeIntervals, normalize, parseLog, subtract, summarize } from '../../shared/integrity.ts';

test('F6-05: intervals are clamped, merged and never count the same time twice', () => {
  assert.deepEqual(mergeIntervals([[500, 900], [-100, 200], [150, 300], [900, 950], [2000, 9000]], 5000), [[0, 300], [500, 950], [2000, 5000]]);
  assert.deepEqual(subtract([[0, 1000]], [[200, 300], [500, 600]]), [[0, 200], [300, 500], [600, 1000]]);
  assert.deepEqual(subtract([[100, 200]], [[0, 300]]), []);
  const n = normalize({ hidden: [[1000, 3000], [2500, 4000]], blur: [[900, 4100], [6000, 6500]], offline: [[100, 50]] }, 10_000);
  assert.deepEqual(n, { hidden: [[1000, 4000]], blur: [[900, 1000], [4000, 4100], [6000, 6500]], offline: [] });
  assert.deepEqual(summarize(n), { hiddenCount: 1, hiddenMs: 3000, blurCount: 3, blurMs: 700, offlineCount: 0, offlineMs: 0 });
  assert.equal(parseLog({ hidden: [[1, 'x']], blur: [], offline: [] }), null);
  assert.equal(parseLog({ hidden: [], blur: [] }), null);
});
