import { Map as MlMap, setWorkerUrl, type LngLatBoundsLike } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { ResolvedTheme } from '../app/settings.tsx';
import type { Bounds, CountryFeature, RegionFeature, RegionKind } from '../data/validation.ts';
import { DEFAULT_TAP_BUFFER, distanceToPath, pickTarget, type NearCandidate, type ScreenPoint } from './hitTest.ts';
import { geometryArea, geometryBounds } from './labelPoint.ts';
import { buildStyle, fillColor, highlightLineColor, LAYER_LINES, LAYER_POINTS, LAYER_REGIONS_FILL, isMixed, paletteFor, thinColor } from './mapStyle.ts';

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
  /** F4: areas that are shown but cannot be selected (not asked by the teacher). */
  disabledIds?: ReadonlySet<string> | undefined;
  /** Tap buffer in CSS px for lines and points (0005 §5); read at every tap, so a changed setting applies at once. */
  tapBuffer?: (() => { touch: number; mouse: number }) | undefined;
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
  isMoving: () => boolean;
  getZoom: () => number;
  onMove: (fn: () => void) => () => void;
  destroy: () => void;
};

/**
 * Pan limit around a view: both axes are widened by `ratio` of the larger side, so a tall phone
 * viewport can still zoom out far enough to show the whole view (MapLibre keeps the viewport
 * inside maxBounds, which would otherwise force a zoom-in on narrow screens).
 */
/** Fit padding: the zoom/reset controls sit in a column on the right edge and must never cover the country. */
export const VIEW_PADDING = { top: 12, bottom: 12, left: 12, right: 64 };

export function padBounds([w, s, e, n]: Bounds, ratio: number): Bounds {
  const d = Math.max(e - w, n - s) * ratio;
  return [w - d, Math.max(-85, s - d), e + d, Math.min(85, n + d)];
}

