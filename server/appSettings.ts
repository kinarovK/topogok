// Global app settings (0005 §5): the tap buffer for lines and points, changed by the superadmin.
// Delivered to every client (guests included) with /api/me, so no extra request is needed.
import { DEFAULT_TAP_BUFFER, TAP_BUFFER_LIMITS } from '../src/map/hitTest.ts';
import { audit } from './admin.ts';
import type { Ctx, Session } from './auth.ts';
import type { D1Database } from './types.ts';
import { fail, json } from './util.ts';

export type AppSettings = { tapBufferTouch: number; tapBufferMouse: number };

export async function loadAppSettings(db: D1Database): Promise<AppSettings> {
  const { results } = await db.prepare("SELECT key, value FROM app_settings WHERE key IN ('tapBufferTouch', 'tapBufferMouse')").all<{ key: string; value: string }>();
  const get = (k: string, d: number) => { const v = Number(results.find((r) => r.key === k)?.value); return Number.isFinite(v) ? v : d; };
  return { tapBufferTouch: get('tapBufferTouch', DEFAULT_TAP_BUFFER.touch), tapBufferMouse: get('tapBufferMouse', DEFAULT_TAP_BUFFER.mouse) };
}

/** PUT /api/app-settings {tapBufferTouch, tapBufferMouse} — superadmin only, within limits, audited. */
export async function saveAppSettings(ctx: Ctx, s: Session, body: Record<string, unknown>) {
  if (s.user.role !== 'superadmin') fail(403, 'forbidden');
  const num = (k: 'tapBufferTouch' | 'tapBufferMouse', [lo, hi]: readonly [number, number]) => {
    const v = body[k];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < lo || v > hi) return fail(400, 'invalid_setting');
    return v;
  };
  const next = { tapBufferTouch: num('tapBufferTouch', TAP_BUFFER_LIMITS.touch), tapBufferMouse: num('tapBufferMouse', TAP_BUFFER_LIMITS.mouse) };
  const before = await loadAppSettings(ctx.db);
  await ctx.db.batch(Object.entries(next).map(([k, v]) => ctx.db.prepare(
    'INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by')
    .bind(k, String(v), ctx.now, s.user.id)));
  await audit(ctx, s.user.id, 'app_settings.save', 'app', 'tap_buffer', null, { before, after: next });
  return json({ app: next });
}
