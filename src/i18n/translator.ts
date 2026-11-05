import hu from './hu.json' with { type: 'json' };
import uk from './uk.json' with { type: 'json' };

export type Locale = 'hu' | 'uk';
export const LOCALES: readonly Locale[] = ['hu', 'uk'];
export const FORMAT_LOCALE: Record<Locale, string> = { hu: 'hu-HU', uk: 'uk-UA' };
export const LOCALE_LABEL: Record<Locale, string> = { hu: 'Magyar', uk: 'Українська' };

type Dict = typeof hu;
type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];
export type MessageKey = Leaves<Dict>;
export type Params = Record<string, string | number>;

export const dictionaries: Record<Locale, Dict> = { hu, uk };

function lookup(dict: unknown, key: string): string | undefined {
  let cur: unknown = dict;
  for (const part of key.split('.')) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

export function interpolate(template: string, params?: Params, locale: Locale = 'hu'): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) => {
    const v = params[name];
    if (v === undefined) return m;
    return typeof v === 'number' ? new Intl.NumberFormat(FORMAT_LOCALE[locale]).format(v) : v;
  });
}

let warn: (msg: string) => void = (msg) => console.warn(msg);
export function setMissingKeyHandler(fn: (msg: string) => void) { warn = fn; }

/** Translate with Hungarian fallback; never returns a raw key or "undefined" to the user. */
export function translate(locale: Locale, key: MessageKey, params?: Params): string {
  const own = lookup(dictionaries[locale], key);
  if (own !== undefined) return interpolate(own, params, locale);
  warn(`[i18n] missing ${locale}:${key}`);
  const fallback = lookup(dictionaries.hu, key);
  return fallback !== undefined ? interpolate(fallback, params, 'hu') : '';
}

/** First-run locale: primary browser language "uk" → Ukrainian, otherwise Hungarian. */
export function detectLocale(languages: readonly string[] | undefined): Locale {
  const primary = languages?.[0]?.toLowerCase().split(/[-_]/)[0];
  return primary === 'uk' ? 'uk' : 'hu';
}

export function formatPercent(locale: Locale, value: number): string {
  return new Intl.NumberFormat(FORMAT_LOCALE[locale], { maximumFractionDigits: 1, minimumFractionDigits: 0 }).format(Math.round(value * 10) / 10) + '%';
}

/** Collects every leaf key with its {params}, for dictionary parity checks. */
export function flattenKeys(dict: unknown, prefix = ''): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (typeof dict !== 'object' || dict === null) return out;
  for (const [k, v] of Object.entries(dict)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out.set(key, [...v.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort());
    else for (const [kk, vv] of flattenKeys(v, key)) out.set(kk, vv);
  }
  return out;
}
