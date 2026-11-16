// Well-Known Binary → GeoJSON geometry, and the GeoPackage binary header around it.
// Supports Point, LineString, Polygon and their Multi variants, 2D/Z/M/ZM (ISO and EWKB codes); Z and M are dropped.
export type Pos = [number, number];
export type Geometry =
  | { type: 'Point'; coordinates: Pos }
  | { type: 'MultiPoint'; coordinates: Pos[] }
  | { type: 'LineString'; coordinates: Pos[] }
  | { type: 'MultiLineString'; coordinates: Pos[][] }
  | { type: 'Polygon'; coordinates: Pos[][] }
  | { type: 'MultiPolygon'; coordinates: Pos[][][] };

export function parseWkb(buf: Uint8Array, start = 0): { geometry: Geometry; end: number } {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let o = start;
  const read = (): Geometry => {
    const le = view.getUint8(o) === 1; o += 1;
    let code = view.getUint32(o, le); o += 4;
    // EWKB flags (PostGIS) and ISO thousands both encode Z/M.
    let dims = 2;
    if (code & 0x80000000) dims++;
    if (code & 0x40000000) dims++;
    if (code & 0x20000000) { o += 4; } // embedded SRID
    code &= 0x0fffffff;
    const iso = Math.floor(code / 1000);
    if (iso === 1 || iso === 2) dims = 3; else if (iso === 3) dims = 4;
    const base = code % 1000;
    const pos = (): Pos => { const x = view.getFloat64(o, le); const y = view.getFloat64(o + 8, le); o += 8 * dims; return [x, y]; };
    const count = () => { const n = view.getUint32(o, le); o += 4; return n; };
    const line = () => Array.from({ length: count() }, pos);
    const poly = () => Array.from({ length: count() }, line);
    switch (base) {
      case 1: return { type: 'Point', coordinates: pos() };
      case 2: return { type: 'LineString', coordinates: line() };
      case 3: return { type: 'Polygon', coordinates: poly() };
      case 4: return { type: 'MultiPoint', coordinates: Array.from({ length: count() }, () => (read() as { coordinates: Pos }).coordinates) };
      case 5: return { type: 'MultiLineString', coordinates: Array.from({ length: count() }, () => (read() as { coordinates: Pos[] }).coordinates) };
      case 6: return { type: 'MultiPolygon', coordinates: Array.from({ length: count() }, () => (read() as { coordinates: Pos[][] }).coordinates) };
      default: throw new Error(`unsupported WKB geometry type ${code}`);
    }
  };
  const geometry = read();
  return { geometry, end: o };
}

/** GeoPackage geometry blob: "GP", version, flags, srs_id, optional envelope, then WKB. Empty geometries → null. */
export function parseGpkgGeometry(blob: Uint8Array): { srsId: number; geometry: Geometry | null } {
  if (blob[0] !== 0x47 || blob[1] !== 0x50) throw new Error('not a GeoPackage geometry (missing "GP")');
  const flags = blob[3]!;
  const le = (flags & 1) === 1;
  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  const srsId = view.getInt32(4, le);
  const envelope = [0, 32, 48, 48, 64][(flags >> 1) & 7];
  if (envelope === undefined) throw new Error('invalid GeoPackage envelope indicator');
  if (flags & 0x10) return { srsId, geometry: null };
  return { srsId, geometry: parseWkb(blob, 8 + envelope).geometry };
}
