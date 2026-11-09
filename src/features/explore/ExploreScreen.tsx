import { useMemo, useState } from 'react';
import { useSettings } from '../../app/settings.tsx';
import { Button } from '../../components/ui.tsx';
import type { Topic } from '../../data/validation.ts';
import { labelPoint } from '../../map/labelPoint.ts';
import { padBounds, type Feedback } from '../../map/mapAdapter.ts';
import { MapView, type MapLabel } from '../../map/MapView.tsx';
import s from '../../app/app.module.css';

const NO_FEEDBACK: Feedback = { wrongIds: [], correctId: null };

/** Unscored exploration: names may be shown here, never inside a round. */
export function ExploreScreen({ topic, onBack, onRenderError }: { topic: Topic; onBack: () => void; onRenderError: () => void }) {
  const { t, locale } = useSettings();
  const [selected, setSelected] = useState<string | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const points = useMemo(() => new Map(topic.regions.map((r) => [r.id, labelPoint(r.geometry)])), [topic]);
  // Priority: the two cities first, then larger units (bbox size) before smaller ones.
  const order = useMemo(() => {
    const size = (b: number[]) => (b[2]! - b[0]!) * (b[3]! - b[1]!);
    const bbox = (r: Topic['regions'][number]) => {
      const rings = r.geometry.type === 'Polygon' ? [r.geometry.coordinates[0]!] : r.geometry.coordinates.map((p) => p[0]!);
      const xs = rings.flat().map((p) => p[0]); const ys = rings.flat().map((p) => p[1]);
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    };
    return [...topic.regions].sort((a, b) => (a.properties.kind === 'city' ? -1 : 0) - (b.properties.kind === 'city' ? -1 : 0) || size(bbox(b)) - size(bbox(a)));
  }, [topic]);
  const labels: MapLabel[] | null = useMemo(
    () => (showLabels ? order.map((r) => ({ id: r.id, text: r.properties.names[locale], point: points.get(r.id)! })) : null),
    [showLabels, order, locale, points],
  );
  const maxBounds = useMemo(() => padBounds(topic.manifest.bounds, 0.6), [topic]);
  const selectedName = selected ? topic.regions.find((r) => r.id === selected)?.properties.names[locale] : null;
  return (
    <div className={s.exploreLayout}>
      <h1>{t('explore.title')}</h1>
      <p className={s.note}>{t('explore.hint')}</p>
      <label className={s.toggle}>
        <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />
        <span>{t('explore.labels')}</span>
      </label>
      <div className={s.exploreMap}>
        <MapView topic={topic} name="explore" ariaLabel={t('game.map')} viewBounds={topic.manifest.bounds} maxBounds={maxBounds}
          selection={selected} feedback={NO_FEEDBACK} onSelect={setSelected} onError={onRenderError} labels={labels} />
      </div>
      <p className={s.feedback} aria-live="polite" data-testid="explore-selected">
        {selectedName ? t('explore.selectedName', { name: selectedName }) : t('explore.hint')}
      </p>
      <div className={s.actions}>
        <Button onClick={onBack}>{t('common.back')}</Button>
      </div>
    </div>
  );
}
