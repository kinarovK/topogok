// Plays and saves a tectonics round (11 units) through the API, as the browser would.
import assert from 'node:assert/strict';
import { TOPICS } from '../../src/data/topicRegistry.ts';
import { currentFeatureId, reduce, startGame } from '../../src/domain/game.ts';
import type { GameConfiguration, GameState } from '../../src/domain/types.ts';
import { TOPIC_FEATURES } from '../../server/topics.generated.ts';
import type { Browser } from './harness.ts';

export const topic = TOPICS.find((t) => t.id === 'ukraine-tectonics')!;
export const ids = TOPIC_FEATURES[topic.id]![topic.dataVersion]!; // 11 units
type Clock = { now: number };

/**
 * Plays and saves a round: `wrong` questions answered wrong, `step` ms per question.
 * Returns the attempt id. Practice answers wrong questions with "reveal".
 */
export async function play(b: Browser, clock: Clock, o: { mode?: 'practice' | 'assessment'; count?: 5 | 'all'; wrong?: number; step?: number; limit?: number | null; seed?: number; enabled?: readonly string[]; settingsVersion?: number; quit?: boolean; integrity?: unknown } = {}) {
  const mode = o.mode ?? 'assessment';
  const config: GameConfiguration = mode === 'practice'
    ? { mode, topicId: topic.id, count: o.count ?? 'all', showElapsed: true }
    : { mode, topicId: topic.id, count: o.count ?? 'all', timeLimitMinutes: (o.limit ?? null) as null };
  const seedValue = o.seed ?? Math.floor(Math.random() * 1e9);
  const r = await b.call('POST', '/api/attempts', { topicId: topic.id, dataVersion: topic.dataVersion, mode, count: config.count, seed: seedValue,
    settingsVersion: o.settingsVersion ?? 0, ...(mode === 'practice' ? { showElapsed: true } : { timeLimitMinutes: o.limit ?? null }) });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const id = r.data['attemptId'] as string;
  if (o.quit) { await b.call('POST', `/api/attempts/${id}/finish`, { reason: 'quit' }); return id; }
  let s: GameState = startGame(config, o.enabled ?? ids, seedValue);
  const events: Record<string, unknown>[] = [];
  const send = (e: Record<string, unknown>) => {
    const ev = e['type'] === 'SELECT' ? { type: 'SELECT' as const, featureId: e['f'] as string, elapsedMs: e['t'] as number } : { type: e['type'] as 'CONFIRM', elapsedMs: e['t'] as number };
    const next = reduce(s, ev);
    if (next !== s) { events.push(e); s = next; }
  };
  let t = 0; let n = 0;
  const step = o.step ?? 1000;
  while (s.phase !== 'finished') {
    if (s.mode === 'practice' && s.phase === 'feedback') { send({ type: 'NEXT', t }); continue; }
    t += step;
    const target = currentFeatureId(s)!;
    if (s.mode === 'practice' && n < (o.wrong ?? 0) && s.stage === 'base') { send({ type: 'REVEAL', t }); n++; continue; }
    const pick = s.mode === 'assessment' && n < (o.wrong ?? 0) ? ids.find((x) => x !== target)! : target;
    if (s.mode === 'assessment') n++;
    send({ type: 'SELECT', f: pick, t });
    send({ type: 'CONFIRM', t });
  }
  clock.now += t + 1000;
  const f = await b.call('POST', `/api/attempts/${id}/finish`, { reason: 'completed', events, visibleMs: t, integrity: 'integrity' in o ? o.integrity : { hidden: [], blur: [], offline: [] } });
  assert.equal(f.status, 200, JSON.stringify(f.data));
  return id;
}

