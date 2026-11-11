import type { StyleSpecification } from 'maplibre-gl';
import type { ResolvedTheme } from '../app/settings.tsx';
import type { CountryFeature, RegionFeature } from '../data/validation.ts';

/** Map colours; values mirror src/styles/tokens.css. */
export const MAP_COLORS: Record<ResolvedTheme, {
  background: string; country: string; countryLine: string; region: string; ocean: string; regionLine: string;
  selected: string; selectedLine: string; wrong: string; wrongLine: string; correct: string; correctLine: string;
}> = {
  light: {
    background: '#EDF2F6', country: '#D3D7DD', countryLine: '#3D4756', region: '#E5DFD2', ocean: '#C7DDF0', regionLine: '#66717F',
    selected: '#9FC5FF', selectedLine: '#1855B6', wrong: '#F4B3AE', wrongLine: '#A32222', correct: '#A9DDB7', correctLine: '#176238',
  },
  dark: {
    background: '#111E2B', country: '#2B3543', countryLine: '#D5DCE5', region: '#414B59', ocean: '#1E3A55', regionLine: '#A5B0BD',
    selected: '#315C91', selectedLine: '#8FB8FF', wrong: '#703C42', wrongLine: '#FFB4AB', correct: '#285C45', correctLine: '#A0E7B5',
  },
};

export const LAYER_REGIONS_FILL = 'regions-fill';

const state = (name: string) => ['boolean', ['feature-state', name], false] as const;

export function fillColor(theme: ResolvedTheme) {
  const c = MAP_COLORS[theme];
  const base = ['case', ['==', ['get', 'kind'], 'ocean'], c.ocean, c.region];
  return ['case', state('correct'), c.correct, state('wrong'), c.wrong, state('selected'), c.selected, base] as unknown as string;
}

export function highlightLineColor(theme: ResolvedTheme) {
  const c = MAP_COLORS[theme];
  return ['case', state('correct'), c.correctLine, state('wrong'), c.wrongLine, c.selectedLine] as unknown as string;
}

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
      { id: LAYER_REGIONS_FILL, type: 'fill', source: 'regions', paint: { 'fill-color': fillColor(theme), 'fill-antialias': true } },
      { id: 'regions-line', type: 'line', source: 'regions', paint: { 'line-color': c.regionLine, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.6, 8, 1.2, 11, 1.8] } },
      { id: 'country-line', type: 'line', source: 'country', paint: { 'line-color': c.countryLine, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1.2, 9, 2.2] } },
      { id: 'regions-highlight', type: 'line', source: 'regions', paint: { 'line-color': highlightLineColor(theme), 'line-width': highlightLineWidth } },
    ],
  };
}
