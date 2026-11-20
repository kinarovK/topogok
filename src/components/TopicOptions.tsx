import { useSettings } from '../app/settings.tsx';
import { topicsByGrade } from '../data/topicRegistry.ts';

/** <option>s of every topic, in one <optgroup> per grade (for the teacher and leaderboard topic selects). */
export function TopicOptions() {
  const { t, locale } = useSettings();
  return (
    <>
      {topicsByGrade().map(({ grade, topics }) => (
        <optgroup key={grade} label={t('home.grade', { grade })}>
          {topics.map((x) => <option key={x.id} value={x.id}>{x.title[locale]}</option>)}
        </optgroup>
      ))}
    </>
  );
}
