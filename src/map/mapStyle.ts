import type { StyleSpecification } from 'maplibre-gl';
import type { ResolvedTheme } from '../app/settings.tsx';
import type { CountryFeature, RegionFeature } from '../data/validation.ts';

/** Map colours; values mirror src/styles/tokens.css. */
export const MAP_COLORS: Record<ResolvedTheme, {
  background: string; country: string; countryLine: string; region: string; ocean: string; regionLine: string;
  disabled: string; selected: string; selectedLine: string; wrong: string; wrongLine: string; correct: string; correctLine: string;
  river: string; halo: string; point: string;
}> = {
  light: {
    background: '#EDF2F6', country: '#D3D7DD', countryLine: '#3D4756', region: '#E5DFD2', ocean: '#C7DDF0', regionLine: '#66717F', disabled: '#C4C9D0',
    selected: '#9FC5FF', selectedLine: '#1855B6', wrong: '#F4B3AE', wrongLine: '#A32222', correct: '#A9DDB7', correctLine: '#176238',
    river: '#2F78C4', halo: '#FFFFFF', point: '#3D4756',
  },
  dark: {
    background: '#111E2B', country: '#2B3543', countryLine: '#D5DCE5', region: '#414B59', ocean: '#1E3A55', regionLine: '#A5B0BD', disabled: '#252D38',
    selected: '#315C91', selectedLine: '#8FB8FF', wrong: '#703C42', wrongLine: '#FFB4AB', correct: '#285C45', correctLine: '#A0E7B5',
    river: '#6CB2FF', halo: '#111E2B', point: '#E6EBF1',
  },
};

export const LAYER_REGIONS_FILL = 'regions-fill';
export const LAYER_LINES = 'lines';
export const LAYER_POINTS = 'points';

/** Mixed topics (0005): which features each layer draws; packages without geomType are areas. */
const geomIs = (t: 'area' | 'line' | 'point') => ['==', ['coalesce', ['get', 'geomType'], 'area'], t] as never;
const anyState = ['any', ['boolean', ['feature-state', 'correct'], false], ['boolean', ['feature-state', 'wrong'], false], ['boolean', ['feature-state', 'selected'], false]];

const state = (name: string) => ['boolean', ['feature-state', name], false] as const;

export function fillColor(theme: ResolvedTheme) {
  const c = MAP_COLORS[theme];
  const base = ['case', ['==', ['get', 'kind'], 'ocean'], c.ocean, c.region];
  // F4: an area the teacher switched off is neutral grey and never highlighted.
  return ['case', state('disabled'), c.disabled, state('correct'), c.correct, state('wrong'), c.wrong, state('selected'), c.selected, base] as unknown as string;
}

export function highlightLineColor(theme: ResolvedTheme) {
  const c = MAP_COLORS[theme];
  return ['case', state('correct'), c.correctLine, state('wrong'), c.wrongLine, c.selectedLine] as unknown as string;
}

/** Lines and points: base colour, or the highlight colour of their state. */
export function thinColor(theme: ResolvedTheme, base: 'river' | 'point') {
  const c = MAP_COLORS[theme];
  return ['case', state('disabled'), c.disabled, state('correct'), c.correctLine, state('wrong'), c.wrongLine, state('selected'), c.selectedLine, c[base]] as unknown as string;
}
// Zoom interpolation must be the outermost expression; the state decides the value at each stop.
const byState = (on: number, off: number) => ['case', anyState, on, off];
const lineWidth = ['interpolate', ['linear'], ['zoom'], 2, byState(5, 2.5), 8, byState(7, 4)] as unknown as number;
const haloWidth = ['interpolate', ['linear'], ['zoom'], 2, byState(8, 5.5), 8, byState(10, 7)] as unknown as number;
const pointRadius = ['interpolate', ['linear'], ['zoom'], 2, byState(8, 5), 8, byState(9, 6.5)] as unknown as number;
/** A ring around a highlighted point, so a small target is still clearly marked. */
const ringWidth = ['case', anyState, 3, 0] as unknown as number;

export const highlightLineWidth = ['case', ['any', state('correct'), state('wrong'), state('selected')], 3, 0] as unknown as number;

/** Self-contained style: no tiles, glyphs, sprites or any external URL. */
export function buildStyle(theme: ResolvedTheme, country: CountryFeature, regions: RegionFeature[]): StyleSpecification {
  const c = MAP_COLORS[theme];
  return {
    version: 8,
    sources: {
      country: { type: 'geojson', data: { type: 'FeatureCollection', features: [country] } as never },
      regions: { type: 'geojson', data: { type: 'FeatureCollection', features: regions } as never, promoteId: 'id' },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': c.background } },
      { id: 'country-fill', type: 'fill', source: 'country', paint: { 'fill-color': c.country } },
      { id: LAYER_REGIONS_FILL, type: 'fill', source: 'regions', filter: geomIs('area'), paint: { 'fill-color': fillColor(theme), 'fill-antialias': true } },
      { id: 'regions-line', type: 'line', source: 'regions', filter: geomIs('area'), paint: { 'line-color': c.regionLine, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.6, 8, 1.2, 11, 1.8] } },
      { id: 'country-line', type: 'line', source: 'country', paint: { 'line-color': c.countryLine, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1.2, 9, 2.2] } },
      { id: 'regions-highlight', type: 'line', source: 'regions', filter: geomIs('area'), paint: { 'line-color': highlightLineColor(theme), 'line-width': highlightLineWidth } },
      // Mixed topics: lines (with a halo so they stay visible on any fill), then points on top.
      { id: 'lines-halo', type: 'line', source: 'regions', filter: geomIs('line'), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': c.halo, 'line-opacity': 0.8, 'line-width': haloWidth } },
      { id: LAYER_LINES, type: 'line', source: 'regions', filter: geomIs('line'), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': thinColor(theme, 'river'), 'line-width': lineWidth } },
      { id: 'points-ring', type: 'circle', source: 'regions', filter: geomIs('point'), paint: { 'circle-radius': 14, 'circle-opacity': 0, 'circle-stroke-width': ringWidth, 'circle-stroke-color': thinColor(theme, 'point') } },
      { id: LAYER_POINTS, type: 'circle', source: 'regions', filter: geomIs('point'), paint: { 'circle-radius': pointRadius, 'circle-color': thinColor(theme, 'point'), 'circle-stroke-width': 2, 'circle-stroke-color': c.halo } },
    ],
  };
}
