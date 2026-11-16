// Runtime validation of the generated topic package. A failing package never starts a game.
export type LocalizedText = { hu: string; uk: string; en?: string };
export type LocalizedNumber = { hu: number; uk: number };
export type Bounds = [number, number, number, number];
export type Position = [number, number];
export type PolygonGeometry = { type: 'Polygon'; coordinates: Position[][] } | { type: 'MultiPolygon'; coordinates: Position[][][] };
/** Lines and points of mixed topics (0005): rivers, extreme points, cities. */
export type LineGeometry = { type: 'LineString'; coordinates: Position[] } | { type: 'MultiLineString'; coordinates: Position[][] };
export type PointGeometry = { type: 'Point'; coordinates: Position };
export type FeatureGeometry = PolygonGeometry | LineGeometry | PointGeometry;
export type GeomType = 'area' | 'line' | 'point';
export const REGION_KINDS = ['oblast', 'autonomous-republic', 'city', 'tectonic-unit', 'continent', 'ocean', 'generic'] as const;
export type RegionKind = (typeof REGION_KINDS)[number];
export type RegionFeature = {
  type: 'Feature'; id: string;
  properties: { id: string; names: LocalizedText; kind: RegionKind; geomType?: GeomType; layer?: string; label?: Position; labelMinZoom?: LocalizedNumber; labelWidth?: LocalizedNumber };
  geometry: FeatureGeometry;
};
/** Geometry type of a question feature; packages from before 0005 carry areas only. */
export const geomTypeOf = (r: RegionFeature): GeomType => r.properties.geomType ?? 'area';
export type LayerGroup = { id: string; title: LocalizedText; geomTypes: GeomType[] };
/** Background land: the country outline for country topics, all land for the world topic. */
export type CountryFeature = { type: 'Feature'; id: string; properties: { id: string; names: LocalizedText }; geometry: PolygonGeometry };

export type Inset = { id: string; anchorFeatureId: string; title: LocalizedText; bounds: Bounds };
export type Provenance = {
  source: string | null; sourceUrl: string | null; license: string | null; licenseUrl: string | null;
  status: 'unverified' | 'verified'; ownerStatement?: { hu: string; uk: string };
};
export type TopicManifest = {
  schemaVersion: 1; id: string; dataVersion: string; title: LocalizedText; geometryKind: 'polygon' | 'mixed'; featureCount: number; groups?: LayerGroup[];
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
  if (v['geometryKind'] !== 'polygon' && v['geometryKind'] !== 'mixed') throw bad('geometryKind');
  if (v['groups'] !== undefined && !(Array.isArray(v['groups']) && v['groups'].every((g) => isObj(g) && typeof g['id'] === 'string' && isText(g['title']) && Array.isArray(g['geomTypes'])))) throw bad('groups');
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

const isPos = (p: unknown) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);
const isPath = (r: unknown, min: number) => Array.isArray(r) && r.length >= min && r.every(isPos);

function validGeometry(g: unknown, geomType: GeomType = 'area'): g is FeatureGeometry {
  if (!isObj(g)) return false;
  const poly = (p: unknown) => Array.isArray(p) && p.length >= 1 && p.every((r) => isPath(r, 4));
  const c = g['coordinates'];
  if (geomType === 'point') return g['type'] === 'Point' && isPos(c);
  if (geomType === 'line') {
    if (g['type'] === 'LineString') return isPath(c, 2);
    return g['type'] === 'MultiLineString' && Array.isArray(c) && c.length >= 1 && c.every((l) => isPath(l, 2));
  }
  if (g['type'] === 'Polygon') return poly(c);
  if (g['type'] === 'MultiPolygon') return Array.isArray(c) && c.length >= 1 && c.every(poly);
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
    if (!(REGION_KINDS as readonly string[]).includes(props['kind'] as string)) throw bad(`kind for ${f['id']}`);
    const geomType = props['geomType'] ?? 'area';
    if (geomType !== 'area' && geomType !== 'line' && geomType !== 'point') throw bad(`geomType for ${f['id']}`);
    if (props['layer'] !== undefined && typeof props['layer'] !== 'string') throw bad(`layer for ${f['id']}`);
    if (!validGeometry(f['geometry'], geomType)) throw bad(`geometry for ${f['id']}`);
    const label = props['label'];
    for (const key of ['labelMinZoom', 'labelWidth']) {
      const v = props[key];
      if (v !== undefined && !(isObj(v) && Number.isFinite(v['hu']) && Number.isFinite(v['uk']))) throw bad(`${key} for ${f['id']}`);
    }
    if (label !== undefined && !(Array.isArray(label) && label.length === 2 && label.every((n) => typeof n === 'number' && Number.isFinite(n)))) throw bad(`label for ${f['id']}`);
  }
  for (const ins of manifest.insets) if (!ids.has(ins.anchorFeatureId)) throw bad(`inset anchor ${ins.anchorFeatureId} missing`);
  return features as RegionFeature[];
}

export function validateCountry(v: unknown): CountryFeature {
  const bad = (m: string) => new DataError('invalid', `country: ${m}`);
  if (!isObj(v) || v['type'] !== 'FeatureCollection' || !Array.isArray(v['features']) || v['features'].length !== 1) throw bad('expected one feature');
  const f = v['features'][0] as unknown;
  if (!isObj(f) || typeof f['id'] !== 'string' || f['id'] === '' || !validGeometry(f['geometry'], 'area')) throw bad('feature');
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
