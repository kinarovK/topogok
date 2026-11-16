// Test-only topic built from the synthetic sources of scripts/data/fixtures/make-mixed.ts (E2E build only).
import type { TopicConfig } from '../../../scripts/data/topic.ts';

const config: TopicConfig = {
  id: 'test-mixed',
  dataVersion: '2026.11.16.1',
  title: { hu: 'Teszttéma (vegyes)', uk: 'Тестова тема (змішана)' },
  source: process.env['TOPOGOK_MIXED_SOURCE'] ?? 'build/fixtures/mixed/folder',
  layerTitles: {
    orszagok: { hu: 'Országok', uk: 'Країни' },
    folyok: { hu: 'Folyók', uk: 'Річки' },
    pontok: { hu: 'Pontok', uk: 'Точки' },
  },
  coverage: ['orszagok'],
  provenance: { source: 'synthetic test data', sourceUrl: null, license: null, licenseUrl: null, status: 'unverified' },
};
export default config;
