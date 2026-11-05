// Runtime validation of the generated topic package. A failing package never starts a game.
export type LocalizedText = { hu: string; uk: string; en?: string };
export type Bounds = [number, number, number, number];
export type Position = [number, number];
export type PolygonGeometry = { type: 'Polygon'; coordinates: Position[][] } | { type: 'MultiPolygon'; coordinates: Position[][][] };
export type RegionKind = 'oblast' | 'autonomous-republic' | 'city';
export type RegionFeature = { type: 'Feature'; id: string; properties: { id: string; names: LocalizedText; kind: RegionKind }; geometry: PolygonGeometry };
export type CountryFeature = { type: 'Feature'; id: 'UA'; properties: { id: 'UA'; names: LocalizedText }; geometry: PolygonGeometry };

export type Inset = { id: string; anchorFeatureId: string; title: LocalizedText; bounds: Bounds };
export type Provenance = {
  source: string | null; sourceUrl: string | null; license: string | null; licenseUrl: string | null;
  status: 'unverified' | 'verified'; ownerStatement?: { hu: string; uk: string };
};
export type TopicManifest = {
  schemaVersion: 1; id: string; dataVersion: string; title: LocalizedText; geometryKind: 'polygon'; featureCount: number;
  bounds: Bounds; layers: { background: { path: string; sha256: string }; questions: { path: string; sha256: string } };
  insets: Inset[]; provenance: Provenance;
};
export type Topic = { manifest: TopicManifest; regions: RegionFeature[]; country: CountryFeature };

export class DataError extends Error {
  readonly kind: 'load' | 'invalid';
  constructor(kind: 'load' | 'invalid', message: string) { super(message); this.kind = kind; }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is LocalizedText => isObj(v) && typeof v['hu'] === 'string' && v['hu'].trim() !== '' && typeof v['uk'] === 'string' && v['uk'].trim() !== '';
const isBounds = (v: unknown): v is Bounds => Array.isArray(v) && v.length === 4 && v.every((n) => typeof n === 'number' && Number.isFinite(n)) && v[0] < v[2] && v[1] < v[3];
const isHash = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);

export function validateManifest(v: unknown, expected: { id: string; dataVersion: string }): TopicManifest {
  const bad = (m: string) => new DataError('invalid', `manifest: ${m}`);
  if (!isObj(v)) throw bad('not an object');
  if (v['schemaVersion'] !== 1) throw bad('unsupported schemaVersion');
  if (v['id'] !== expected.id) throw bad('wrong topic id');
  if (v['dataVersion'] !== expected.dataVersion) throw bad(`dataVersion ${String(v['dataVersion'])} != app ${expected.dataVersion}`);
  if (!isText(v['title'])) throw bad('title');
  if (v['geometryKind'] !== 'polygon') throw bad('geometryKind');
  if (typeof v['featureCount'] !== 'number' || v['featureCount'] < 1) throw bad('featureCount');
  if (!isBounds(v['bounds'])) throw bad('bounds');
  const layers = v['layers'];
  if (!isObj(layers)) throw bad('layers');
  for (const name of ['background', 'questions']) {
    const l = layers[name];
    if (!isObj(l) || typeof l['path'] !== 'string' || !isHash(l['sha256'])) throw bad(`layer ${name}`);
  }
  if (!Array.isArray(v['insets'])) throw bad('insets');
  for (const ins of v['insets'] as unknown[]) {
    if (!isObj(ins) || typeof ins['id'] !== 'string' || typeof ins['anchorFeatureId'] !== 'string' || !isText(ins['title']) || !isBounds(ins['bounds'])) throw bad('inset');
  }
  const p = v['provenance'];
  if (!isObj(p) || (p['status'] !== 'unverified' && p['status'] !== 'verified')) throw bad('provenance');
  return v as unknown as TopicManifest;
}

function validGeometry(g: unknown): g is PolygonGeometry {
  if (!isObj(g)) return false;
  const ring = (r: unknown) => Array.isArray(r) && r.length >= 4 && r.every((p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  const poly = (p: unknown) => Array.isArray(p) && p.length >= 1 && p.every(ring);
  if (g['type'] === 'Polygon') return poly(g['coordinates']);
  if (g['type'] === 'MultiPolygon') return Array.isArray(g['coordinates']) && g['coordinates'].length >= 1 && g['coordinates'].every(poly);
  return false;
}

export function validateRegions(v: unknown, manifest: TopicManifest): RegionFeature[] {
  const bad = (m: string) => new DataError('invalid', `regions: ${m}`);
  if (!isObj(v) || v['type'] !== 'FeatureCollection' || !Array.isArray(v['features'])) throw bad('not a FeatureCollection');
  const features = v['features'] as unknown[];
  if (features.length !== manifest.featureCount) throw bad(`expected ${manifest.featureCount} features, got ${features.length}`);
  const ids = new Set<string>();
  for (const f of features) {
    if (!isObj(f) || f['type'] !== 'Feature') throw bad('feature');
    const props = f['properties'];
    if (typeof f['id'] !== 'string' || !isObj(props) || props['id'] !== f['id']) throw bad('id mismatch');
    if (ids.has(f['id'])) throw bad(`duplicate id ${f['id']}`);
    ids.add(f['id']);
    if (!isText(props['names'])) throw bad(`names for ${f['id']}`);
    if (!['oblast', 'autonomous-republic', 'city'].includes(props['kind'] as string)) throw bad(`kind for ${f['id']}`);
    if (!validGeometry(f['geometry'])) throw bad(`geometry for ${f['id']}`);
  }
  for (const ins of manifest.insets) if (!ids.has(ins.anchorFeatureId)) throw bad(`inset anchor ${ins.anchorFeatureId} missing`);
  return features as RegionFeature[];
}

export function validateCountry(v: unknown): CountryFeature {
  const bad = (m: string) => new DataError('invalid', `country: ${m}`);
  if (!isObj(v) || v['type'] !== 'FeatureCollection' || !Array.isArray(v['features']) || v['features'].length !== 1) throw bad('expected one feature');
  const f = v['features'][0] as unknown;
  if (!isObj(f) || f['id'] !== 'UA' || !validGeometry(f['geometry'])) throw bad('feature');
  return f as unknown as CountryFeature;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Fetches and validates the package. `fetchText` is injectable for tests. */
export async function loadTopic(
  baseUrl: string, expected: { id: string; dataVersion: string }, fetchText: (url: string) => Promise<string>,
): Promise<Topic> {
  const get = async (path: string) => {
    try { return await fetchText(`${baseUrl}${path}`); } catch (e) { throw new DataError('load', `${path}: ${String(e)}`); }
  };
  const parse = (text: string, what: string): unknown => {
    try { return JSON.parse(text); } catch { throw new DataError('invalid', `${what}: invalid JSON`); }
  };
  const manifest = validateManifest(parse(await get('manifest.json'), 'manifest'), expected);
  const [countryText, regionsText] = await Promise.all([get(manifest.layers.background.path), get(manifest.layers.questions.path)]);
  const [ch, rh] = await Promise.all([sha256Hex(countryText), sha256Hex(regionsText)]);
  if (ch !== manifest.layers.background.sha256) throw new DataError('invalid', 'country: hash mismatch');
  if (rh !== manifest.layers.questions.sha256) throw new DataError('invalid', 'regions: hash mismatch');
  return { manifest, country: validateCountry(parse(countryText, 'country')), regions: validateRegions(parse(regionsText, 'regions'), manifest) };
}
