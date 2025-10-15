#!/usr/bin/env node

import type { BuildCatalogGraphOptions, CatalogGraphFilters } from '../../src/catalog/graph/builder.ts';

import { catalogBuildGraphCommand as catalogBuildGraphCommandJs } from './catalog-build-graph.js';

export interface CatalogBuildGraphCliOptions extends BuildCatalogGraphOptions {
  output?: string;
  overwrite?: boolean;
  stdout?: boolean;
  pretty?: boolean;
  silent?: boolean;
  filters?: CatalogGraphFilters;
}

type CatalogBuildGraphCommandSignature = (options?: CatalogBuildGraphCliOptions) => ReturnType<typeof catalogBuildGraphCommandJs>;

export const catalogBuildGraphCommand = catalogBuildGraphCommandJs as CatalogBuildGraphCommandSignature;

export default {
  catalogBuildGraphCommand
};
