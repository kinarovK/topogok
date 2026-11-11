import { fromBase64 } from '../shared/kdf.ts';
import { fail } from './util.ts';

/** Login: NFKC + lower case; a–z 0–9 . _ -; 3–32 chars; starts with a letter or digit (F2_DESIGN §5). */
export function normalizeLogin(input: unknown): { login: string; norm: string } {
  if (typeof input !== 'string') return fail(400, 'invalid_login');
  const login = input.normalize('NFKC').trim();
  const norm = login.toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(norm)) fail(400, 'invalid_login');
  return { login: norm, norm };
}

export function cleanName(input: unknown, max: number, code: string): string {
  if (typeof input !== 'string') return fail(400, code);
  const name = input.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (name.length < 1 || name.length > max || [...name].some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127)) fail(400, code);
  return name;
}

export const fullName = (v: unknown) => cleanName(v, 80, 'invalid_full_name');
export const className = (v: unknown) => cleanName(v, 40, 'invalid_class_name');
export const nameKey = (name: string) => name.toLocaleLowerCase('hu');

export type PasswordInput = { salt: string; key: string; iterations: number };

export function passwordInput(body: Record<string, unknown>, minIterations: number): PasswordInput {
  const { salt, key, iterations } = body;
  if (typeof salt !== 'string' || typeof key !== 'string' || typeof iterations !== 'number') return fail(400, 'invalid_password_payload');
  let saltBytes: Uint8Array;
  try { saltBytes = fromBase64(salt); } catch { return fail(400, 'invalid_password_payload'); }
  if (saltBytes.length < 16 || !Number.isInteger(iterations) || iterations < minIterations || iterations > 10_000_000) fail(400, 'invalid_password_payload');
  return { salt, key, iterations };
}

export function idParam(v: unknown): string {
  if (typeof v !== 'string' || !/^[0-9a-f-]{36}$/.test(v)) return fail(404, 'not_found');
  return v;
}

export async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (request.method === 'GET') return {};
  const text = await request.text();
  if (text.length > 16_384) fail(413, 'too_large');
  if (!text) return {};
  try {
    const v = JSON.parse(text) as unknown;
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch { /* fall through */ }
  return fail(400, 'invalid_json');
}
