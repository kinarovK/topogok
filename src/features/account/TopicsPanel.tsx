// F4: the teacher picks, per topic, which features students may be asked about.
import { TopicOptions } from '../../components/TopicOptions.tsx';
import { useEffect, useState } from 'react';
import { api, ApiFailure, type TopicSetting } from '../../account/api.ts';
import { useSettings } from '../../app/settings.tsx';
import { Button } from '../../components/ui.tsx';
import { getTopic, TOPICS, type TopicId } from '../../data/topicRegistry.ts';
import type { Topic } from '../../data/validation.ts';
import { Field, useErrorText } from './common.tsx';
import s from './account.module.css';

export function TopicsPanel({ scope }: { scope: string | null }) {
  const { t, locale } = useSettings();
  const errorText = useErrorText();
  const [topicId, setTopicId] = useState<TopicId>(TOPICS[0]!.id as TopicId);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [settings, setSettings] = useState<Record<string, TopicSetting> | null>(null);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    api.topicSettings(scope).then((r) => { if (alive) setSettings(r); }, (e: unknown) => { if (alive) setMessage({ kind: 'error', text: errorText(e) }); });
    return () => { alive = false; };
  }, [scope, errorText]);

  useEffect(() => {
    let alive = true;
    getTopic(topicId).then((x) => { if (alive) setTopic(x); }, (e: unknown) => { if (alive) setMessage({ kind: 'error', text: errorText(e) }); });
    return () => { alive = false; };
  }, [topicId, errorText]);

  const stored = settings?.[topicId] ?? { disabled: [], version: 0 };
  const storedKey = [...stored.disabled].sort().join('|');
  // Re-sync the checkboxes whenever the stored state of the chosen topic changes.
  const [syncedKey, setSyncedKey] = useState<string | null>(null);
  const key = `${topicId}:${stored.version}:${storedKey}`;
  if (settings && syncedKey !== key) { setSyncedKey(key); setOff(new Set(stored.disabled)); }

  if (!topic || !settings || topic.manifest.id !== topicId) {
    return <section aria-label={t('account.topics')}>{message ? <p className={s.error} role="alert">{message.text}</p> : <p className={s.hint}>…</p>}</section>;
  }
  const regions = [...topic.regions].sort((a, b) => a.properties.names[locale].localeCompare(b.properties.names[locale], locale));
  const total = regions.length;
  const enabled = total - off.size;
  const changed = [...off].sort().join('|') !== storedKey;
  const layerGroups = topic.manifest.groups ?? [];
  const groups = layerGroups.length > 1
    ? layerGroups.map((g) => ({ id: g.id, title: g.title, items: regions.filter((r) => r.properties.layer === g.id) }))
    : [{ id: null, title: null, items: regions }];
  const setGroup = (items: typeof regions, disable: boolean) => setOff((cur) => {
    const n = new Set(cur);
    for (const r of items) { if (disable) n.add(r.id); else n.delete(r.id); }
    return n;
  });
  const toggle = (id: string) => setOff((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const save = () => {
    setBusy(true); setMessage(null);
    api.saveTopicSetting(scope, topicId, [...off], stored.version).then(
      (setting) => { setSettings((cur) => ({ ...cur, [topicId]: setting })); setBusy(false); setMessage({ kind: 'ok', text: t('topics.saved') }); },
      (e: unknown) => {
        setBusy(false);
        if (e instanceof ApiFailure && e.code === 'settings_conflict' && e.extra?.['setting']) {
          setSettings((cur) => ({ ...cur, [topicId]: e.extra!['setting'] as TopicSetting }));
          setMessage({ kind: 'error', text: t('topics.conflict') });
        } else setMessage({ kind: 'error', text: errorText(e) });
      },
    );
  };

  return (
    <section aria-label={t('account.topics')} data-testid="topics-panel">
      <p className={s.hint}>{t('topics.topicsHint')}</p>
      <div className={s.toolbar}>
        <Field label={t('report.topic')}>
          <select value={topicId} onChange={(e) => { setTopicId(e.target.value as TopicId); setMessage(null); }}>
            <TopicOptions />
          </select>
        </Field>
        <Button onClick={() => setOff(new Set())}>{t('topics.all')}</Button>
        <Button onClick={() => setOff(new Set(regions.map((r) => r.id)))}>{t('topics.none')}</Button>
      </div>
      <p className={s.meta} data-testid="topics-count" aria-live="polite">{t('topics.selected', { count: enabled, total })}</p>
      {/* Mixed topics (0005): one group per source layer (e.g. countries, rivers, points), each with all/none. */}
      {groups.map((g) => (
        <div key={g.id ?? 'all'} data-group={g.id ?? undefined}>
          {g.title && (
            <div className={s.toolbar}>
              <h3 className={s.groupTitle}>{g.title[locale]}</h3>
              <Button variant="ghost" onClick={() => setGroup(g.items, false)}>{t('topics.all')}</Button>
              <Button variant="ghost" onClick={() => setGroup(g.items, true)}>{t('topics.none')}</Button>
            </div>
          )}
          <ul className={s.checklist}>
            {g.items.map((r) => (
              <li key={r.id}>
                <label>
                  <input type="checkbox" checked={!off.has(r.id)} onChange={() => toggle(r.id)} data-feature={r.id} />
                  <span>{r.properties.names[locale]}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {/* Kept in view while scrolling a long list on a phone. */}
      <div className={s.stickyBar}>
        {enabled === 0 && <p className={s.error}>{t('account.err.nothing_enabled')}</p>}
        {message && <p className={message.kind === 'ok' ? s.ok : s.error} role={message.kind === 'ok' ? 'status' : 'alert'}>{message.text}</p>}
        <div className={s.toolbar}>
          <Button variant="primary" onClick={save} disabled={busy || !changed || enabled === 0}>{t('topics.save')}</Button>
          <span className={s.meta}>{t('topics.selected', { count: enabled, total })}</span>
        </div>
      </div>
    </section>
  );
}
