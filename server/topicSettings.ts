// F4: teacher-selected question sets. One row per teacher × topic with the disabled feature ids and a version
// for optimistic concurrency. See docs/project/tasks/0003_ONLINE_PLATFORM/phases/F4_DESIGN.md.
import { TOPICS } from '../src/data/topicRegistry.ts';
import { audit, teacherScope } from './admin.ts';
import type { Ctx, Session } from './auth.ts';
import { TOPIC_FEATURES } from './topics.generated.ts';
import type { D1Database } from './types.ts';
import { fail, json } from './util.ts';

export type TopicSetting = { disabled: string[]; version: number };

/** Feature ids of the topic's current data version. */
export function currentIds(topicId: string): readonly string[] | null {
  const t = TOPICS.find((x) => x.id === topicId);
  return (t && TOPIC_FEATURES[t.id]?.[t.dataVersion]) ?? null;
}

/** Settings of one teacher for every topic that has a row; ids no longer in the data are dropped. */
export async function loadSettings(db: D1Database, teacherId: string): Promise<Record<string, TopicSetting>> {
  const { results } = await db.prepare('SELECT topic_id, disabled_ids, version FROM topic_settings WHERE teacher_id = ?').bind(teacherId)
    .all<{ topic_id: string; disabled_ids: string; version: number }>();
  const out: Record<string, TopicSetting> = {};
  for (const r of results) {
    const ids = currentIds(r.topic_id);
    if (!ids) continue;
    const known = new Set(ids);
    out[r.topic_id] = { disabled: (JSON.parse(r.disabled_ids) as string[]).filter((x) => known.has(x)), version: r.version };
  }
  return out;
}

export async function loadSetting(db: D1Database, teacherId: string, topicId: string): Promise<TopicSetting> {
  return (await loadSettings(db, teacherId))[topicId] ?? { disabled: [], version: 0 };
}

/** GET /api/topic-settings */
export async function listSettings(ctx: Ctx, s: Session, q: URLSearchParams) {
  const scope = await teacherScope(ctx, s, q.get('teacherId'));
  return json({ settings: await loadSettings(ctx.db, scope) });
}

/** PUT /api/topic-settings/:topicId {disabled, baseVersion} — a stale baseVersion is a conflict, never a silent overwrite. */
export async function saveSetting(ctx: Ctx, s: Session, topicId: string, body: Record<string, unknown>) {
  const scope = await teacherScope(ctx, s, body['teacherId']);
  const ids = currentIds(topicId) ?? fail(404, 'not_found');
  const raw = body['disabled'];
  const base = body['baseVersion'];
  if (!Array.isArray(raw) || typeof base !== 'number' || !Number.isInteger(base) || base < 0) return fail(400, 'invalid_settings');
  const known = new Set(ids);
  const disabled = [...new Set(raw)];
  if (disabled.some((x) => typeof x !== 'string' || !known.has(x))) fail(400, 'unknown_feature');
  if (disabled.length >= ids.length) fail(400, 'nothing_enabled');
  const value = JSON.stringify([...disabled].sort());
  const r = base === 0
    ? await ctx.db.prepare('INSERT INTO topic_settings (teacher_id, topic_id, disabled_ids, version, updated_at, updated_by) VALUES (?, ?, ?, 1, ?, ?) ON CONFLICT DO NOTHING')
      .bind(scope, topicId, value, ctx.now, s.user.id).run()
    : await ctx.db.prepare('UPDATE topic_settings SET disabled_ids = ?, version = version + 1, updated_at = ?, updated_by = ? WHERE teacher_id = ? AND topic_id = ? AND version = ?')
      .bind(value, ctx.now, s.user.id, scope, topicId, base).run();
  const current = await loadSetting(ctx.db, scope, topicId);
  if (r.meta.changes !== 1) fail(409, 'settings_conflict', { setting: current });
  await audit(ctx, s.user.id, 'topic_settings.save', 'topic', topicId, scope, { enabled: ids.length - disabled.length, total: ids.length });
  return json({ setting: current });
}
