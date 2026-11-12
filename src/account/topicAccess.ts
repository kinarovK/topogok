// F4: which features a logged-in student may be asked about. Guests and teachers always get the full map.
import { useMemo } from 'react';
import type { Topic } from '../data/validation.ts';
import { useAccount } from './account.tsx';

export type TopicAccess = { enabled: readonly string[]; disabled: ReadonlySet<string>; version: number; restricted: boolean };

export function useTopicAccess(topic: Topic | null): TopicAccess | null {
  const { me } = useAccount();
  const setting = me?.role === 'student' && topic ? me.topicSettings?.[topic.manifest.id] : undefined;
  return useMemo(() => {
    if (!topic) return null;
    const all = topic.regions.map((r) => r.id);
    const disabled = new Set((setting?.disabled ?? []).filter((id) => all.includes(id)));
    const enabled = all.filter((id) => !disabled.has(id));
    return { enabled, disabled, version: setting?.version ?? 0, restricted: disabled.size > 0 };
  }, [topic, setting]);
}
