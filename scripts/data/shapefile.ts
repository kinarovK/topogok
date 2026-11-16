// Minimal, dependency-free ESRI Shapefile + dBase reader: Point, PolyLine, Polygon and their Z/M variants
// (Z and M values are dropped).
// Reads only; never writes the source files.
import { readFileSync } from 'node:fs';

export type Ring = Array<[number, number]>;
export type ShapeRecord = { recordNumber: number; parts: Ring[]; point?: [number, number] };

/** Base shape kind of an SHP shape type code (Z/M variants map to their 2D base). */
export function shapeKind(type: number): 'point' | 'line' | 'polygon' | null {
  if (type === 1 || type === 11 || type === 21) return 'point';
  if (type === 3 || type === 13 || type === 23) return 'line';
  if (type === 5 || type === 15 || type === 25) return 'polygon';
  return null;
}
export type DbfField = { name: string; type: string; length: number; decimals: number };
export type DbfTable = { fields: DbfField[]; records: Array<Record<string, string | number | null>> };

export function readShp(path: string): { shapeType: number; bbox: number[]; records: ShapeRecord[] } {
  const buf = readFileSync(path);
  const fileCode = buf.readInt32BE(0);
  if (fileCode !== 9994) throw new Error(`${path}: not a shapefile (file code ${fileCode})`);
  const fileLengthBytes = buf.readInt32BE(24) * 2;
  if (fileLengthBytes !== buf.length) throw new Error(`${path}: header length ${fileLengthBytes} != actual ${buf.length}`);
  const shapeType = buf.readInt32LE(32);
  const bbox = [buf.readDoubleLE(36), buf.readDoubleLE(44), buf.readDoubleLE(52), buf.readDoubleLE(60)];
  const records: ShapeRecord[] = [];
  let off = 100;
  while (off < buf.length) {
    const recordNumber = buf.readInt32BE(off);
    const contentBytes = buf.readInt32BE(off + 4) * 2;
    const c = off + 8;
    const type = buf.readInt32LE(c);
    if (type === 0) {
      records.push({ recordNumber, parts: [] });
    } else {
      const kind = shapeKind(type);
      if (!kind || kind !== shapeKind(shapeType)) throw new Error(`${path}: record ${recordNumber} has unsupported shape type ${type}`);
      if (kind === 'point') {
        records.push({ recordNumber, parts: [], point: [buf.readDoubleLE(c + 4), buf.readDoubleLE(c + 12)] });
        off = c + contentBytes;
        continue;
      }
      const numParts = buf.readInt32LE(c + 36);
      const numPoints = buf.readInt32LE(c + 40);
      const partsStart = c + 44;
      const pointsStart = partsStart + numParts * 4;
      const partIdx: number[] = [];
      for (let i = 0; i < numParts; i++) partIdx.push(buf.readInt32LE(partsStart + i * 4));
      const parts: Ring[] = [];
      for (let p = 0; p < numParts; p++) {
        const from = partIdx[p]!;
        const to = p + 1 < numParts ? partIdx[p + 1]! : numPoints;
        const ring: Ring = [];
        for (let k = from; k < to; k++) {
          const o = pointsStart + k * 16;
          ring.push([buf.readDoubleLE(o), buf.readDoubleLE(o + 8)]);
        }
        parts.push(ring);
      }
      // 2D records end with the points; Z/M records carry extra ranges and arrays after them.
      const end = pointsStart + numPoints * 16;
      if (type === 3 || type === 5 ? end !== c + contentBytes : end > c + contentBytes) throw new Error(`${path}: record ${recordNumber} length mismatch`);
      records.push({ recordNumber, parts });
    }
    off = c + contentBytes;
  }
  return { shapeType, bbox, records };
}

export function readShxCount(path: string): number {
  const buf = readFileSync(path);
  if (buf.readInt32BE(0) !== 9994) throw new Error(`${path}: not a shx file`);
  return (buf.length - 100) / 8;
}

export function readDbf(path: string, encoding: 'utf-8' | 'latin1'): DbfTable {
  const buf = readFileSync(path);
  const nrec = buf.readUInt32LE(4);
  const hlen = buf.readUInt16LE(8);
  const rlen = buf.readUInt16LE(10);
  const fields: DbfField[] = [];
  for (let i = 32; buf[i] !== 0x0d; i += 32) {
    const nameBytes = buf.subarray(i, i + 11);
    const zero = nameBytes.indexOf(0);
    fields.push({
      name: nameBytes.subarray(0, zero < 0 ? 11 : zero).toString('latin1'),
      type: String.fromCharCode(buf[i + 11]!),
      length: buf[i + 16]!,
      decimals: buf[i + 17]!,
    });
  }
  const dec = new TextDecoder(encoding, { fatal: encoding === 'utf-8' });
  const records: DbfTable['records'] = [];
  for (let r = 0; r < nrec; r++) {
    const base = hlen + r * rlen;
    if (buf[base] === 0x2a) continue; // deleted
    let o = base + 1;
    const rec: Record<string, string | number | null> = {};
    for (const f of fields) {
      const raw = dec.decode(buf.subarray(o, o + f.length)).trim();
      o += f.length;
      if (f.type === 'N' || f.type === 'F') rec[f.name] = raw === '' ? null : Number(raw);
      else rec[f.name] = raw;
    }
    records.push(rec);
  }
  return { fields, records };
}
