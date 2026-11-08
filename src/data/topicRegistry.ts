import { loadTopic, type Topic } from './validation.ts';

/** The single v1 topic. App and data are released together: this pins the data version. */
export const TOPIC = {
  id: 'ukraine-administration',
  dataVersion: '2026.11.05.1',
} as const;

export const topicBaseUrl = `${import.meta.env.BASE_URL}data/${TOPIC.id}/${TOPIC.dataVersion}/`;

let cached: Promise<Topic> | null = null;

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** Loads and validates once per page; a failure clears the cache so "retry" refetches. */
export function getTopic(): Promise<Topic> {
  cached ??= loadTopic(topicBaseUrl, TOPIC, fetchText).catch((e: unknown) => { cached = null; throw e; });
  return cached;
}
