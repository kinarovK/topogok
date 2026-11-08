import { Map as MlMap, setWorkerUrl, type LngLatBoundsLike } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { ResolvedTheme } from '../app/settings.tsx';
import type { Bounds, CountryFeature, RegionFeature, RegionKind } from '../data/validation.ts';
import { pickFeatureId } from './hitTest.ts';
import { buildStyle, fillColor, highlightLineColor, LAYER_REGIONS_FILL, MAP_COLORS } from './mapStyle.ts';

// The worker is bundled from our own origin (CSP worker-src 'self'), not derived from the chunk URL.
setWorkerUrl(workerUrl);

export type Feedback = { wrongIds: readonly string[]; correctId: string | null };

export type MapAdapterOptions = {
  container: HTMLElement;
  country: CountryFeature;
  regions: RegionFeature[];
  theme: ResolvedTheme;
  viewBounds: Bounds;
  maxBounds: Bounds;
  onSelect: (featureId: string) => void;
  onReady: () => void;
  onError: (error: unknown) => void;
};

export type MapAdapter = {
  setSelection: (id: string | null) => void;
  setFeedback: (f: Feedback) => void;
  resetView: () => void;
  zoomBy: (delta: number) => void;
  setTheme: (t: ResolvedTheme) => void;
  resize: () => void;
  project: (lngLat: [number, number]) => { x: number; y: number };
  onMove: (fn: () => void) => () => void;
  destroy: () => void;
};

/**
 * Pan limit around a view: both axes are widened by `ratio` of the larger side, so a tall phone
 * viewport can still zoom out far enough to show the whole view (MapLibre keeps the viewport
 * inside maxBounds, which would otherwise force a zoom-in on narrow screens).
 */
export function padBounds([w, s, e, n]: Bounds, ratio: number): Bounds {
  const d = Math.max(e - w, n - s) * ratio;
  return [w - d, Math.max(-85, s - d), e + d, Math.min(85, n + d)];
}

export function createMapAdapter(o: MapAdapterOptions): MapAdapter {
  const kinds = new Map<string, RegionKind>(o.regions.map((r) => [r.id, r.properties.kind]));
  const allowed = new Set(kinds.keys());
  let map: MlMap;
  try {
    map = new MlMap({
      container: o.container,
      style: buildStyle(o.theme, o.country, o.regions),
      bounds: o.viewBounds as LngLatBoundsLike,
      fitBoundsOptions: { padding: 12 },
      maxBounds: o.maxBounds as LngLatBoundsLike,
      renderWorldCopies: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: false,
      maxPitch: 0,
      fadeDuration: 0,
    });
  } catch (e) {
    o.onError(e);
    return inertAdapter();
  }
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();

  let ready = false;
  let selection: string | null = null;
  let feedback: Feedback = { wrongIds: [], correctId: null };
  let painted = new Set<string>();

  const apply = () => {
    if (!ready) return;
    for (const id of painted) map.setFeatureState({ source: 'regions', id }, { selected: false, wrong: false, correct: false });
    painted = new Set();
    const set = (id: string, st: Record<string, boolean>) => { map.setFeatureState({ source: 'regions', id }, st); painted.add(id); };
    for (const id of feedback.wrongIds) set(id, { wrong: true });
    if (feedback.correctId) set(feedback.correctId, { correct: true });
    if (selection && !feedback.wrongIds.includes(selection) && selection !== feedback.correctId) set(selection, { selected: true });
  };

  let theme = o.theme;
  const applyTheme = () => {
    const c = MAP_COLORS[theme];
    map.setPaintProperty('background', 'background-color', c.background);
    map.setPaintProperty('country-fill', 'fill-color', c.country);
    map.setPaintProperty(LAYER_REGIONS_FILL, 'fill-color', fillColor(theme));
    map.setPaintProperty('regions-line', 'line-color', c.regionLine);
    map.setPaintProperty('country-line', 'line-color', c.countryLine);
    map.setPaintProperty('regions-highlight', 'line-color', highlightLineColor(theme));
  };

  map.on('load', () => { ready = true; if (theme !== o.theme) applyTheme(); apply(); o.onReady(); });
  map.on('error', (e) => { if (!ready) o.onError(e.error); });
  map.on('click', (e) => {
    const hits = map.queryRenderedFeatures(e.point, { layers: [LAYER_REGIONS_FILL] })
      .map((f) => ({ id: String(f.properties?.['id'] ?? ''), kind: kinds.get(String(f.properties?.['id'] ?? '')) ?? 'oblast' }));
    const id = pickFeatureId(hits, allowed);
    if (id) o.onSelect(id); // empty hit: keep the current selection
  });
  map.on('mousemove', LAYER_REGIONS_FILL, () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', LAYER_REGIONS_FILL, () => { map.getCanvas().style.cursor = ''; });

  const ro = new ResizeObserver(() => map.resize());
  ro.observe(o.container);

  return {
    setSelection(id) { selection = id; apply(); },
    setFeedback(f) { feedback = { wrongIds: [...f.wrongIds], correctId: f.correctId }; apply(); },
    resetView() { map.fitBounds(o.viewBounds as LngLatBoundsLike, { padding: 12, animate: false }); },
    zoomBy(delta) { map.easeTo({ zoom: map.getZoom() + delta, duration: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 200 }); },
    setTheme(t) {
      if (t === theme) return;
      theme = t;
      if (ready) applyTheme();
    },
    resize() { map.resize(); },
    project(lngLat) { const p = map.project(lngLat); return { x: p.x, y: p.y }; },
    onMove(fn) { map.on('move', fn); map.on('resize', fn); return () => { map.off('move', fn); map.off('resize', fn); }; },
    destroy() { ro.disconnect(); map.remove(); },
  };
}

function inertAdapter(): MapAdapter {
  const noop = () => {};
  return { setSelection: noop, setFeedback: noop, resetView: noop, zoomBy: noop, setTheme: noop, resize: noop, project: () => ({ x: 0, y: 0 }), onMove: () => noop, destroy: noop };
}
