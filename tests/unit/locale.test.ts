import { test } from 'node:test';
import assert from 'node:assert/strict';
import hu from '../../src/i18n/hu.json' with { type: 'json' };
import uk from '../../src/i18n/uk.json' with { type: 'json' };
import { detectLocale, flattenKeys, formatPercent, setMissingKeyHandler, translate } from '../../src/i18n/translator.ts';
import { createPreferencesStore, parsePreferences, STORAGE_KEY } from '../../src/preferences/preferencesStore.ts';

// T15
test('T15 locale detection: uk-UA→uk, hu-HU→hu, en-US→hu, secondary uk ignored', () => {
  assert.equal(detectLocale(['uk-UA']), 'uk');
  assert.equal(detectLocale(['uk']), 'uk');
  assert.equal(detectLocale(['hu-HU']), 'hu');
  assert.equal(detectLocale(['en-US', 'uk-UA']), 'hu');
  assert.equal(detectLocale([]), 'hu');
  assert.equal(detectLocale(undefined), 'hu');
});

test('T15 hu and uk dictionaries have identical key sets and identical parameters; no empty strings', () => {
  const a = flattenKeys(hu);
  const b = flattenKeys(uk);
  assert.deepEqual([...a.keys()].sort(), [...b.keys()].sort());
  for (const [k, params] of a) assert.deepEqual(b.get(k), params, `params differ for ${k}`);
  for (const d of [a, b]) for (const k of d.keys()) assert.ok(k.length > 0);
  const empty = (o: unknown): boolean => typeof o === 'string' ? o.trim() === '' : Object.values(o as object).some(empty);
  assert.equal(empty(hu), false);
  assert.equal(empty(uk), false);
});

test('translate interpolates, formats numbers per locale and falls back without raw keys', () => {
  assert.equal(translate('hu', 'game.find', { name: 'Kijev' }), 'Keresd meg: Kijev');
  assert.equal(translate('uk', 'game.find', { name: 'Київ' }), 'Знайди: Київ');
  assert.equal(translate('hu', 'setup.all', { count: 27 }), 'Mindegyik (27)');
  const warnings: string[] = [];
  setMissingKeyHandler((m) => warnings.push(m));
  // @ts-expect-error unknown key on purpose
  assert.equal(translate('uk', 'nope.missing'), '');
  assert.equal(warnings.length, 1);
  assert.equal(formatPercent('hu', 8.3333), '8,3%');
  assert.equal(formatPercent('hu', 75), '75%');
  assert.equal(formatPercent('uk', 96.296), '96,3%');
});

// T17
test('T17 preferences: corrupt/unknown values ignored; storage failures never throw; only one key written', () => {
  assert.deepEqual(parsePreferences(null), { theme: 'system' });
  assert.deepEqual(parsePreferences('{broken'), { theme: 'system' });
  assert.deepEqual(parsePreferences('{"locale":"ua","theme":"neon"}'), { theme: 'system' });
  assert.deepEqual(parsePreferences('{"locale":"uk","theme":"dark","score":12}'), { locale: 'uk', theme: 'dark' });

  const written = new Map<string, string>();
  const store = createPreferencesStore(() => ({ getItem: (k) => written.get(k) ?? null, setItem: (k, v) => void written.set(k, v) }));
  store.save({ locale: 'hu', theme: 'light' });
  assert.deepEqual([...written.keys()], [STORAGE_KEY]);
  assert.deepEqual(JSON.parse(written.get(STORAGE_KEY)!), { theme: 'light', locale: 'hu' });

  const throwing = createPreferencesStore(() => ({ getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('QuotaExceeded'); } }));
  assert.deepEqual(throwing.load(), { theme: 'system' });
  throwing.save({ locale: 'uk', theme: 'dark' });
  assert.deepEqual(throwing.load(), { locale: 'uk', theme: 'dark' }, 'memory fallback');
  const noStorage = createPreferencesStore(() => { throw new Error('denied'); });
  assert.doesNotThrow(() => noStorage.save({ theme: 'dark' }));
});
