// Global app settings the superadmin can change (0005 §5): delivered with /api/me, kept in memory only.
// Without a connection the defaults (or the last received values) apply.
import { DEFAULT_TAP_BUFFER } from '../map/hitTest.ts';

export type AppSettings = { tapBufferTouch: number; tapBufferMouse: number };
let tapBuffer: { touch: number; mouse: number } = { ...DEFAULT_TAP_BUFFER };

export function applyAppSettings(s: AppSettings | undefined | null): void {
  if (!s) return;
  tapBuffer = { touch: s.tapBufferTouch, mouse: s.tapBufferMouse };
}

/** Read at every tap, so a change applies without rebuilding the map. */
export const getTapBuffer = () => tapBuffer;
