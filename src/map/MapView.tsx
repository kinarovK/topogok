import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSettings } from '../app/settings.tsx';
import { getTapBuffer } from '../app/appSettings.ts';
import type { Bounds, Position, Topic } from '../data/validation.ts';
import { createMapAdapter, type Feedback, type MapAdapter } from './mapAdapter.ts';
import s from './map.module.css';

/** minZoom: below this zoom the label does not fit inside its unit and stays hidden; maxWidth: wrap width in px (world topic). */
export type MapLabel = { id: string; text: string; point: Position; minZoom?: number; maxWidth?: number; /** px: point labels sit above their dot. */ offsetY?: number };

type Props = {
  topic: Topic;
  name: string;
  ariaLabel: string;
  viewBounds: Bounds;
  maxBounds: Bounds;
  selection: string | null;
  feedback: Feedback;
  onSelect: (id: string) => void;
  disabledIds?: ReadonlySet<string>;
  onReady?: () => void;
  onError: (e: unknown) => void;
  resetKey?: number;
  controls?: boolean;
  labels?: MapLabel[] | null;
  className?: string;
};

declare global {
  interface Window { __topogokE2E?: { maps: Record<string, { project: (p: [number, number]) => { x: number; y: number }; isMoving: () => boolean; container: HTMLElement }> } }
}

export function MapView(p: Props) {
  const { theme, t } = useSettings();
  const containerRef = useRef<HTMLDivElement>(null);
  const adapterRef = useRef<MapAdapter | null>(null);
  const cb = useRef(p);
  useLayoutEffect(() => { cb.current = p; });
  const [ready, setReady] = useState(false);
  const [moveTick, setMoveTick] = useState(0);
  const [positions, setPositions] = useState<Array<{ id: string; text: string; x: number; y: number; hidden: boolean; maxWidth: number | undefined }>>([]);

  useLayoutEffect(() => {
    const container = containerRef.current!;
    const adapter = createMapAdapter({
      container, country: p.topic.country, regions: p.topic.regions, theme, viewBounds: p.viewBounds, maxBounds: p.maxBounds, disabledIds: p.disabledIds, tapBuffer: getTapBuffer,
      onSelect: (id) => cb.current.onSelect(id),
      onReady: () => { setReady(true); cb.current.onReady?.(); },
      onError: (e) => cb.current.onError(e),
    });
    adapterRef.current = adapter;
    if (import.meta.env.MODE === 'e2e') {
      window.__topogokE2E ??= { maps: {} };
      window.__topogokE2E.maps[p.name] = { project: adapter.project, isMoving: adapter.isMoving, container };
    }
    const off = adapter.onMove(() => setMoveTick((n) => n + 1));
    return () => {
      off();
      adapter.destroy();
      adapterRef.current = null;
      if (import.meta.env.MODE === 'e2e' && window.__topogokE2E) delete window.__topogokE2E.maps[p.name];
    };
    // The map instance lives for the component's lifetime; props below are pushed imperatively.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { adapterRef.current?.setTheme(theme); }, [theme]);
  useEffect(() => { adapterRef.current?.setSelection(p.selection); }, [p.selection, ready]);
  useEffect(() => { adapterRef.current?.setFeedback(p.feedback); }, [p.feedback, ready]);
  useEffect(() => { if (p.resetKey !== undefined) adapterRef.current?.resetView(); }, [p.resetKey]);

  const labels = ready && p.labels ? p.labels : null;
  useLayoutEffect(() => {
    const a = adapterRef.current;
    if (!a || !labels) { setPositions([]); return; }
    // Greedy collision handling in the given priority order; hidden labels reappear when zooming in.
    const placed: Array<[number, number, number, number]> = [];
    const zoom = a.getZoom();
    setPositions(labels.map((l) => {
      const q = a.project(l.point as [number, number]);
      const x = q.x; const y = q.y + (l.offsetY ?? 0);
      const maxW = l.maxWidth ?? 120;
      const lines = Math.ceil((l.text.length * 6.6 + 8) / maxW);
      const w = Math.min(maxW, l.text.length * 6.6 + 8) / 2 + 2;
      const h = (lines * 14.4 + 2) / 2 + 1;
      const box: [number, number, number, number] = [x - w, y - h, x + w, y + h];
      const hidden = (l.minZoom !== undefined && zoom < l.minZoom) || placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]);
      if (!hidden) placed.push(box);
      return { id: l.id, text: l.text, x, y, hidden, maxWidth: l.maxWidth };
    }));
  }, [labels, moveTick]);
  return (
    <div className={[s.wrap, p.className ?? ''].join(' ')}>
      <div ref={containerRef} className={s.map} role="application" aria-label={p.ariaLabel} data-map={p.name} data-ready={ready ? 'true' : 'false'} />
      {labels && (
        <div className={s.labels} aria-hidden="true">
          {positions.map((l) => (
            <span key={l.id} className={s.label} data-label-id={l.id} data-hidden={l.hidden ? 'true' : undefined} style={{ transform: `translate(${l.x}px, ${l.y}px) translate(-50%, -50%)`, visibility: l.hidden ? 'hidden' : 'visible', ...(l.maxWidth ? { maxWidth: `${l.maxWidth}px` } : {}) }}>{l.text}</span>
          ))}
        </div>
      )}
      {p.controls !== false && (
        <div className={s.controls}>
          <button type="button" className={s.control} onClick={() => adapterRef.current?.zoomBy(1)} aria-label={t('game.zoomIn')} title={t('game.zoomIn')}>+</button>
          <button type="button" className={s.control} onClick={() => adapterRef.current?.zoomBy(-1)} aria-label={t('game.zoomOut')} title={t('game.zoomOut')}>−</button>
          <button type="button" className={s.control} onClick={() => adapterRef.current?.resetView()} aria-label={t('game.resetView')} title={t('game.resetView')}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
              <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      )}
      {!ready && <p className={s.loading}>{t('game.loadingMap')}</p>}
    </div>
  );
}
