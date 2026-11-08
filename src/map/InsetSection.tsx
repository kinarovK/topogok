import { useMemo } from 'react';
import { useSettings } from '../app/settings.tsx';
import { Button } from '../components/ui.tsx';
import type { Topic } from '../data/validation.ts';
import type { Feedback } from './mapAdapter.ts';
import { padBounds } from './mapAdapter.ts';
import { MapView, type MapLabel } from './MapView.tsx';
import s from '../app/app.module.css';

/**
 * The two always-available zoomed insets (Kyiv, Sevastopol). Their titles are the same for every
 * question; neither the toggles nor the inset frame depend on the expected answer.
 */
export function InsetSection({ topic, open, onOpen, selection, feedback, onSelect, onError, labels }: {
  topic: Topic; open: string | null; onOpen: (id: string | null) => void;
  selection: string | null; feedback: Feedback; onSelect: (id: string) => void; onError: (e: unknown) => void;
  labels?: MapLabel[] | null;
}) {
  const { t, locale } = useSettings();
  const inset = topic.manifest.insets.find((i) => i.id === open) ?? null;
  const maxBounds = useMemo(() => (inset ? padBounds(inset.bounds, 1.5) : null), [inset]);
  return (
    <div>
      <div className={s.insetToggles} role="group" aria-label={t('game.insets')}>
        {topic.manifest.insets.map((i) => (
          <Button key={i.id} aria-pressed={open === i.id} onClick={() => onOpen(open === i.id ? null : i.id)} data-inset={i.id}>
            {i.title[locale]}
          </Button>
        ))}
      </div>
      {inset && maxBounds && (
        <div style={{ marginTop: 8 }}>
          <p className={s.insetTitle} id={`inset-title-${inset.id}`}>{inset.title[locale]}</p>
          <div className={s.inset}>
            <MapView key={inset.id} topic={topic} name={`inset-${inset.id}`} ariaLabel={inset.title[locale]} viewBounds={inset.bounds} maxBounds={maxBounds}
              selection={selection} feedback={feedback} onSelect={onSelect} onError={onError} labels={labels ?? null} />
          </div>
        </div>
      )}
    </div>
  );
}
