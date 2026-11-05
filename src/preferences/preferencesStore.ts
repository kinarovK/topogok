import type { Locale } from '../i18n/translator.ts';

export type ThemePreference = 'system' | 'light' | 'dark';
export type Preferences = { locale?: Locale; theme: ThemePreference };

export const STORAGE_KEY = 'topogok.preferences.v1';
const THEMES: readonly ThemePreference[] = ['system', 'light', 'dark'];

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/** Parses stored preferences; unknown or corrupt values are ignored field by field. */
export function parsePreferences(raw: string | null): Preferences {
  const out: Preferences = { theme: 'system' };
  if (!raw) return out;
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null) return out;
    const r = v as Record<string, unknown>;
    if (r['locale'] === 'hu' || r['locale'] === 'uk') out.locale = r['locale'];
    if (THEMES.includes(r['theme'] as ThemePreference)) out.theme = r['theme'] as ThemePreference;
  } catch {
    /* corrupt JSON: defaults */
  }
  return out;
}

/**
 * Only the two preferences are ever persisted. Any storage failure (blocked, quota, private mode)
 * falls back to memory and never blocks the game.
 */
export function createPreferencesStore(getStorage: () => StorageLike | null) {
  let memory: Preferences | null = null;
  const storage = (): StorageLike | null => {
    try { return getStorage(); } catch { return null; }
  };
  return {
    load(): Preferences {
      if (memory) return memory;
      let raw: string | null = null;
      try { raw = storage()?.getItem(STORAGE_KEY) ?? null; } catch { raw = null; }
      memory = parsePreferences(raw);
      return memory;
    },
    save(p: Preferences): void {
      memory = { theme: p.theme, ...(p.locale ? { locale: p.locale } : {}) };
      try { storage()?.setItem(STORAGE_KEY, JSON.stringify(memory)); } catch { /* memory fallback */ }
    },
  };
}
