import type { CanonicalGraph } from '../../src/visualization/drawio/exporter.ts';

import { catalogViewCommand as catalogViewCommandJs } from './catalog-view.js';

export interface CatalogViewOptions {
  workspace?: string;
  format?: 'pretty' | 'json';
}

export interface CatalogViewResult {
  workspace: string;
  protocol: CanonicalGraph['nodes'][number];
  manifest: Record<string, unknown>;
}

export const catalogViewCommand = catalogViewCommandJs as (
  identifier: string,
  options?: CatalogViewOptions
) => Promise<CatalogViewResult>;

export default {
  catalogViewCommand
};