export function createMapAdapter(o: MapAdapterOptions): MapAdapter {
  const mixed = isMixed(o.regions);
  const kinds = new Map<string, RegionKind>(o.regions.map((r) => [r.id, r.properties.kind]));
  const sizes = new Map<string, number>(o.regions.map((r) => [r.id, geometryArea(r.geometry)]));
  const disabled = o.disabledIds ?? new Set<string>();
  const allowed = new Set([...kinds.keys()].filter((id) => !disabled.has(id)));
  // Lines and points of mixed topics, with their full geometry for exact screen distances.
  const thin = o.regions.filter((r) => r.properties.geomType === 'line' || r.properties.geomType === 'point').map((r) => {
    const g = r.geometry;
    const paths = g.type === 'Point' ? [[g.coordinates]] : g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
    return { id: r.id, paths: paths as Array<Array<[number, number]>>, bbox: geometryBounds(g) };
  });
  const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  const bufferPx = () => { const b = o.tapBuffer?.() ?? DEFAULT_TAP_BUFFER; return coarse ? b.touch : b.mouse; };
  let map: MlMap;
  try {
    map = new MlMap({
      container: o.container,
      style: buildStyle(o.theme, o.country, o.regions),
      bounds: o.viewBounds as LngLatBoundsLike,
      fitBoundsOptions: { padding: VIEW_PADDING },
      // A pan limit as wide as the world makes MapLibre's camera constraint fail (no valid camera),
      // so whole-world topics pan freely; the reset button always returns to the view.
      ...(o.maxBounds[2] - o.maxBounds[0] < 300 ? { maxBounds: o.maxBounds as LngLatBoundsLike } : {}),
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
    const c = paletteFor(theme, mixed);
    map.setPaintProperty('background', 'background-color', c.background);
    map.setPaintProperty('country-fill', 'fill-color', c.country);
    map.setPaintProperty(LAYER_REGIONS_FILL, 'fill-color', fillColor(theme, mixed));
    map.setPaintProperty('regions-line', 'line-color', c.regionLine);
    map.setPaintProperty('country-line', 'line-color', c.countryLine);
    map.setPaintProperty('regions-highlight', 'line-color', highlightLineColor(theme, mixed));
    map.setPaintProperty('lines-halo', 'line-color', c.halo);
    map.setPaintProperty(LAYER_LINES, 'line-color', thinColor(theme, 'river', mixed));
    map.setPaintProperty('points-ring', 'circle-stroke-color', thinColor(theme, 'point', mixed));
    map.setPaintProperty(LAYER_POINTS, 'circle-color', thinColor(theme, 'point', mixed));
    map.setPaintProperty(LAYER_POINTS, 'circle-stroke-color', c.halo);
  };

  map.on('load', () => { for (const id of disabled) map.setFeatureState({ source: 'regions', id }, { disabled: true }); ready = true; if (theme !== o.theme) applyTheme(); apply(); o.onReady(); });
  map.on('error', (e) => { if (!ready) o.onError(e.error); });
  const pick = (pt: ScreenPoint): string | null => {
    const areas = map.queryRenderedFeatures([pt.x, pt.y], { layers: [LAYER_REGIONS_FILL] })
      .map((f) => { const id = String(f.properties?.['id'] ?? ''); return { id, kind: kinds.get(id) ?? 'oblast', area: sizes.get(id) }; });
    const buffer = bufferPx();
    const near: NearCandidate[] = [];
    for (const f of thin) {
      if (!allowed.has(f.id)) continue;
      const a = map.project([f.bbox[0], f.bbox[1]]); const b = map.project([f.bbox[2], f.bbox[3]]);
      if (pt.x < Math.min(a.x, b.x) - buffer || pt.x > Math.max(a.x, b.x) + buffer || pt.y < Math.min(a.y, b.y) - buffer || pt.y > Math.max(a.y, b.y) + buffer) continue;
      let d = Infinity;
      for (const path of f.paths) d = Math.min(d, distanceToPath(pt, path.map((p) => map.project(p))));
      near.push({ id: f.id, distance: d, point: f.paths.length === 1 && f.paths[0]!.length === 1 });
    }
    return pickTarget(areas, near, allowed, buffer);
  };
  map.on('click', (e) => {
    const id = pick(e.point);
    if (id) o.onSelect(id); // empty hit: keep the current selection
  });
  map.on('mousemove', (e) => { map.getCanvas().style.cursor = pick(e.point) ? 'pointer' : ''; });
  map.on('mouseout', () => { map.getCanvas().style.cursor = ''; });

  /** Practice "show me": a line or point outside the view is brought into it. */
  const reveal = (id: string) => {
    const f = thin.find((x) => x.id === id);
    if (!f) return;
    const v = map.getBounds();
    const inside = f.bbox[0] >= v.getWest() && f.bbox[2] <= v.getEast() && f.bbox[1] >= v.getSouth() && f.bbox[3] <= v.getNorth();
    if (!inside) map.easeTo({ center: [(f.bbox[0] + f.bbox[2]) / 2, (f.bbox[1] + f.bbox[3]) / 2], duration: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 300 });
  };

  const ro = new ResizeObserver(() => map.resize());
  ro.observe(o.container);

  return {
    setSelection(id) { selection = id; apply(); },
    setFeedback(f) { feedback = { wrongIds: [...f.wrongIds], correctId: f.correctId }; apply(); if (ready && f.correctId) reveal(f.correctId); },
    resetView() { map.fitBounds(o.viewBounds as LngLatBoundsLike, { padding: VIEW_PADDING, animate: false }); },
    zoomBy(delta) { map.easeTo({ zoom: map.getZoom() + delta, duration: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 200 }); },
    setTheme(t) {
      if (t === theme) return;
      theme = t;
      if (ready) applyTheme();
    },
    resize() { map.resize(); },
    project(lngLat) { const p = map.project(lngLat); return { x: p.x, y: p.y }; },
    isMoving() { return map.isMoving() || map.isZooming(); },
    getZoom() { return map.getZoom(); },
    onMove(fn) { map.on('move', fn); map.on('resize', fn); return () => { map.off('move', fn); map.off('resize', fn); }; },
    destroy() { ro.disconnect(); map.remove(); },
  };
}

function inertAdapter(): MapAdapter {
  const noop = () => {};
  return { setSelection: noop, setFeedback: noop, resetView: noop, zoomBy: noop, setTheme: noop, resize: noop, project: () => ({ x: 0, y: 0 }), isMoving: () => false, getZoom: () => 0, onMove: () => noop, destroy: noop };
}
