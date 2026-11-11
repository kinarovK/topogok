// Client-side password key derivation, shared by the browser UI and the API tests.
// The server never receives a password: only salt + PBKDF2-SHA256(password, salt) (see F2_DESIGN.md §3).

export const KDF_ITERATIONS = 600_000;
export const PASSWORD_MIN_LENGTH = 10;

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromBase64(text: string): Uint8Array {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function newSalt(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(16)));
}

/** 32-byte key, base64. NFC so the same password typed on different keyboards gives the same key. */
export async function deriveKey(password: string, saltB64: string, iterations: number): Promise<string> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(saltB64) as BufferSource, iterations }, material, 256);
  return toBase64(new Uint8Array(bits));
}

/** What a client sends when it sets a password (create user / reset password). */
export async function passwordPayload(password: string, iterations = KDF_ITERATIONS): Promise<{ salt: string; key: string; iterations: number }> {
  const salt = newSalt();
  return { salt, key: await deriveKey(password, salt, iterations), iterations };
}
